// Deepgram ephemeral key minter. The browser needs a key to open the
// streaming WebSocket, but must never hold the master key — so this
// function (verify_jwt on, Pro-gated) uses the baked-in master to create
// a short-lived, usage-scoped key and returns just that.
//
// Requires the DEEPGRAM_API_KEY edge-function secret (dashboard).

import { createClient } from 'npm:@supabase/supabase-js@2';

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
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // Voice autofill is Pro-only.
  const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', caller.id).maybeSingle();
  let plan = 'basic';
  if (prof?.practice_id) {
    const { data: prac } = await admin.from('practices').select('plan').eq('id', prof.practice_id).maybeSingle();
    plan = prac?.plan ?? 'basic';
  }
  if (plan !== 'pro') return json({ error: 'Voice autofill is a Pro-plan feature.' }, 403);

  const master = Deno.env.get('DEEPGRAM_API_KEY');
  if (!master) return json({ error: 'Voice transcription is not configured yet.' }, 503);

  const auth = { Authorization: `Token ${master}` };

  // Find the project to mint the key under.
  const projResp = await fetch('https://api.deepgram.com/v1/projects', { headers: auth });
  if (!projResp.ok) return json({ error: 'Could not reach Deepgram.' }, 502);
  const projects = await projResp.json();
  const projectId = projects?.projects?.[0]?.project_id;
  if (!projectId) return json({ error: 'No Deepgram project available.' }, 502);

  const keyResp = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: `toothops-ephemeral-${caller.id}`,
      scopes: ['usage:write'],
      time_to_live_in_seconds: TTL_SECONDS,
    }),
  });
  const keyText = await keyResp.text();
  if (!keyResp.ok) return json({ error: `Could not mint a transcription key: ${keyText}` }, 502);
  let created: { key?: string };
  try {
    created = JSON.parse(keyText);
  } catch {
    return json({ error: 'Deepgram returned an unreadable response.' }, 502);
  }
  if (!created.key) return json({ error: 'Deepgram did not return a key.' }, 502);

  return json({ key: created.key, expiresInSeconds: TTL_SECONDS });
});
