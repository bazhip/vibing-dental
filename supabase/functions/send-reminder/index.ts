// Send a recheck reminder email to a pet owner (the editable composer's
// Send action). verify_jwt on; the signed-in user sends their own
// practice's reminder via Resend from noreply@toothops.app. Stamps the
// chart as reminded so the scheduled job won't double-send.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const to = (typeof body.to === 'string' ? body.to : '').trim();
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const chartId = typeof body.chartId === 'string' ? body.chartId : '';
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Enter a valid owner email.' }, 400);
  if (!subject.trim() || !text.trim()) return json({ error: 'Subject and message are required.' }, 400);

  // From-name: the caller's practice, if any.
  let fromName = 'ToothOps';
  const { data: mem } = await admin
    .from('practice_members')
    .select('practices(name)')
    .eq('user_id', caller.id)
    .limit(1);
  const pname = (mem?.[0]?.practices as { name?: string } | undefined)?.name;
  if (pname && pname.trim()) fromName = pname.trim();

  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return json({ error: 'Email is not configured.' }, 500);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <noreply@toothops.app>`,
      to: [to],
      subject,
      text,
    }),
  });
  const respText = await resp.text();
  if (!resp.ok) return json({ error: `Email failed: ${respText}` }, 502);

  if (chartId) {
    await admin.from('charts').update({ reminder_sent_at: new Date().toISOString() }).eq('id', chartId);
  }
  return json({ ok: true });
});
