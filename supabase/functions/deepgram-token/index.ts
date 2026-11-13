// Deepgram ephemeral key minter. The browser needs a key to open the
// streaming WebSocket, but must never hold the master key — so this
// function (verify_jwt on, any signed-in account) uses the baked-in master to create
// a short-lived, usage-scoped key and returns just that.
//
// Requires the DEEPGRAM_API_KEY edge-function secret (dashboard).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiError } from '../_shared/apiErrors.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const TTL_SECONDS = 90; // enough to start a session; the WS stays open after.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json(apiError('unauthorized'), 401);

  // Free beta: voice autofill is open to every signed-in account (no
  // plan check). Signed-in only — anonymous trial users get no token.

  // Abuse guard: each dictation start mints one token; cap per user.
  const { count: recent } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', caller.id).eq('model', 'deepgram-token')
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
  if ((recent ?? 0) >= 60) return json(apiError('dictation_rate_limit'), 429);

  const master = Deno.env.get('DEEPGRAM_API_KEY');
  if (!master) return json(apiError('voice_not_configured'), 503);

  // Deepgram's temporary-token grant: works with a standard API key (no
  // keys:write scope needed) and returns a short-lived bearer token the
  // browser uses to open the streaming socket.
  const grantResp = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${master}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
  });
  const grantText = await grantResp.text();
  if (!grantResp.ok) return json(apiError('voice_token_failed', { detail: grantText }), 502);
  let grant: { access_token?: string; expires_in?: number };
  try {
    grant = JSON.parse(grantText);
  } catch {
    return json(apiError('voice_unreadable'), 502);
  }
  if (!grant.access_token) return json(apiError('voice_no_token'), 502);

  // Log the mint (rate limiting + admin visibility). Best-effort.
  await admin.from('ai_usage').insert({ user_id: caller.id, model: 'deepgram-token', input_tokens: 0, output_tokens: 0 }).then(() => {}, () => {});

  // `kind: bearer` tells the client which WebSocket sub-protocol to use.
  return json({ token: grant.access_token, kind: 'bearer', expiresInSeconds: grant.expires_in ?? TTL_SECONDS });
});
