// Send a recheck reminder email to a pet owner (the editable composer's
// Send action). verify_jwt on.
//
// The recipient is NOT taken from the request — it's read server-side
// from the chart's stored owner_email, and only after confirming the
// caller owns that chart (created it, or shares its practice). This keeps
// the function from being a generic "email anyone from toothops.app"
// relay: every send is tied to a real chart the caller can access and a
// pet owner they previously recorded. Stamps the chart as reminded so
// the scheduled job won't double-send.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

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
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const chartId = typeof body.chartId === 'string' ? body.chartId : '';
  if (!chartId) return json({ error: 'A saved chart is required to send a reminder.' }, 400);
  if (!subject.trim() || !text.trim()) return json({ error: 'Subject and message are required.' }, 400);

  // Load the chart and confirm the caller may act on it: they created it,
  // or they're a member of the practice it's shared with.
  const { data: chart } = await admin
    .from('charts')
    .select('created_by, practice_id, owner_email')
    .eq('id', chartId)
    .maybeSingle();
  if (!chart) return json({ error: 'That chart no longer exists.' }, 404);

  let allowed = chart.created_by === caller.id;
  if (!allowed && chart.practice_id) {
    const { data: mem } = await admin
      .from('practice_members')
      .select('user_id')
      .eq('practice_id', chart.practice_id)
      .eq('user_id', caller.id)
      .maybeSingle();
    allowed = !!mem;
  }
  if (!allowed) return json({ error: 'You do not have access to that chart.' }, 403);

  // Recipient is the chart's recorded owner email — never a client value.
  const to = (chart.owner_email ?? '').trim();
  if (!isEmail(to)) {
    return json({ error: "This patient has no owner email. Add one on the chart, then send." }, 400);
  }

  // From-name: the caller's practice, if any. Strip CR/LF so a crafted
  // practice name can't inject extra mail headers.
  let fromName = 'ToothOps';
  const { data: mem } = await admin
    .from('practice_members')
    .select('practices(name)')
    .eq('user_id', caller.id)
    .limit(1);
  const pname = (mem?.[0]?.practices as { name?: string } | undefined)?.name;
  if (pname && pname.trim()) fromName = pname.trim();
  fromName = fromName.replace(/[\r\n]+/g, ' ').slice(0, 100);

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

  await admin.from('charts').update({ reminder_sent_at: new Date().toISOString() }).eq('id', chartId);
  return json({ ok: true, to });
});
