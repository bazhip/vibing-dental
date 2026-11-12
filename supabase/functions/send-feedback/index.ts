// In-app feedback → email to the ToothOps owner via Resend.
//
// Signed-in users only (verify_jwt on). The sender's email is taken from
// their verified session, never the request, and set as Reply-To so a
// reply goes straight back to them. Context (page, browser, app build)
// comes from the client and is shown as-is — informational only.
//
// Abuse guard: 20 per account per day, logged as ai_usage rows with
// model 'feedback' (excluded from AI usage in admin-api), plus size caps.
//
// Secrets: RESEND_API_KEY (or Vault resend_api_key); FEEDBACK_TO
// optional (defaults to the owner's address).

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const FEEDBACK_TO = Deno.env.get('FEEDBACK_TO') ?? 'bazhip@gmail.com';
const FROM = 'ToothOps Feedback <noreply@toothops.app>';
const KINDS: Record<string, string> = { bug: 'Problem', idea: 'Idea', other: 'Feedback' };
const MAX_MESSAGE = 5_000;
const MAX_TRANSCRIPT = 30_000;
const PER_DAY = 20;

const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

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
  const message = String(body.message ?? '').trim();
  if (!message) return json({ error: 'Please write a message.' }, 400);
  if (message.length > MAX_MESSAGE) return json({ error: `Please keep it under ${MAX_MESSAGE} characters.` }, 400);
  const kind = KINDS[String(body.kind)] ? String(body.kind) : 'other';
  const transcript = String(body.transcript ?? '').slice(0, MAX_TRANSCRIPT);
  const ctx = (body.context ?? {}) as Record<string, unknown>;

  const { count: today } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', caller.id).eq('model', 'feedback')
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((today ?? 0) >= PER_DAY) return json({ error: 'You’ve sent a lot of feedback today — thank you! Please try again tomorrow.' }, 429);

  // Who sent it: name + practice from the database, not the client.
  const { data: prof } = await admin.from('profiles').select('doctor_name, practice_id').eq('id', caller.id).maybeSingle();
  let practice = '';
  if (prof?.practice_id) {
    const { data: p } = await admin.from('practices').select('name').eq('id', prof.practice_id).maybeSingle();
    practice = p?.name ?? '';
  }
  const email = caller.email ?? '(no email)';
  const name = oneLine((prof as { doctor_name?: string } | null)?.doctor_name, 100);

  const lines = [
    `${KINDS[kind]} from ${name ? `${name} <${email}>` : email}${practice ? ` · ${practice}` : ''}`,
    '',
    message,
    '',
    '— Context —',
    `Page: ${oneLine(ctx.section, 60) || '(unknown)'}`,
    `URL: ${oneLine(ctx.url, 300)}`,
    `Browser: ${oneLine(ctx.userAgent, 300)}`,
    `Screen: ${oneLine(ctx.screen, 40)}`,
    `Sent: ${new Date().toISOString()}`,
    `User id: ${caller.id}`,
  ];
  if (transcript) lines.push('', '— Dictation transcript —', transcript);

  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return json({ error: 'Email is not configured.' }, 500);
  const subject = `ToothOps ${KINDS[kind].toLowerCase()}: ${oneLine(message, 60)}${message.length > 60 ? '…' : ''}`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [FEEDBACK_TO],
      ...(caller.email ? { reply_to: caller.email } : {}),
      subject,
      text: lines.join('\n'),
    }),
  });
  if (!resp.ok) return json({ error: 'Couldn’t send right now. Please try again in a minute.' }, 502);
  await admin.from('ai_usage').insert({ user_id: caller.id, model: 'feedback', input_tokens: 0, output_tokens: 0 }).then(() => {}, () => {});
  return json({ ok: true });
});
