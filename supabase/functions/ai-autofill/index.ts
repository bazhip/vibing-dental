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

const DEFAULT_MODEL = 'claude-opus-4-8';

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

  const payload = {
    model,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 1024,
    system: body.system,
    tools: body.tools,
    messages: body.messages,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) return json({ error: `AI request failed: ${text}` }, 502);

  let data: {
    content?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
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
      model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
    })
    .then(() => {})
    .catch(() => {});

  return json({ content: data.content ?? [], usage: data.usage ?? {}, model });
});
