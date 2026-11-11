// Invite reminders — run once a day (GitHub Actions, see
// .github/workflows/invite-reminders.yml). Finds team invitees who never
// activated their account and sends at most two polite reminders:
//   1st: 24h+ after the invite   ·   2nd (final): 5 days+ after the invite
// then stops — the invite stays "pending" in Practice settings, where the
// owner can resend or remove it.
//
// Each reminder carries a fresh set-password link (the original invite
// link has long expired). Progress is kept in the user's app_metadata
// (invite_reminders: count, invite_reminded_at).
//
// verify_jwt OFF — protected by the CRON_SECRET header instead.
// Secrets: CRON_SECRET, RESEND_API_KEY (or Vault resend_api_key).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrandedEmail } from '../_shared/email.ts';

const APP_URL = 'https://toothops.app/';
const DAY = 24 * 60 * 60 * 1000;
/** Days after the invite at which reminder #1 and #2 go out. */
const SCHEDULE_DAYS = [1, 5];

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return json({ error: 'Resend key unavailable' }, 500);

  const now = Date.now();
  const sent: string[] = [];
  const skipped: string[] = [];
  // Why people weren't reminded — counts only, for the run log.
  const why: Record<string, number> = {};
  const note = (k: string) => { why[k] = (why[k] ?? 0) + 1; };

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ error: error.message }, 500);
    const users = data.users;
    for (const u of users) {
      if (!u.email) { note('no_email'); continue; }
      if (u.email_confirmed_at) continue; // active account — the normal case
      if (!u.invited_at) { note('unconfirmed_not_invited'); continue; }
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
      const count = typeof meta.invite_reminders === 'number' ? meta.invite_reminders : 0;
      if (count >= SCHEDULE_DAYS.length) { note('all_reminders_sent'); continue; }
      const dueAt = Date.parse(u.invited_at) + SCHEDULE_DAYS[count] * DAY;
      if (now < dueAt) { note('not_due_yet'); continue; }
      // Space reminders out even for old invites (both "due" at once).
      const last = typeof meta.invite_reminded_at === 'string' ? Date.parse(meta.invite_reminded_at) : 0;
      if (last && now - last < 3 * DAY) { note('reminded_recently'); continue; }

      // Which practice invited them (for the wording).
      const { data: mem } = await admin
        .from('practice_members')
        .select('practices(name)')
        .eq('user_id', u.id)
        .limit(1);
      const practice = ((mem?.[0]?.practices as { name?: string } | undefined)?.name ?? '').trim();
      if (!mem?.length) { note('not_on_a_team'); skipped.push(u.email); continue; } // no longer on any team

      // Fresh link: a recovery link verifies the email and lands on the
      // app's set-password screen (invite=1 shows the invite wording).
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: u.email,
        options: { redirectTo: `${APP_URL}?invite=1` },
      });
      if (linkErr || !link?.properties?.action_link) { note('link_failed'); skipped.push(u.email); continue; }

      const final = count === SCHEDULE_DAYS.length - 1;
      const who = practice || 'your practice';
      const subject = final
        ? `Last reminder: join ${who} on ToothOps`
        : `Reminder: ${who} invited you to ToothOps`;
      const ok = await sendBrandedEmail(key, u.email, subject, {
        preheader: `${who} is waiting for you on ToothOps — set your password to join.`,
        title: final ? 'Your invitation is still waiting' : `You’re invited to join ${who}`,
        paragraphs: [
          `${who} invited you to ToothOps, their veterinary dental charting app. Your account is ready whenever you are — just set a password to get started.`,
          'The link below works for 24 hours.',
        ],
        button: { label: 'Set your password & join', url: link.properties.action_link },
        footnote: final
          ? `This is the last reminder we’ll send. If the link expires, ask ${who} to resend your invite.`
          : 'Not expecting this, or don’t want to join? Just ignore this email — we’ll send at most one more reminder.',
      });
      if (!ok) { note('email_failed'); skipped.push(u.email); continue; }

      await admin.auth.admin.updateUserById(u.id, {
        app_metadata: { ...meta, invite_reminders: count + 1, invite_reminded_at: new Date().toISOString() },
      });
      sent.push(u.email);
    }
    if (users.length < 1000) break;
  }

  return json({ ok: true, sent: sent.length, skipped: skipped.length, why });
});
