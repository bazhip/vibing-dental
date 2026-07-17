// Signup alert — called by a database trigger (pg_net) whenever a new
// row lands in public.profiles. Sends an email via Resend.
//
// Deployed to the hiefwyyoyiqxmxaxyxmx project as `signup-alert`
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

const ALERT_TO = Deno.env.get('ALERT_TO') ?? 'bazhip@gmail.com';
const ALERT_FROM = Deno.env.get('ALERT_FROM') ?? 'ToothOps Charting <onboarding@resend.dev>';
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
  return new Response(body, { status: resp.ok ? 200 : 502 });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
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

  // Anonymous no-account trial started — nothing to look up, no PII.
  // The client fires this at most once per browser.
  if (trial === true) {
    const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
    if (!key) return new Response('Resend key unavailable', { status: 500 });
    return sendAlert(
      key,
      'ToothOps: someone started a trial',
      'A visitor started the no-account trial on the ToothOps landing page.'
    );
  }

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

  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return new Response('Resend key unavailable', { status: 500 });

  return sendAlert(
    key,
    `New ToothOps signup: ${profile.practice_name?.trim() || email}`,
    [
      `Practice: ${profile.practice_name?.trim() || '(none)'}`,
      `Doctor: ${profile.doctor_name?.trim() || '(none)'}`,
      `Email: ${email}`,
      `Signed up: ${profile.created_at}`,
    ].join('\n')
  );
});
