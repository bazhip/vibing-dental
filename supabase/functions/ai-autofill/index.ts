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
import { PostHog } from 'npm:posthog-node';

const posthogKey = Deno.env.get('POSTHOG_API_KEY')?.trim();
const posthogHost = Deno.env.get('POSTHOG_HOST')?.trim();
const posthog = posthogKey && posthogHost
  ? new PostHog(posthogKey, {
    host: posthogHost,
    privacyMode: false,
    enableExceptionAutocapture: false,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2000,
    fetchRetryCount: 0,
  })
  : undefined;

if (!posthog && Deno.env.get('ENV') !== 'production') {
  const missingVariable = posthogKey ? 'POSTHOG_HOST' : 'POSTHOG_API_KEY';
  console.warn(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

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
const AI_ID_CHARS = /[^A-Za-z0-9\-_~.@()!'|:]/g;

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AiObservabilityContext {
  session_id?: unknown;
  trace_id?: unknown;
}

const aiIdentifier = (value: unknown, fallback: string) => {
  const normalized = typeof value === 'string' ? value.replace(AI_ID_CHARS, '-').slice(0, 200) : '';
  return normalized || fallback;
};

function captureAiGeneration(
  callerId: string,
  sessionId: string,
  traceId: string,
  payload: Record<string, unknown>,
  model: string,
  attempt: { latency: number; status?: number; output?: unknown; usage?: AnthropicUsage; error?: string },
) {
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: callerId,
      event: '$ai_generation',
      properties: {
        $ai_trace_id: traceId,
        $ai_session_id: sessionId,
        $ai_span_id: crypto.randomUUID(),
        $ai_parent_id: traceId,
        $ai_span_name: 'anthropic_messages_create',
        $ai_model: model,
        $ai_provider: 'anthropic',
        $ai_input: [
          ...(Array.isArray(payload.system) ? payload.system.map((content) => ({ role: 'system', content })) : []),
          ...(Array.isArray(payload.messages) ? payload.messages : []),
        ],
        $ai_input_tokens: attempt.usage?.input_tokens,
        $ai_output_choices: attempt.output === undefined ? undefined : [{ role: 'assistant', content: attempt.output }],
        $ai_output_tokens: attempt.usage?.output_tokens,
        $ai_cache_read_input_tokens: attempt.usage?.cache_read_input_tokens,
        $ai_cache_creation_input_tokens: attempt.usage?.cache_creation_input_tokens,
        $ai_latency: attempt.latency,
        $ai_http_status: attempt.status,
        $ai_max_tokens: payload.max_tokens,
        $ai_tools: payload.tools,
        $ai_is_error: Boolean(attempt.error),
        $ai_error: attempt.error,
      },
    });
  } catch {
    // Observability must not interrupt an otherwise successful LLM call.
  }
}

async function flushAiEvents() {
  if (!posthog) return;
  try {
    await Promise.race([
      posthog.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch {
    // The edge function must still return the Anthropic result on telemetry failure.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // Free beta: open to every signed-in account (no plan check). The
  // practice is still looked up so usage is attributed in ai_usage.
  const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', caller.id).maybeSingle();
  const practiceId = prof?.practice_id ?? null;

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'AI is not configured yet.' }, 503);

  // Abuse guards — every signed-in account can use AI during the free
  // beta, so cap request size, response size and per-user call rate
  // (generous for dictation: one call per spoken phrase).
  const raw = await req.text();
  if (raw.length > REVIEW_MAX_CHARS) return json({ error: 'Request too large.' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const review = body.mode === 'review';
  if (!review && raw.length > LIVE_MAX_CHARS) return json({ error: 'Request too large.' }, 413);
  const observability = (body.ai_observability ?? {}) as AiObservabilityContext;
  const traceId = aiIdentifier(observability.trace_id, crypto.randomUUID());
  const sessionId = aiIdentifier(observability.session_id, `dictation-${caller.id}`);
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length !== 1 || (msgs[0] as { role?: string })?.role !== 'user') {
    return json({ error: 'Unsupported request.' }, 400);
  }
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [{ count: perMinute }, { count: perDay }] = await Promise.all([
    admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', caller.id).neq('model', 'deepgram-token').gte('created_at', since(60_000)),
    admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', caller.id).neq('model', 'deepgram-token').gte('created_at', since(86_400_000)),
  ]);
  if ((perMinute ?? 0) >= 40) return json({ error: 'Slow down a moment — too many AI requests in the last minute.' }, 429);
  if ((perDay ?? 0) >= 2000) return json({ error: 'Daily AI limit reached. It resets within 24 hours.' }, 429);

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

  const send = async () => {
    const startedAt = performance.now();
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return { resp, text: await resp.text(), latency: (performance.now() - startedAt) / 1000 };
    } catch (error) {
      captureAiGeneration(caller.id, sessionId, traceId, payload, model, {
        latency: (performance.now() - startedAt) / 1000,
        error: error instanceof Error ? error.name : 'Anthropic network error',
      });
      await flushAiEvents();
      throw error;
    }
  };
  let attempt = await send();
  // If the fallback option itself is rejected (beta changes, unsupported
  // combination), don't break autofill over it — retry once without.
  if (attempt.resp.status === 400 && settings.fallbacks) {
    captureAiGeneration(caller.id, sessionId, traceId, payload, model, {
      latency: attempt.latency,
      status: attempt.resp.status,
      error: 'Anthropic rejected the fallback option',
    });
    delete payload.fallbacks;
    delete headers['anthropic-beta'];
    attempt = await send();
  }
  if (!attempt.resp.ok) {
    captureAiGeneration(caller.id, sessionId, traceId, payload, model, {
      latency: attempt.latency,
      status: attempt.resp.status,
      error: `Anthropic request failed with status ${attempt.resp.status}`,
    });
    await flushAiEvents();
    return json({ error: `AI request failed: ${attempt.text}` }, 502);
  }

  let data: {
    content?: unknown;
    model?: string;
    usage?: AnthropicUsage;
  };
  try {
    data = JSON.parse(attempt.text);
  } catch {
    captureAiGeneration(caller.id, sessionId, traceId, payload, model, {
      latency: attempt.latency,
      status: attempt.resp.status,
      error: 'Anthropic returned an unreadable response',
    });
    await flushAiEvents();
    return json({ error: 'AI returned an unreadable response.' }, 502);
  }

  captureAiGeneration(caller.id, sessionId, traceId, payload, data.model ?? model, {
    latency: attempt.latency,
    status: attempt.resp.status,
    output: data.content ?? [],
    usage: data.usage,
  });

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

  await flushAiEvents();
  return json({ content: data.content ?? [], usage: data.usage ?? {}, model: data.model ?? model });
});
