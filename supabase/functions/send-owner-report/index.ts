// Email the owner report PDF to the pet owner (Documents → Owner report →
// Email to owner). verify_jwt on.
//
// Same guard rails as send-reminder: the recipient is NOT taken from the
// request — it's the chart's saved owner_email, read server-side after
// confirming the caller may act on that chart (created it, or shares its
// practice). The attachment must be a real PDF under the size cap. Replies
// go to the vet who pressed Send (Reply-To), since mail comes from
// noreply@toothops.app.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiError } from '../_shared/apiErrors.ts';
import { canAccessChart } from '../_shared/chartAccess.ts';
import { renderBrandedEmail } from '../_shared/email.ts';
import { decodePdf, emailParagraphs, fromHeader, sanitizeFilename, senderPractice, type SenderPractice } from '../_shared/ownerReportEmail.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const DAILY_LIMIT = 100;
const USAGE_MODEL = 'owner-report-email';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json(apiError('unauthorized'), 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const chartId = typeof body.chartId === 'string' ? body.chartId : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const filename = sanitizeFilename(typeof body.filename === 'string' ? body.filename : '');
  const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
  if (!chartId) return json(apiError('report_chart_required'), 400);
  if (!subject.trim() || !text.trim()) return json(apiError('subject_and_message_required'), 400);
  if (subject.length > 200 || text.length > 10_000) return json(apiError('message_too_long'), 400);

  const pdf = decodePdf(pdfBase64);
  if (!pdf.ok) return json(apiError(pdf.code), pdf.code === 'attachment_too_large' ? 413 : 400);

  // The chart, and whether the caller may act on it.
  const { data: chart } = await admin
    .from('charts')
    .select('created_by, practice_id, owner_email')
    .eq('id', chartId)
    .maybeSingle();
  if (!chart) return json(apiError('chart_gone'), 404);

  const { allowed, isMember } = await canAccessChart(admin, chart, caller.id);
  if (!allowed) return json(apiError('chart_forbidden'), 403);

  // Recipient is the chart's saved owner email — never a client value.
  const to = (chart.owner_email ?? '').trim();
  if (!isEmail(to)) return json(apiError('no_owner_email'), 400);

  // From-name and email language: the chart's practice (members only),
  // else the caller's own practice.
  let chartPractice: SenderPractice | null = null;
  if (chart.practice_id && isMember) {
    const { data } = await admin.from('practices').select('name, client_language').eq('id', chart.practice_id).maybeSingle();
    chartPractice = data;
  }
  let ownPractice: SenderPractice | null = null;
  if (!chartPractice?.name?.trim()) {
    const { data: mem } = await admin
      .from('practice_members')
      .select('practices(name, client_language)')
      .eq('user_id', caller.id)
      .limit(1);
    ownPractice = (mem?.[0]?.practices as SenderPractice | undefined) ?? null;
  }
  const practice = senderPractice(chartPractice, isMember, ownPractice);
  const lng = practice?.client_language || 'en';

  // Abuse guard: cap report emails per account per day.
  const { count: sentToday } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', caller.id).eq('model', USAGE_MODEL)
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((sentToday ?? 0) >= DAILY_LIMIT) return json(apiError('daily_owner_report_limit'), 429);

  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return json(apiError('email_not_configured'), 500);

  const { html } = renderBrandedEmail(
    { preheader: subject, title: subject, paragraphs: emailParagraphs(text) },
    lng,
  );
  const replyTo = caller.email && isEmail(caller.email) ? caller.email : undefined;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromHeader(practice?.name ?? ''),
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: subject.replace(/[\r\n]+/g, ' '),
      text,
      html,
      attachments: [{ filename, content: pdfBase64 }],
    }),
  });
  const respText = await resp.text();
  if (!resp.ok) return json(apiError('email_failed', { detail: respText }), 502);

  const sentAt = new Date().toISOString();
  await admin.from('ai_usage').insert({ user_id: caller.id, model: USAGE_MODEL, input_tokens: 0, output_tokens: 0 }).then(() => {}, () => {});
  await admin.from('charts').update({ owner_report_sent_at: sentAt }).eq('id', chartId).then(() => {}, () => {});
  return json({ ok: true, to, sentAt });
});
