// AI autofill proxy — the browser sends the built request (system, tools,
// messages) and this function forwards it to Anthropic using the baked-in
// server key, so no key ever ships to the client. verify_jwt on.
//
// Open to every signed-in account during the free beta. The model is chosen site-wide in
// the admin panel (app_config.ai_model), not by the client. Every call's
// token usage is logged to ai_usage for the admin dashboard.
//
// Requires the ANTHROPIC_API_KEY edge-function secret (dashboard).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiError } from '../_shared/apiErrors.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Per-model request settings for a latency-sensitive extraction call.
// Keep in sync with AI_MODEL_CHOICES in src/constants/aiModels.ts.
//  - Opus 5.5: thinking can't be turned off; effort low keeps it quick.
//  - Sonnet 5.5: `between_tools` turns thinking off (needs effort ≤ high,
//    which the default satisfies).
//  - Haiku 5.5: thinking on by default; effort low keeps it short.
//  - Opus 4.8: no thinking unless asked for — send nothing extra.
// `fallbacks: "default"` re-runs a request a safety classifier declines
// on a suitable fallback model, inside the same call (Opus/Sonnet 5.5).
interface ModelSettings {
  extra: Record<string, unknown>;
  /** True when the model may emit thinking tokens, which count toward
   *  max_tokens — give it headroom. */
  thinks: boolean;
  fallbacks: boolean;
}
const MODEL_SETTINGS: Record<string, ModelSettings> = {
  'claude-opus-5-5':   { extra: { output_config: { effort: 'low' } }, thinks: true, fallbacks: true },
  'claude-sonnet-5-5': { extra: { thinking: { type: 'between_tools' } }, thinks: false, fallbacks: true },
  'claude-haiku-5-5':  { extra: { output_config: { effort: 'low' } }, thinks: true, fallbacks: false },
  'claude-opus-4-8':   { extra: {}, thinks: false, fallbacks: false },
};
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// The end-of-dictation check (body.mode === 'review') reads the whole
// transcript once, off the live path — accuracy over latency, so every
// model thinks at medium effort (Sonnet 5.5 runs adaptive thinking when
// no `thinking` is sent).
const REVIEW_SETTINGS: Record<string, ModelSettings> = {
  'claude-opus-5-5':   { extra: { output_config: { effort: 'medium' } }, thinks: true, fallbacks: true },
  'claude-sonnet-5-5': { extra: { output_config: { effort: 'medium' } }, thinks: true, fallbacks: true },
  'claude-haiku-5-5':  { extra: { output_config: { effort: 'medium' } }, thinks: true, fallbacks: false },
  'claude-opus-4-8':   { extra: { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } }, thinks: true, fallbacks: false },
};
const LIVE_MAX_CHARS = 120_000;
const REVIEW_MAX_CHARS = 400_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json(apiError('unauthorized'), 401);

  // Free beta: open to every signed-in account (no plan check). The
  // practice is still looked up so usage is attributed in ai_usage.
  const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', caller.id).maybeSingle();
  const practiceId = prof?.practice_id ?? null;

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json(apiError('ai_not_configured'), 503);

  // Abuse guards — every signed-in account can use AI during the free
  // beta, so cap request size, response size and per-user call rate
  // (generous for dictation: one call per spoken phrase).
  const raw = await req.text();
  if (raw.length > REVIEW_MAX_CHARS) return json(apiError('request_too_large'), 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const review = body.mode === 'review';
  // Which feature this call is for — logged with usage so cost can be
  // split by feature. Unknown values are dropped.
  const KINDS = ['live', 'review', 'owner_report', 'warmup'];
  const kind = typeof body.kind === 'string' && KINDS.includes(body.kind) ? body.kind : '';
  if (!review && raw.length > LIVE_MAX_CHARS) return json(apiError('request_too_large'), 413);
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length !== 1 || (msgs[0] as { role?: string })?.role !== 'user') {
    return json(apiError('unsupported_request'), 400);
  }
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [{ count: perMinute }, { count: perDay }] = await Promise.all([
    admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', caller.id).neq('model', 'deepgram-token').gte('created_at', since(60_000)),
    admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', caller.id).neq('model', 'deepgram-token').gte('created_at', since(86_400_000)),
  ]);
  if ((perMinute ?? 0) >= 40) return json(apiError('ai_rate_limit'), 429);
  if ((perDay ?? 0) >= 2000) return json(apiError('ai_daily_limit'), 429);

  // The model is a site setting, not client-chosen.
  const { data: cfg } = await admin.from('app_config').select('ai_model').eq('id', 1).maybeSingle();
  const model = cfg?.ai_model || DEFAULT_MODEL;

  const settings: ModelSettings =
    (review ? REVIEW_SETTINGS[model] : MODEL_SETTINGS[model]) ?? { extra: {}, thinks: false, fallbacks: false };
  // max_tokens: 0 is a cache pre-warm (prefill only) — pass it through.
  const cap = review ? 16_000 : 4096;
  let maxTokens = typeof body.max_tokens === 'number' ? Math.max(0, Math.min(cap, Math.floor(body.max_tokens))) : 1024;
  if (maxTokens > 0 && settings.thinks) maxTokens = Math.max(maxTokens, review ? 16_000 : 4096);

  const payload: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: body.system,
    tools: body.tools,
    messages: body.messages,
    ...settings.extra,
  };
  const headers: Record<string, string> = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (settings.fallbacks) {
    payload.fallbacks = 'default';
    headers['anthropic-beta'] = FALLBACK_BETA;
  }

  const send = () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let resp = await send();
  // If the fallback option itself is rejected (beta changes, unsupported
  // combination), don't break autofill over it — retry once without.
  if (resp.status === 400 && settings.fallbacks) {
    delete payload.fallbacks;
    delete headers['anthropic-beta'];
    resp = await send();
  }
  const text = await resp.text();
  if (!resp.ok) return json(apiError('ai_failed', { detail: text }), 502);

  let data: {
    content?: unknown;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  try {
    data = JSON.parse(text);
  } catch {
    return json(apiError('ai_unreadable'), 502);
  }

  // Log usage (best-effort — never fail the call over telemetry).
  const u = data.usage ?? {};
  const baseRow = {
    user_id: caller.id,
    practice_id: practiceId,
    // The model that actually served it (differs after a fallback).
    model: data.model ?? model,
    // Cache writes are billed like input (×1.25) — count them as input.
    input_tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
  };
  // kind / cache_write_tokens come from a later migration: if they aren't
  // there yet, log the row without them rather than losing it.
  admin
    .from('ai_usage')
    .insert({ ...baseRow, kind, cache_write_tokens: u.cache_creation_input_tokens ?? 0 })
    .then(({ error }) => (error ? admin.from('ai_usage').insert(baseRow) : null))
    .then(() => {}, () => {});

  return json({ content: data.content ?? [], usage: data.usage ?? {}, model: data.model ?? model });
});
