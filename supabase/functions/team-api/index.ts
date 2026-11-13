// Team API — practice (multi-doctor) management for the signed-in user.
//
// verify_jwt ON: the gateway checks the JWT, then this function
// re-resolves the caller and enforces ownership per action with the
// service role. "Owner" is a role in practice_members, so a practice can
// have several owners; practices.owner marks the primary owner (the
// billing/deletion anchor) and can be transferred.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrandedEmail } from '../_shared/email.ts';
import { purgeAccount, purgePractice } from '../_shared/deletion.ts';

/** Free beta — keep in step with FREE_BETA in src/constants/plans.ts. */
const FREE_BETA = true;

type Json = Record<string, unknown>;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Json, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });


/** Create the account + email a set-password link via Resend (verified
 *  domain → delivers to anyone; not rate-limited like the built-in
 *  mailer). Returns the created user or an error. */
// deno-lint-ignore no-explicit-any
async function inviteViaResend(admin: any, email: string, practiceName: string, redirectTo?: string) {
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error || !link?.user || !link?.properties?.action_link) {
    return { user: null, error: error?.message ?? 'Could not create the invite.' };
  }
  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (key) {
    const who = practiceName || 'A practice';
    await sendBrandedEmail(key, email, `${who} invited you to ToothOps`, {
      preheader: `Set your password to join ${practiceName || 'the practice'} on ToothOps.`,
      title: `You’re invited to join ${practiceName || 'a practice'}`,
      paragraphs: [
        `${who} added you to their team on ToothOps — chairside veterinary dental charting.`,
        'Set your password to activate your account and see the practice’s charts.',
      ],
      button: { label: 'Set your password & join', url: link.properties.action_link },
      footnote: 'If you weren’t expecting this, you can ignore this email.',
    });
  }
  return { user: link.user, error: null };
}

/** Joining a practice shares the member's existing personal records
 *  with it — new saves stamp practice_id already; this catches charts
 *  (and templates/attachments) made before they joined. */
// deno-lint-ignore no-explicit-any
async function sharePersonalRecords(admin: any, practiceId: string, userId: string) {
  await admin.from('charts').update({ practice_id: practiceId }).eq('created_by', userId).is('practice_id', null);
  await admin.from('report_templates').update({ practice_id: practiceId }).eq('created_by', userId).is('practice_id', null);
  await admin.from('attachments').update({ practice_id: practiceId }).eq('created_by', userId).is('practice_id', null);
}

// ---- Join invitations for EXISTING accounts --------------------------------
// Adding an email that already has an account must never move that person
// (or their records) into a practice without their consent. Instead they
// get a signed link; nothing changes until they sign in and accept.

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('INVITE_SIGNING_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signInvite(practiceId: string, userId: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ p: practiceId, u: userId, e: Date.now() + INVITE_TTL_MS })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload)));
  return `${payload}.${b64url(sig)}`;
}
async function verifyInvite(token: string): Promise<{ p: string; u: string; e: number } | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof data?.p === 'string' && typeof data?.u === 'string' && typeof data?.e === 'number' ? data : null;
  } catch {
    return null;
  }
}

/** Only send people back to our own app (no open redirects in emails). */
function safeAppUrl(redirectTo?: string): string {
  const fallback = 'https://toothops.app/';
  if (!redirectTo) return fallback;
  try {
    const u = new URL(redirectTo);
    const okHost = u.hostname === 'toothops.app' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' ||
      /^vibing-dental[a-z0-9-]*\.vercel\.app$/.test(u.hostname);
    return okHost ? `${u.origin}${u.pathname}` : fallback;
  } catch {
    return fallback;
  }
}

// deno-lint-ignore no-explicit-any
async function sendJoinRequest(admin: any, email: string, practiceName: string, link: string) {
  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return;
  const name = practiceName || 'a practice';
  await sendBrandedEmail(key, email, `Join ${name} on ToothOps?`, {
    preheader: `${name} invited you to their team on ToothOps.`,
    title: `Join ${name}?`,
    paragraphs: [
      `${name} invited you to join their team on ToothOps. Sign in with your existing account to accept.`,
      'Nothing changes until you accept — and sharing your existing charts with the practice is a separate choice you make when joining.',
    ],
    button: { label: 'Review invitation', url: link },
    footnote: 'The link works for 14 days. If you weren’t expecting this, ignore this email.',
  });
}

// deno-lint-ignore no-explicit-any
async function addOrInviteMember(admin: any, practiceId: string, practiceName: string, email: string, redirectTo?: string) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let target = list.users.find((u: { email?: string }) => (u.email ?? '').toLowerCase() === email);
  let invited = false;
  if (target) {
    // Existing account: ask, don't add.
    const { data: existing } = await admin.from('practice_members').select('user_id')
      .eq('practice_id', practiceId).eq('user_id', target.id).maybeSingle();
    if (existing) return { status: 400, body: { error: 'They’re already a member of this practice.' } };
    const token = await signInvite(practiceId, target.id);
    await sendJoinRequest(admin, email, practiceName, `${safeAppUrl(redirectTo)}#/join/${token}`);
    return { status: 200, body: { ok: true, invited: false, pending: true } };
  }
  {
    const inv = await inviteViaResend(admin, email, practiceName, safeAppUrl(redirectTo));
    if (inv.error || !inv.user) return { status: 502, body: { error: `Couldn't send the invite: ${inv.error ?? 'unknown error'}` } };
    target = inv.user;
    invited = true;
  }
  // Brand-new account created by this invite: it has no records of its
  // own yet, so joining directly is safe.
  await admin.from('practice_members').upsert({ practice_id: practiceId, user_id: target.id, role: 'member' });
  await admin.from('profiles').upsert({ id: target.id, practice_id: practiceId });
  await admin.from('practices').delete().eq('owner', target.id).neq('id', practiceId);
  return { status: 200, body: { ok: true, invited } };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const action = body.action as string;
  const userId = typeof body.userId === 'string' ? body.userId : '';

  // The caller's single practice membership (owned or joined).
  const myMembership = async () => {
    const { data } = await admin
      .from('practice_members')
      .select('practice_id, role, practices(id, name, owner)')
      .eq('user_id', caller.id)
      .limit(1);
    const row = data?.[0];
    return row
      ? { practiceId: row.practice_id as string, role: row.role as string, practice: row.practices as { id: string; name: string; owner: string } }
      : null;
  };
  const requireOwner = async () => {
    const m = await myMembership();
    if (!m || m.role !== 'owner') return null;
    return m;
  };

  try {
    switch (action) {
      case 'get_team': {
        const m = await myMembership();
        if (!m || !m.practice) return json({ practice: null, role: null, primaryOwnerId: null, members: [] });
        const { data: members } = await admin
          .from('practice_members')
          .select('user_id, role')
          .eq('practice_id', m.practice.id);
        const enriched = [];
        for (const mem of members ?? []) {
          const { data: u } = await admin.auth.admin.getUserById(mem.user_id);
          const { data: p } = await admin.from('profiles').select('doctor_name').eq('id', mem.user_id).maybeSingle();
          enriched.push({
            userId: mem.user_id,
            email: u?.user?.email ?? '',
            doctorName: p?.doctor_name ?? '',
            role: mem.role,
            isYou: mem.user_id === caller.id,
            // Invited-but-not-yet-activated accounts have no confirmed email.
            pending: !u?.user?.email_confirmed_at,
            isPrimaryOwner: mem.user_id === m.practice.owner,
          });
        }
        // Owners first, then pending, then alphabetical.
        enriched.sort((a, b) =>
          (b.role === 'owner' ? 1 : 0) - (a.role === 'owner' ? 1 : 0) ||
          a.email.localeCompare(b.email)
        );
        return json({ practice: { id: m.practice.id, name: m.practice.name }, role: m.role, primaryOwnerId: m.practice.owner, members: enriched });
      }

      case 'create_practice': {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return json({ error: 'Give the practice a name.' }, 400);
        const existing = await admin.from('practices').select('id').eq('owner', caller.id).maybeSingle();
        if (existing.data) return json({ error: 'You already own a practice.' }, 400);
        const { data: prac, error: pErr } = await admin.from('practices').insert({ name, owner: caller.id }).select('id, name').single();
        if (pErr) throw pErr;
        await admin.from('practice_members').insert({ practice_id: prac.id, user_id: caller.id, role: 'owner' });
        await admin.from('profiles').upsert({ id: caller.id, practice_id: prac.id });
        await sharePersonalRecords(admin, prac.id, caller.id);
        return json({ practice: prac });
      }

      // An existing account accepting a join link (see signInvite).
      case 'accept_invite': {
        const token = typeof body.token === 'string' ? body.token : '';
        const inv = token ? await verifyInvite(token) : null;
        if (!inv) return json({ error: 'This invite link isn’t valid. Ask the practice to send a new one.' }, 400);
        if (inv.u !== caller.id) return json({ error: 'This invite was sent to a different account. Sign in with the invited email.' }, 403);
        if (Date.now() > inv.e) return json({ error: 'This invite has expired. Ask the practice to send a new one.' }, 410);
        const { data: prac } = await admin.from('practices').select('id, name').eq('id', inv.p).maybeSingle();
        if (!prac) return json({ error: 'That practice no longer exists.' }, 404);
        const { data: already } = await admin.from('practice_members').select('user_id')
          .eq('practice_id', inv.p).eq('user_id', caller.id).maybeSingle();
        if (body.preview === true) return json({ practiceName: prac.name ?? '', alreadyMember: !!already });
        await admin.from('practice_members').upsert({ practice_id: inv.p, user_id: caller.id, role: 'member' });
        await admin.from('profiles').upsert({ id: caller.id, practice_id: inv.p });
        // Sharing their existing charts is a separate, explicit choice.
        if (body.shareExisting === true) await sharePersonalRecords(admin, inv.p, caller.id);
        return json({ ok: true, practiceName: prac.name ?? '' });
      }

      case 'add_member': {
        const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        if (!email) return json({ error: 'Enter an email.' }, 400);
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can add members.' }, 403);
        // Seat limits come from the subscription: Individual plans are
        // single-user, Practice plans include up to 5. (The admin panel
        // can bypass via admin-api for hand-arranged deals.)
        // Free beta (mirrors FREE_BETA in src/constants/plans.ts): every
        // account gets 5 seats regardless of type.
        const { data: prac } = await admin.from('practices').select('account_type').eq('id', m.practiceId).maybeSingle();
        const seats = FREE_BETA ? 5 : prac?.account_type === 'practice' ? 5 : 1;
        const { count } = await admin
          .from('practice_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('practice_id', m.practiceId);
        if ((count ?? 0) >= seats) {
          return json({
            error: seats === 1
              ? 'Your Individual plan is single-user — switch to a Practice plan (up to 5 people) to add your team.'
              : 'Practice plans include up to 5 team members — contact us about a larger plan.',
          }, 403);
        }
        const result = await addOrInviteMember(admin, m.practiceId, m.practice?.name ?? '', email, redirectTo);
        return json(result.body, result.status);
      }

      case 'resend_invite': {
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can resend invites.' }, 403);
        if (!userId) return json({ error: 'missing userId' }, 400);
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        const { data: memRow } = await admin.from('practice_members').select('user_id').eq('practice_id', m.practiceId).eq('user_id', userId).maybeSingle();
        if (!memRow) return json({ error: 'That person is not on the team.' }, 400);
        const { data: u } = await admin.auth.admin.getUserById(userId);
        const email = (u?.user?.email ?? '').toLowerCase();
        if (!u?.user || !email) return json({ error: 'Could not find that account.' }, 404);
        if (u.user.email_confirmed_at) return json({ error: 'That account is already active — no invite to resend.' }, 400);
        // Invite links only mint for brand-new accounts, so recreate the
        // never-activated account and re-run the invite flow. Pending
        // accounts own nothing; membership + profile are re-created by
        // addOrInviteMember.
        await admin.auth.admin.deleteUser(userId);
        const result = await addOrInviteMember(admin, m.practiceId, m.practice?.name ?? '', email, redirectTo);
        return json(result.body, result.status);
      }

      case 'remove_member': {
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can remove members.' }, 403);
        if (!userId) return json({ error: 'missing userId' }, 400);
        if (userId === m.practice.owner) return json({ error: 'Transfer ownership before removing the primary owner.' }, 400);
        await admin.from('practice_members').delete().eq('practice_id', m.practiceId).eq('user_id', userId);
        await admin.from('profiles').update({ practice_id: null }).eq('id', userId).eq('practice_id', m.practiceId);
        return json({ ok: true });
      }

      case 'set_role': {
        const role = body.role === 'owner' ? 'owner' : 'member';
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can change roles.' }, 403);
        if (!userId) return json({ error: 'missing userId' }, 400);
        if (userId === m.practice.owner && role === 'member') {
          return json({ error: 'Transfer primary ownership before demoting this owner.' }, 400);
        }
        const { error } = await admin.from('practice_members').update({ role }).eq('practice_id', m.practiceId).eq('user_id', userId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'transfer_ownership': {
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can transfer ownership.' }, 403);
        if (!userId) return json({ error: 'missing userId' }, 400);
        // Target must already be a member.
        const { data: memRow } = await admin.from('practice_members').select('user_id').eq('practice_id', m.practiceId).eq('user_id', userId).maybeSingle();
        if (!memRow) return json({ error: 'That person is not on the team.' }, 400);
        await admin.from('practices').update({ owner: userId }).eq('id', m.practiceId);
        await admin.from('practice_members').update({ role: 'owner' }).eq('practice_id', m.practiceId).eq('user_id', userId);
        return json({ ok: true });
      }

      case 'set_owner_report_config': {
        // Owner report templates (src/utils/ownerReportConfig.ts). The
        // client normalizes on read, so here we only bound the payload:
        // a plain JSON object (or null to reset to the built-in report)
        // under ~50 KB.
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can change the owner report templates.' }, 403);
        const config = body.config;
        if (config !== null && (typeof config !== 'object' || Array.isArray(config))) {
          return json({ error: 'Owner report settings must be an object.' }, 400);
        }
        if (config !== null && !Array.isArray((config as Json).templates)) {
          return json({ error: 'Owner report settings need a templates list.' }, 400);
        }
        const size = new TextEncoder().encode(JSON.stringify(config)).length;
        if (size > 50 * 1024) {
          return json({ error: 'Those owner report settings are too large (50 KB max) — shorten some text or remove a template.' }, 413);
        }
        // Each save replaces the whole set, so a stale tab / device must
        // not overwrite newer templates: compare-and-swap on a version.
        // Clients send the version they loaded (expectedRev); older
        // clients that don't still bump it, so newer ones catch them.
        const STALE = 'These templates were changed on another device or tab since you opened them. Close this window, reload the page, and make your changes again.';
        const expectedRev = typeof body.expectedRev === 'number' ? body.expectedRev : null;
        const { data: cur, error: curErr } = await admin
          .from('practices').select('owner_report_config_rev').eq('id', m.practiceId).maybeSingle();
        if (curErr) {
          // Version column not added yet (migration pending): plain write.
          const { error } = await admin.from('practices').update({ owner_report_config: config }).eq('id', m.practiceId);
          if (error) throw error;
          return json({ ok: true });
        }
        const currentRev = typeof cur?.owner_report_config_rev === 'number' ? cur.owner_report_config_rev : 0;
        if (expectedRev !== null && expectedRev !== currentRev) return json({ error: STALE, conflict: true }, 409);
        const { data: updated, error } = await admin
          .from('practices')
          .update({ owner_report_config: config, owner_report_config_rev: currentRev + 1 })
          .eq('id', m.practiceId)
          .eq('owner_report_config_rev', currentRev)
          .select('owner_report_config_rev');
        if (error) throw error;
        // Another save landed between the read and this write.
        if (!updated || updated.length === 0) return json({ error: STALE, conflict: true }, 409);
        return json({ ok: true, rev: currentRev + 1 });
      }

      // Primary owner permanently deletes the practice: every chart shared
      // to it (and its images) is deleted, any subscription is cancelled,
      // members keep their accounts and private charts. The caller must
      // type the practice name (or DELETE for an unnamed practice).
      case 'delete_practice': {
        const m = await myMembership();
        if (!m || !m.practice) return json({ error: 'You’re not in a practice.' }, 400);
        if (m.practice.owner !== caller.id) {
          return json({ error: 'Only the primary owner can delete the practice.' }, 403);
        }
        const expected = (m.practice.name ?? '').trim() || 'DELETE';
        const typed = typeof body.confirm === 'string' ? body.confirm.trim() : '';
        if (typed !== expected) {
          return json({ error: `Type ${expected === 'DELETE' ? 'DELETE' : 'the practice name'} exactly to confirm.` }, 400);
        }
        await purgePractice(admin, m.practiceId);
        return json({ ok: true });
      }

      // The caller deletes their own account (and, if they're its only
      // member, the practice they own). The caller must type their email.
      case 'delete_account': {
        const email = (caller.email ?? '').trim().toLowerCase();
        const typed = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
        if (!email || typed !== email) return json({ error: 'Type your email exactly to confirm.' }, 400);
        if (caller.app_metadata?.role === 'admin') {
          return json({ error: 'Admin accounts can’t be deleted from here.' }, 400);
        }
        // practices.owner cascades on user delete — a primary owner leaving
        // would silently take everyone's shared practice with them.
        const { data: owned } = await admin.from('practices').select('id, name').eq('owner', caller.id).maybeSingle();
        if (owned) {
          const { count: others } = await admin
            .from('practice_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('practice_id', owned.id)
            .neq('user_id', caller.id);
          if ((others ?? 0) > 0) {
            return json({
              error: `You’re the primary owner of ${owned.name ? `“${owned.name}”` : 'your practice'}, which has ${others} other member${others === 1 ? '' : 's'}. Transfer ownership or delete the practice first.`,
            }, 400);
          }
        }
        await purgeAccount(admin, caller.id, owned?.id ?? null);
        return json({ ok: true });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
