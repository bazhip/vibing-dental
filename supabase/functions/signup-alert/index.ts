// Signup alert — called by a database trigger (pg_net) whenever a new
// row lands in public.profiles. Sends an email via Resend.
//
// Deployed to the ocjnngfzwyajhgqzicsf project as `signup-alert`
// (verify_jwt off — pg_net calls it server-to-server). The payload is
// only trusted as a POINTER: we accept a profile id, look the row up
// with the service role, and only send for profiles created in the
// last 15 minutes, so replaying an old/guessed id does nothing.
//
// The Resend key lives in Supabase Vault (name: resend_api_key),
// fetched through the service-role-only RPC public.get_resend_key().
// ALERT_TO must stay the Resend account owner's address until a domain
// is verified at resend.com/domains (free-tier restriction).

import { createClient } from 'npm:@supabase/supabase-js@2';

// Cached older app bundles still send a (now ignored) trial-start ping
// from the browser; keep CORS so their preflight doesn't error. pg_net (signup path) is
// server-to-server and unaffected.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALERT_TO = Deno.env.get('ALERT_TO') ?? 'bazhip@gmail.com';
const ALERT_FROM = Deno.env.get('ALERT_FROM') ?? 'ToothOps <noreply@toothops.app>';
const FRESH_WINDOW_MS = 15 * 60 * 1000;

async function sendAlert(key: string, subject: string, text: string): Promise<Response> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, text }),
  });
  const body = await resp.text();
  return new Response(body, { status: resp.ok ? 200 : 502, headers: CORS });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });
  let id: string | undefined;
  let trial: boolean | undefined;
  try {
    ({ id, trial } = await req.json());
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Anonymous no-account trial started. The owner no longer wants an
  // email per trial; the app stopped sending this ping, but cached older
  // bundles may still fire it — acknowledge and drop.
  if (trial === true) return new Response(null, { status: 204, headers: CORS });

  if (!id || typeof id !== 'string') return new Response('missing id', { status: 400 });

  const { data: profile, error } = await admin
    .from('profiles')
    .select('practice_name, doctor_name, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return new Response(`lookup failed: ${error.message}`, { status: 500 });
  if (!profile) return new Response('unknown profile', { status: 404 });

  const age = Date.now() - new Date(profile.created_at).getTime();
  if (!(age < FRESH_WINDOW_MS)) return new Response('stale — not a new signup', { status: 200 });

  const { data: userData } = await admin.auth.admin.getUserById(id);
  const email = userData?.user?.email ?? '(unknown)';

  // Invite-created accounts are not signups: team/admin invites — and
  // invite RESENDS, which delete + recreate the pending account — all
  // insert a fresh profiles row and land here. The owner initiated
  // those and already knows. Email signups carry the form's
  // practice_name metadata; invites carry none and have invited_at.
  // Google (OAuth) signups also carry no practice_name — they skip the
  // form and name the practice in-app afterwards — but invites are
  // always email accounts, so an OAuth account is always a real signup.
  const user = userData?.user;
  const provider = String(user?.app_metadata?.provider ?? 'email');
  const viaOAuth = provider !== 'email';
  if (user?.invited_at || (!viaOAuth && !user?.user_metadata?.practice_name)) {
    return new Response('invite — not a signup', { status: 200 });
  }
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const oauthName = String(meta.full_name ?? meta.name ?? '').trim();
  const via = viaOAuth ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'email';

  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return new Response('Resend key unavailable', { status: 500 });

  return sendAlert(
    key,
    `New ToothOps signup: ${profile.practice_name?.trim() || oauthName || email}${viaOAuth ? ` (via ${via})` : ''}`,
    [
      `Practice: ${profile.practice_name?.trim() || (viaOAuth ? '(not set yet — asked in-app after sign-in)' : '(none)')}`,
      `Doctor: ${profile.doctor_name?.trim() || oauthName || '(none)'}`,
      `Email: ${email}`,
      `Signed up via: ${via}`,
      `Signed up: ${profile.created_at}`,
    ].join('\n')
  );
});
