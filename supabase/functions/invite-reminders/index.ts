// Invite & signup reminders — run once a day (GitHub Actions, see
// .github/workflows/invite-reminders.yml). Finds accounts that were never
// activated — team invitees (branded "join your practice" email with a
// fresh set-password link) and self-signups who never confirmed their
// email (Supabase's confirm-signup email re-sent) — and sends at most
// two polite reminders:
//   1st: 24h+ after the invite   ·   2nd (final): 5 days+ after the invite
// The final TEAM-INVITE reminder says the invite expires in 14 days; once
// that date passes the never-activated account is deleted (it owns
// nothing — the owner can always invite again). Self-signups are only
// reminded, never deleted. Accounts whose final reminder predates the
// expiry warning carry no invite_expires_at and are left alone.
//
// Each reminder carries a fresh set-password link (the original invite
// link has long expired). Progress is kept in the user's app_metadata
// (invite_reminders: count, invite_reminded_at).
//
// verify_jwt OFF — protected by the CRON_SECRET header instead.
// Secrets: CRON_SECRET, RESEND_API_KEY (or Vault resend_api_key).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrandedEmail } from '../_shared/email.ts';
import { inviteReminderEmail } from '../_shared/inviteEmails.ts';
import { emailLanguage } from '../_shared/emailStrings.ts';

const APP_URL = 'https://toothops.app/';
const DAY = 24 * 60 * 60 * 1000;
/** Days after the invite at which reminder #1 and #2 go out. */
const SCHEDULE_DAYS = [1, 5];
// Anti-spam guards:
/** Never start reminding accounts older than this (stale/dead signups). */
const MAX_AGE_DAYS = 21;
/** Hard cap on emails per run, whatever happens. */
const MAX_PER_RUN = 25;
/** Days after the final invite reminder before the pending account is deleted. */
const EXPIRE_DAYS = 14;
/** Hard cap on expired-invite deletions per run. */
const MAX_DELETES_PER_RUN = 25;

/** j***@gmail.com — enough to recognise an account in a dry run. */
const mask = (email: string) => {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  let dryRun = false;
  try { dryRun = (await req.json())?.dryRun === true; } catch { /* no body */ }
  const preview: { email: string; kind: 'invite' | 'signup'; reminder: number }[] = [];
  const deletePreview: string[] = [];
  let deleted = 0;

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
      // invited_at isn't set by generateLink-style invites, so it can't be
      // the test; use when the account was created/invited instead.
      const startedAt = u.invited_at ?? u.created_at;
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
      const count = typeof meta.invite_reminders === 'number' ? meta.invite_reminders : 0;
      if (count >= SCHEDULE_DAYS.length) {
        // Expire invites whose final reminder warned about it.
        const expiresAt = typeof meta.invite_expires_at === 'string' ? Date.parse(meta.invite_expires_at) : NaN;
        if (Number.isNaN(expiresAt)) { note('all_reminders_sent'); continue; }
        if (now < expiresAt) { note('invite_not_expired_yet'); continue; }
        // Belt and braces: only a pending account that never got in and
        // owns nothing. (Unconfirmed email was checked above.)
        if (u.last_sign_in_at) { note('expired_but_signed_in'); continue; }
        if (meta.role === 'admin') { note('expired_admin_skipped'); continue; }
        const { count: owned } = await admin
          .from('practices').select('id', { count: 'exact', head: true }).eq('owner', u.id);
        if ((owned ?? 0) > 0) { note('expired_owns_practice'); continue; }
        const { count: charts } = await admin
          .from('charts').select('id', { count: 'exact', head: true }).eq('created_by', u.id);
        if ((charts ?? 0) > 0) { note('expired_has_charts'); continue; }
        if (deleted + deletePreview.length >= MAX_DELETES_PER_RUN) { note('delete_cap_reached'); continue; }
        if (dryRun) { deletePreview.push(mask(u.email)); continue; }
        // Membership rows cascade with the user.
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (delErr) { note('expire_delete_failed'); continue; }
        note('expired_invite_deleted');
        deleted++;
        continue;
      }
      if (count === 0 && now - Date.parse(startedAt) > MAX_AGE_DAYS * DAY) { note('too_old_to_start'); continue; }
      if (sent.length + preview.length >= MAX_PER_RUN) { note('run_cap_reached'); continue; }
      const dueAt = Date.parse(startedAt) + SCHEDULE_DAYS[count] * DAY;
      if (now < dueAt) { note('not_due_yet'); continue; }
      // Space reminders out even for old invites (both "due" at once).
      const last = typeof meta.invite_reminded_at === 'string' ? Date.parse(meta.invite_reminded_at) : 0;
      if (last && now - last < 3 * DAY) { note('reminded_recently'); continue; }

      // Invitee (on someone else's practice) or a self-signup who never
      // confirmed (owns their own practice, or none)?
      const { data: mems } = await admin
        .from('practice_members')
        .select('practice_id, practices(name, owner)')
        .eq('user_id', u.id);
      const invitedTo = (mems ?? []).find((m) => (m.practices as { owner?: string } | null)?.owner !== u.id);

      // The final reminder to a team invitee starts the expiry clock (and
      // the email says so); self-signups never expire.
      const final = count === SCHEDULE_DAYS.length - 1;
      const expiresAt = final && invitedTo ? new Date(now + EXPIRE_DAYS * DAY) : null;

      // Count the reminder BEFORE sending: if anything fails after this,
      // the person gets fewer emails, never a repeat.
      const markSent = async () => {
        const { error: metaErr } = await admin.auth.admin.updateUserById(u.id, {
          app_metadata: {
            ...meta,
            invite_reminders: count + 1,
            invite_reminded_at: new Date().toISOString(),
            ...(expiresAt ? { invite_expires_at: expiresAt.toISOString() } : {}),
          },
        });
        return !metaErr;
      };

      if (dryRun) {
        preview.push({ email: mask(u.email), kind: invitedTo ? 'invite' : 'signup', reminder: count + 1 });
        continue;
      }
      if (!(await markSent())) { note('could_not_record'); continue; }

      if (!invitedTo) {
        // Self-signup: re-send Supabase's confirm-signup email (the branded
        // template, delivered through Resend SMTP).
        const { error: resendErr } = await admin.auth.resend({ type: 'signup', email: u.email, options: { emailRedirectTo: APP_URL } });
        if (resendErr) { note('signup_resend_failed'); skipped.push(u.email); continue; }
        note('signup_confirmation_resent');
        sent.push(u.email);
        continue;
      }
      const practice = ((invitedTo.practices as { name?: string } | null)?.name ?? '').trim();

      // Fresh link: a recovery link verifies the email and lands on the
      // app's set-password screen (invite=1 shows the invite wording).
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: u.email,
        options: { redirectTo: `${APP_URL}?invite=1` },
      });
      if (linkErr || !link?.properties?.action_link) { note('link_failed'); skipped.push(u.email); continue; }

      // The language team-api stored on the invite (English for older invites).
      const lang = emailLanguage((u.user_metadata as Record<string, unknown> | undefined)?.language);
      const m = inviteReminderEmail(lang, { practice, final, expiresAt, url: link.properties.action_link });
      const ok = await sendBrandedEmail(key, u.email, m.subject, m.email, lang);
      if (!ok) { note('email_failed'); skipped.push(u.email); continue; }
      note('invite_reminder_sent');
      sent.push(u.email);
    }
    if (users.length < 1000) break;
  }

  if (dryRun) {
    return json({ ok: true, dryRun: true, wouldSend: preview.length, preview, wouldDelete: deletePreview.length, deletePreview, why });
  }
  return json({ ok: true, sent: sent.length, skipped: skipped.length, deleted, why });
});
