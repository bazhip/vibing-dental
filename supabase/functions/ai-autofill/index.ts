// AI autofill proxy — the browser sends the built request (system, tools,
// messages) and this function forwards it to Anthropic using the baked-in
// server key, so no key ever ships to the client. verify_jwt on.
//
// Gated to Pro practices (server-side). The model is chosen site-wide in
// the admin panel (app_config.ai_model), not by the client. Every call's
// token usage is logged to ai_usage for the admin dashboard.
//
// Requires the ANTHROPIC_API_KEY edge-function secret (dashboard).

import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // AI autofill is a Pro-plan feature — enforce server-side.
  const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', caller.id).maybeSingle();
  const practiceId = prof?.practice_id ?? null;
  let plan = 'basic';
  if (practiceId) {
    const { data: prac } = await admin.from('practices').select('plan').eq('id', practiceId).maybeSingle();
    plan = prac?.plan ?? 'basic';
  }
  if (plan !== 'pro') return json({ error: 'AI autofill is a Pro-plan feature.' }, 403);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'AI is not configured yet.' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  // The model is a site setting, not client-chosen.
  const { data: cfg } = await admin.from('app_config').select('ai_model').eq('id', 1).maybeSingle();
  const model = cfg?.ai_model || DEFAULT_MODEL;

  const settings: ModelSettings = MODEL_SETTINGS[model] ?? { extra: {}, thinks: false, fallbacks: false };
  // max_tokens: 0 is a cache pre-warm (prefill only) — pass it through.
  let maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 1024;
  if (maxTokens > 0 && settings.thinks) maxTokens = Math.max(maxTokens, 4096);

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
  if (!resp.ok) return json({ error: `AI request failed: ${text}` }, 502);

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
    return json({ error: 'AI returned an unreadable response.' }, 502);
  }

  // Log usage (best-effort — never fail the call over telemetry).
  const u = data.usage ?? {};
  admin
    .from('ai_usage')
    .insert({
      user_id: caller.id,
      practice_id: practiceId,
      // The model that actually served it (differs after a fallback).
      model: data.model ?? model,
      // Cache writes are billed like input (×1.25) — count them as input.
      input_tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
    })
    .then(() => {})
    .catch(() => {});

  return json({ content: data.content ?? [], usage: data.usage ?? {}, model: data.model ?? model });
});
