// Admin API — every privileged operation the admin panel offers.
//
// Deployed with verify_jwt ON: the gateway requires a valid user JWT,
// then this function re-resolves that token server-side and only
// proceeds when the caller's app_metadata.role is 'admin' (set in the
// database, never editable by users). All actions run with the service
// role; the browser never holds privileged credentials.
//
// Passwords can be SET here, never read — Supabase stores only bcrypt
// hashes.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AI_FEATURES, ALLOWED_AI_MODELS, isAiFeature, resolveAiModels } from '../_shared/aiModels.ts';
import { aggregateAiUsage, costOfAiUsage, parseAiUsageQuery } from '../_shared/aiUsageQuery.ts';
import { cancelPracticeSubscription } from '../_shared/deletion.ts';
import { freshInviteLink, isPendingAccount, markInviteRevoked, resetInviteState, safeAppUrl } from '../_shared/pendingInvites.ts';

type Json = Record<string, unknown>;

const INVITE_FROM = 'ToothOps <noreply@toothops.app>';

/** Create the account + email a set-password link via Resend (verified
 *  domain → delivers to anyone). Returns the created user or an error. */
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
  await sendInviteEmail(admin, email, practiceName, link.properties.action_link);
  return { user: link.user, error: null };
}

/** The (English, operator-sent) "you've been added" email with a
 *  set-password link. True when Resend accepted it. */
// deno-lint-ignore no-explicit-any
async function sendInviteEmail(admin: any, email: string, practiceName: string, actionLink: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (!key) return false;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: INVITE_FROM,
        to: [email],
        subject: `You've been added to ${practiceName || 'a practice'} on ToothOps`,
        text:
          `You've been added to ${practiceName || 'a practice'} on ToothOps.\n\n` +
          `Set your password to activate your account:\n${actionLink}\n\n` +
          `If you weren't expecting this, you can ignore this email.`,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Every auth user, paged (listUsers caps a page at 1000). One sweep
 *  replaces per-user getUserById calls, which ran sequentially and made
 *  the admin panel take seconds per practice. */
// deno-lint-ignore no-explicit-any
async function listAllUsers(admin: any) {
  const PER_PAGE = 1000;
  // deno-lint-ignore no-explicit-any
  const all: any[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const batch = data?.users ?? [];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}

/** Chart counts per (creator, practice) pair, counted in Postgres (see
 *  migration 20261113_admin_chart_counts). Selecting raw chart rows hit
 *  PostgREST's max-rows cap, so counts stopped growing past 1000 charts. */
type ChartCountRow = { created_by: string; practice_id: string | null; n: number };
// deno-lint-ignore no-explicit-any
async function chartCountRows(admin: any): Promise<ChartCountRow[]> {
  const { data, error } = await admin.rpc('admin_chart_counts');
  if (error) throw new Error(`Could not count charts: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

/** AI usage summed per (account, model) in Postgres (see migration
 *  20261124_admin_ai_usage_totals). Selecting raw ai_usage rows hit
 *  PostgREST's max-rows cap, so totals stopped growing past 1000 calls.
 *  Until that migration is applied, falls back to reading every row a
 *  page at a time (correct, just slower). */
type AiUsageTotal = {
  user_id: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_write_1h_tokens?: number;
};
// deno-lint-ignore no-explicit-any
async function aiUsageTotals(admin: any): Promise<AiUsageTotal[]> {
  const { data, error } = await admin.rpc('admin_ai_usage_totals');
  if (!error) return Array.isArray(data) ? data : [];
  const sums = new Map<string, AiUsageTotal>();
  const PAGE = 1000;
  const columns = 'id, user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens';
  let includeHourWrites = true;
  for (let from = 0; ; from += PAGE) {
    const readPage = (selection: string) => admin
      .from('ai_usage').select(selection)
      .not('model', 'in', '(deepgram-token,reminder-email,feedback)')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    let { data: rows, error: readError } = await readPage(includeHourWrites ? columns + ', cache_write_1h_tokens' : columns);
    if (includeHourWrites && (readError?.code === 'PGRST204' || readError?.code === '42703')) {
      includeHourWrites = false;
      ({ data: rows, error: readError } = await readPage(columns));
    }
    if (readError) throw new Error(`Could not read AI usage: ${readError.message}`);
    for (const r of rows ?? []) {
      const key = `${r.user_id}|${r.model}`;
      const cur = sums.get(key) ?? { user_id: r.user_id, model: r.model, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cache_write_1h_tokens: 0 };
      cur.calls += 1;
      cur.input_tokens += r.input_tokens ?? 0;
      cur.output_tokens += r.output_tokens ?? 0;
      cur.cache_read_tokens += r.cache_read_tokens ?? 0;
      cur.cache_write_tokens += r.cache_write_tokens ?? 0;
      cur.cache_write_1h_tokens = (cur.cache_write_1h_tokens ?? 0) + (r.cache_write_1h_tokens ?? 0);
      sums.set(key, cur);
    }
    if (!rows || rows.length < PAGE) break;
  }
  return Array.from(sums.values());
}

/** Profiles for the account list, with last_seen_at when the column
 *  exists (it ships via migration) — without it, fall back rather than
 *  lose practice names for every row. Returns the usual { data } shape. */
// deno-lint-ignore no-explicit-any
async function profileRowsWithLastSeen(admin: any) {
  const withSeen = await admin.from('profiles').select('id, practice_name, doctor_name, logo_path, last_seen_at');
  if (!withSeen.error) return withSeen;
  return admin.from('profiles').select('id, practice_name, doctor_name, logo_path');
}

// Browser calls come from the app's origins (github.io / vercel /
// localhost dev) — auth is enforced by the JWT + role check, not CORS.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Resolve the caller from their JWT and require the admin role.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: callerData } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (!caller || caller.app_metadata?.role !== 'admin') {
    return json({ error: 'forbidden' }, 403);
  }

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const action = body.action as string;
  const userId = typeof body.userId === 'string' ? body.userId : '';

  try {
    switch (action) {
      case 'stats': {
        const [{ count: charts }, { count: templates }, { count: profiles }] =
          await Promise.all([
            admin.from('charts').select('id', { count: 'exact', head: true }),
            admin.from('report_templates').select('id', { count: 'exact', head: true }),
            admin.from('profiles').select('id', { count: 'exact', head: true }),
          ]);
        return json({ users: profiles ?? 0, charts: charts ?? 0, templates: templates ?? 0 });
      }

      case 'list_users': {
        // Independent reads — run them together, not one after another.
        // Team membership is the authoritative practice tie — invited
        // members have an empty profiles.practice_name, so the panel
        // needs the practice_members → practices resolution.
        const [
          authUsers,
          { data: profileRows },
          chartRows,
          { data: memRows },
          { data: pracNameRows },
        ] = await Promise.all([
          listAllUsers(admin),
          profileRowsWithLastSeen(admin),
          chartCountRows(admin),
          admin.from('practice_members').select('user_id, practice_id, role'),
          admin.from('practices').select('id, name'),
        ]);
        const pracNameById = new Map((pracNameRows ?? []).map((p) => [p.id, p.name ?? '']));
        const memByUser = new Map((memRows ?? []).map((m) => [m.user_id, m]));
        const chartCounts = new Map<string, number>();
        for (const r of chartRows ?? []) {
          chartCounts.set(r.created_by, (chartCounts.get(r.created_by) ?? 0) + Number(r.n));
        }
        const profilesById = new Map((profileRows ?? []).map((p) => [p.id, p]));
        // deno-lint-ignore no-explicit-any
        const users = authUsers.map((u: any) => {
          const p = profilesById.get(u.id);
          const mem = memByUser.get(u.id);
          return {
            id: u.id,
            email: u.email ?? '',
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
            // App activity (migration 20261114_last_seen); null until the
            // user next opens the app, or if the column isn't there yet.
            lastSeenAt: p?.last_seen_at ?? null,
            emailConfirmed: !!u.email_confirmed_at,
            isAdmin: u.app_metadata?.role === 'admin',
            practiceName: p?.practice_name ?? '',
            doctorName: p?.doctor_name ?? '',
            hasLogo: !!p?.logo_path,
            chartCount: chartCounts.get(u.id) ?? 0,
            teamPractice: mem ? (pracNameById.get(mem.practice_id) ?? '') : '',
            teamRole: mem?.role ?? '',
          };
        });
        return json({ users });
      }

      case 'set_password': {
        const password = typeof body.password === 'string' ? body.password : '';
        if (!userId) return json({ error: 'missing userId' }, 400);
        if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'reset_link': {
        // Generate a recovery link the admin can hand to the user out of
        // band (the built-in mailer is rate-limited and Resend's free
        // tier can't email arbitrary recipients yet).
        const email = typeof body.email === 'string' ? body.email : '';
        if (!email) return json({ error: 'missing email' }, 400);
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
        });
        if (error) throw error;
        return json({ link: data.properties?.action_link ?? '' });
      }

      case 'confirm_email': {
        if (!userId) return json({ error: 'missing userId' }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'update_profile': {
        if (!userId) return json({ error: 'missing userId' }, 400);
        const { error } = await admin.from('profiles').upsert({
          id: userId,
          practice_name: typeof body.practiceName === 'string' ? body.practiceName : '',
          doctor_name: typeof body.doctorName === 'string' ? body.doctorName : '',
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'remove_logo': {
        if (!userId) return json({ error: 'missing userId' }, 400);
        await admin.storage.from('logos').remove([`${userId}/logo.png`]);
        const { error } = await admin.from('profiles').update({ logo_path: '' }).eq('id', userId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'delete_user': {
        if (!userId) return json({ error: 'missing userId' }, 400);
        if (userId === caller.id) return json({ error: 'You cannot delete the admin account you are signed in with.' }, 400);
        // practices.owner cascades on user delete — deleting a primary
        // owner would silently take the whole practice (and everyone's
        // shared access) with them. Force an explicit transfer first
        // when anyone else is on the team.
        const { data: owned } = await admin.from('practices').select('id, name').eq('owner', userId).maybeSingle();
        if (owned) {
          const { count: others } = await admin
            .from('practice_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('practice_id', owned.id)
            .neq('user_id', userId);
          if ((others ?? 0) > 0) {
            return json({
              error: `This account is the primary owner of "${owned.name || 'a practice'}" with ${others} other member${others === 1 ? '' : 's'} — transfer ownership (Practices tab → Make owner) before deleting it.`,
            }, 400);
          }
          // Sole member: the practice row goes with them. Cancel its Stripe
          // subscription first (it would keep billing a practice that no
          // longer exists; throws, stopping here, if it can't be
          // cancelled), then un-share record pointers and drop its logo
          // (mirrors delete_practice) so nothing dangles.
          await cancelPracticeSubscription(admin, owned.id);
          await admin.from('charts').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('report_templates').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('attachments').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('profiles').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.storage.from('logos').remove([`${owned.id}/logo.png`]);
        }
        // A member of someone else's practice: their charts are practice
        // records, not theirs to take with them. Hand shared rows to the
        // practice's primary owner so the FK cascade doesn't delete them.
        if (!owned) {
          const { data: mems } = await admin.from('practice_members').select('practice_id, practices(owner)').eq('user_id', userId);
          for (const m of mems ?? []) {
            const newOwner = (m.practices as { owner?: string } | null)?.owner;
            if (!newOwner || newOwner === userId) continue;
            for (const table of ['charts', 'report_templates', 'attachments']) {
              await admin.from(table).update({ created_by: newOwner }).eq('created_by', userId).eq('practice_id', m.practice_id);
            }
          }
        }
        // Storage objects aren't FK-cascaded — remove the logo first.
        await admin.storage.from('logos').remove([`${userId}/logo.png`]);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        // profiles / personal (unshared) charts / templates cascade via FK.
        return json({ ok: true });
      }

      case 'list_practices': {
        // owner_report_enabled comes from a later migration. If it hasn't
        // been applied, retry without it rather than silently listing no
        // practices; any other error surfaces in the panel.
        const BASE_COLS = 'id, name, owner, logo_path, created_at, plan, account_type, subscription_status, billing_period_end, stripe_subscription_id, frozen_at';
        // Members, charts and auth users don't depend on the practice
        // rows — start them now and await after.
        const sidePromise = Promise.all([
          admin.from('practice_members').select('practice_id, user_id, role'),
          chartCountRows(admin),
          listAllUsers(admin),
        ]);
        // pims_send_enabled (20261125) is optional the same way: retry
        // without it, then without owner_report_enabled as well.
        const FLAG_COLS = ['owner_report_enabled', 'pims_send_enabled'];
        let pracRes = await admin.from('practices').select(`${BASE_COLS}, ${FLAG_COLS.join(', ')}`).order('created_at', { ascending: true });
        if (pracRes.error && /pims_send_enabled/.test(pracRes.error.message)) {
          pracRes = await admin.from('practices').select(`${BASE_COLS}, owner_report_enabled`).order('created_at', { ascending: true });
        }
        if (pracRes.error && /owner_report_enabled/.test(pracRes.error.message)) {
          pracRes = await admin.from('practices').select(BASE_COLS).order('created_at', { ascending: true });
        }
        if (pracRes.error) throw new Error(`Could not list practices: ${pracRes.error.message}`);
        const pracs = pracRes.data as Array<Record<string, any>>;
        const [{ data: mems }, chartRows, authUsers] = await sidePromise;
        // deno-lint-ignore no-explicit-any
        const userById = new Map(authUsers.map((u: any) => [u.id, u]));
        // The logos bucket is private — hand the panel short-lived signed
        // URLs (service role bypasses storage RLS), all in one request.
        const logoPaths = (pracs ?? []).map((p) => p.logo_path).filter((x): x is string => !!x);
        const logoUrlByPath = new Map<string, string>();
        if (logoPaths.length) {
          const { data: signedList } = await admin.storage.from('logos').createSignedUrls(logoPaths, 3600);
          for (const s of signedList ?? []) {
            if (s.path && s.signedUrl) logoUrlByPath.set(s.path, s.signedUrl);
          }
        }
        // A practice's chart count = charts shared to it PLUS members'
        // personal charts (practice_id NULL — e.g. rows predating team
        // sharing), so the tab matches the per-user counts in Accounts.
        const memberCount = new Map<string, number>();
        for (const m of mems ?? []) memberCount.set(m.practice_id, (memberCount.get(m.practice_id) ?? 0) + 1);
        const practiceByUser = new Map((mems ?? []).map((m) => [m.user_id, m.practice_id]));
        const chartCount = new Map<string, number>();
        for (const c of chartRows ?? []) {
          const pid = c.practice_id ?? practiceByUser.get(c.created_by);
          if (pid) chartCount.set(pid, (chartCount.get(pid) ?? 0) + Number(c.n));
        }
        const practices = [];
        for (const p of pracs ?? []) {
          // deno-lint-ignore no-explicit-any
          const ownerUser: any = userById.get(p.owner);
          const logoUrl = p.logo_path ? (logoUrlByPath.get(p.logo_path) ?? '') : '';
          const memberDetails = [];
          for (const m of (mems ?? []).filter((x) => x.practice_id === p.id)) {
            // deno-lint-ignore no-explicit-any
            const u: any = userById.get(m.user_id);
            memberDetails.push({
              userId: m.user_id,
              email: u?.email ?? '',
              role: m.role,
              pending: !u?.email_confirmed_at,
              isPrimaryOwner: m.user_id === p.owner,
            });
          }
          practices.push({
            id: p.id,
            name: p.name ?? '',
            ownerEmail: ownerUser?.email ?? '',
            logoUrl,
            memberCount: memberCount.get(p.id) ?? 0,
            chartCount: chartCount.get(p.id) ?? 0,
            members: memberDetails,
            plan: p.plan === 'pro' ? 'pro' : 'basic',
            accountType: p.account_type === 'practice' ? 'practice' : 'individual',
            subscriptionStatus: p.subscription_status ?? 'none',
            periodEnd: p.billing_period_end ?? null,
            frozenAt: p.frozen_at ?? null,
            hasStripe: !!p.stripe_subscription_id,
            ownerReportEnabled: !!p.owner_report_enabled,
            pimsSendEnabled: !!p.pims_send_enabled,
          });
        }
        return json({ practices });
      }

      case 'rename_practice': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        const { error } = await admin.from('practices').update({ name }).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      // Per-practice feature flags. One column per feature keeps the
      // schema self-documenting; extend the map as features graduate
      // from beta.
      case 'set_feature': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const feature = typeof body.feature === 'string' ? body.feature : '';
        const enabled = body.enabled === true;
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        const FEATURE_COLUMNS: Record<string, string> = {
          owner_report: 'owner_report_enabled',
          pims_send: 'pims_send_enabled',
        };
        const column = FEATURE_COLUMNS[feature];
        if (!column) return json({ error: `unknown feature: ${feature}` }, 400);
        const { error } = await admin.from('practices').update({ [column]: enabled }).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'list_practice_charts': {
        // A practice's charts for the admin chart viewer — metadata only,
        // newest visit first. Viewing one goes through view_chart (logged).
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        const { data, error } = await admin
          .from('charts')
          .select('id, patient_name, patient_number, species, chart_date, updated_at')
          .eq('practice_id', practiceId)
          .order('chart_date', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return json({ charts: data ?? [] });
      }

      case 'list_user_charts': {
        // One account's charts (the ones they created — the same rows the
        // Accounts tab's chart count tallies), for the admin chart viewer.
        // Metadata only; opening one still goes through view_chart (logged).
        const userId = typeof body.userId === 'string' ? body.userId : '';
        if (!userId) return json({ error: 'missing userId' }, 400);
        const { data, error } = await admin
          .from('charts')
          .select('id, patient_name, patient_number, species, chart_date, updated_at')
          .eq('created_by', userId)
          .order('chart_date', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return json({ charts: data ?? [] });
      }

      case 'view_chart': {
        // Read one chart from any practice, read-only. Every view is
        // written to admin_chart_views first — no audit row, no chart.
        const chartId = typeof body.chartId === 'string' ? body.chartId : '';
        if (!chartId) return json({ error: 'missing chartId' }, 400);
        const { data: row, error } = await admin
          .from('charts')
          .select('id, practice_id, data, updated_at')
          .eq('id', chartId)
          .maybeSingle();
        if (error) throw error;
        if (!row) return json({ error: 'chart not found' }, 404);
        const { error: logError } = await admin
          .from('admin_chart_views')
          .insert({ admin_id: caller.id, chart_id: row.id, practice_id: row.practice_id });
        if (logError) throw logError;
        return json({ chart: { id: row.id, data: row.data, updatedAt: row.updated_at } });
      }

      case 'delete_practice': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        // Cancel the Stripe subscription first: deleting the row never told
        // Stripe, so the card kept being charged. Throws (and stops) if it
        // can't be cancelled. Then un-share the practice's records (keep
        // them, owned by creators), clear member pointers, and drop the
        // practice + memberships.
        await cancelPracticeSubscription(admin, practiceId);
        await admin.from('charts').update({ practice_id: null }).eq('practice_id', practiceId);
        await admin.from('report_templates').update({ practice_id: null }).eq('practice_id', practiceId);
        await admin.from('attachments').update({ practice_id: null }).eq('practice_id', practiceId);
        await admin.from('profiles').update({ practice_id: null }).eq('practice_id', practiceId);
        const { error } = await admin.from('practices').delete().eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'set_practice_logo': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
        if (!practiceId || !dataBase64) return json({ error: 'missing practiceId or image' }, 400);
        const bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0));
        const path = `${practiceId}/logo.png`;
        const up = await admin.storage.from('logos').upload(path, bytes, { upsert: true, contentType: 'image/png' });
        if (up.error) return json({ error: up.error.message }, 502);
        const { error } = await admin.from('practices').update({ logo_path: path }).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'remove_practice_logo': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        await admin.storage.from('logos').remove([`${practiceId}/logo.png`]);
        const { error } = await admin.from('practices').update({ logo_path: '' }).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'set_practice_owner': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId || !userId) return json({ error: 'missing practiceId or userId' }, 400);
        // The new owner must already be on the team.
        const { data: memRow } = await admin.from('practice_members').select('user_id').eq('practice_id', practiceId).eq('user_id', userId).maybeSingle();
        if (!memRow) return json({ error: 'That account is not a member of the practice.' }, 400);
        await admin.from('practices').update({ owner: userId }).eq('id', practiceId);
        await admin.from('practice_members').update({ role: 'owner' }).eq('practice_id', practiceId).eq('user_id', userId);
        return json({ ok: true });
      }

      case 'practice_remove_member': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId || !userId) return json({ error: 'missing ids' }, 400);
        await admin.from('practice_members').delete().eq('practice_id', practiceId).eq('user_id', userId);
        await admin.from('profiles').update({ practice_id: null }).eq('id', userId).eq('practice_id', practiceId);
        // Pending invitee removed before activating: stop reminder emails.
        const { data: removed } = await admin.auth.admin.getUserById(userId);
        if (isPendingAccount(removed?.user)) await markInviteRevoked(admin, removed.user);
        return json({ ok: true });
      }

      case 'practice_add_member': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        if (!practiceId || !email) return json({ error: 'missing practiceId or email' }, 400);
        const { data: pracRow } = await admin.from('practices').select('name').eq('id', practiceId).maybeSingle();
        // deno-lint-ignore no-explicit-any
        let target = (await listAllUsers(admin)).find((u: any) => (u.email ?? '').toLowerCase() === email);
        let invited = false;
        if (!target) {
          const inv = await inviteViaResend(admin, email, pracRow?.name ?? '', redirectTo);
          if (inv.error || !inv.user) return json({ error: `Couldn't send the invite: ${inv.error ?? 'unknown'}` }, 502);
          target = inv.user;
          invited = true;
        }
        await admin.from('practice_members').upsert({ practice_id: practiceId, user_id: target.id, role: 'member' });
        // Re-adding a pending invitee (e.g. removed earlier): reminders resume.
        if (!invited && isPendingAccount(target)) await resetInviteState(admin, target);
        if (invited) {
          await admin.from('profiles').upsert({ id: target.id, practice_id: practiceId });
          await admin.from('practices').delete().eq('owner', target.id).neq('id', practiceId);
        } else {
          const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', target.id).maybeSingle();
          if (!prof?.practice_id) await admin.from('profiles').upsert({ id: target.id, practice_id: practiceId });
        }
        // Joining shares the member's existing personal records with the
        // practice (new saves stamp practice_id on their own).
        await admin.from('charts').update({ practice_id: practiceId }).eq('created_by', target.id).is('practice_id', null);
        await admin.from('report_templates').update({ practice_id: practiceId }).eq('created_by', target.id).is('practice_id', null);
        await admin.from('attachments').update({ practice_id: practiceId }).eq('created_by', target.id).is('practice_id', null);
        return json({ ok: true, invited });
      }

      case 'practice_resend_invite': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        if (!practiceId || !userId) return json({ error: 'missing ids' }, 400);
        const { data: memRow } = await admin.from('practice_members').select('user_id').eq('practice_id', practiceId).eq('user_id', userId).maybeSingle();
        if (!memRow) return json({ error: 'That account is not a member of the practice.' }, 400);
        const { data: u } = await admin.auth.admin.getUserById(userId);
        const email = (u?.user?.email ?? '').toLowerCase();
        if (!u?.user || !email) return json({ error: 'Could not find that account.' }, 404);
        if (u.user.email_confirmed_at) return json({ error: 'That account is already active — no invite to resend.' }, 400);
        // Fresh set-password link for the same account. (This used to delete
        // the account and re-invite: if that failed, the person was gone.)
        const { data: pracRow } = await admin.from('practices').select('name').eq('id', practiceId).maybeSingle();
        const link = await freshInviteLink(admin, email, safeAppUrl(redirectTo));
        if (!link) return json({ error: "Couldn't create a new invite link." }, 502);
        const sent = await sendInviteEmail(admin, email, pracRow?.name ?? '', link);
        if (!sent) return json({ error: "Couldn't send the invite email." }, 502);
        // Start the invite over (else the expiry job could delete the account).
        await resetInviteState(admin, u.user);
        return json({ ok: true });
      }

      case 'set_plan': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const plan = body.plan === 'pro' ? 'pro' : 'basic';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        const { error } = await admin.from('practices').update({ plan }).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'set_billing': {
        // Admin overrides on the billing columns: flip the account type
        // (seat limit) or comp a practice (full access, no Stripe).
        // Practices with a live Stripe subscription are Stripe's to
        // manage — their status only changes via the webhook.
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        const { data: prac } = await admin
          .from('practices')
          .select('subscription_status, stripe_subscription_id')
          .eq('id', practiceId)
          .maybeSingle();
        if (!prac) return json({ error: 'practice not found' }, 404);
        const update: Record<string, unknown> = {};
        if (body.accountType === 'individual' || body.accountType === 'practice') {
          if (body.accountType === 'individual') {
            // Individual = 1 seat; don't strand a team behind the limit.
            const { count } = await admin
              .from('practice_members')
              .select('user_id', { count: 'exact', head: true })
              .eq('practice_id', practiceId);
            if ((count ?? 0) > 1) {
              return json({ error: `This practice has ${count} members — Individual is single-seat. Remove the other members first.` }, 400);
            }
          }
          update.account_type = body.accountType;
        }
        if (typeof body.comped === 'boolean') {
          if (prac.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(prac.subscription_status ?? '')) {
            return json({ error: 'This practice has a live Stripe subscription — cancel it in Stripe (or via the owner\'s billing portal) before comping.' }, 400);
          }
          update.subscription_status = body.comped ? 'comped' : 'none';
        }
        if (Object.keys(update).length === 0) return json({ error: 'nothing to change' }, 400);
        const { error } = await admin.from('practices').update(update).eq('id', practiceId);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'get_ai_config': {
        const { data: cfg } = await admin.from('app_config').select('*').eq('id', 1).maybeSingle();
        const key = Deno.env.get('ANTHROPIC_API_KEY');
        let models: Array<{ id: string; displayName: string }> = [];
        if (key) {
          try {
            const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
              headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            });
            if (r.ok) {
              const d = await r.json();
              models = (d.data ?? []).map((m: { id: string; display_name?: string }) => ({
                id: m.id,
                displayName: m.display_name ?? m.id,
              }));
            }
          } catch { /* leave models empty */ }
        }
        // featureModels: the model each feature uses now (defaults filled in).
        return json({ featureModels: resolveAiModels(cfg?.ai_models), models, configured: !!key });
      }

      case 'set_ai_model': {
        // body.feature: 'live' | 'review' | 'owner_report' | 'radiology_report'.
        const feature = body.feature;
        if (!isAiFeature(feature)) return json({ error: `unknown feature: ${String(feature)}` }, 400);
        const model = typeof body.model === 'string' ? body.model.trim() : '';
        if (!model) return json({ error: 'missing model' }, 400);
        // Only models ai-autofill has tuned request settings for
        // (MODEL_SETTINGS there; AI_MODEL_CHOICES in the app).
        if (!ALLOWED_AI_MODELS.includes(model)) return json({ error: `unsupported model: ${model}` }, 400);
        const { data: cfg, error: readError } = await admin.from('app_config').select('*').eq('id', 1).maybeSingle();
        if (readError) throw readError;
        if (!cfg || !('ai_models' in cfg)) {
          return json({ error: 'app_config.ai_models is missing — apply migration 20261128_ai_models_per_feature first.' }, 409);
        }
        const next = { ...resolveAiModels(cfg.ai_models), [feature]: model };
        const { error } = await admin.from('app_config').update({ ai_models: next, updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) throw error;
        return json({ ok: true, featureModels: next });
      }

      case 'ai_usage_query': {
        const query = parseAiUsageQuery(body);
        if (!query) return json({ error: 'Invalid AI usage filters.' }, 400);
        const { data, error } = await admin.rpc('admin_ai_usage_query', {
          from_date: query.from || null, to_date: query.to || null,
          filter_kind: query.kind || null, filter_model: query.model || null, daily: query.groupBy === 'day',
        });
        if (error?.code === 'PGRST202' || error?.code === '42883') return json({ error: 'AI usage query migration not applied.' }, 503);
        if (error) throw error;
        const emails = new Map<string, string>((await listAllUsers(admin)).map(user => [user.id, user.email ?? '']));
        return json({ ...aggregateAiUsage(data, query.groupBy, emails) });
      }

      case 'ai_usage': {
        const byUser = new Map<string, { input: number; output: number; cacheRead: number; calls: number; cost: number }>();
        let totalCost = 0;
        for (const r of await aiUsageTotals(admin)) {
          const cur = byUser.get(r.user_id) ?? { input: 0, output: 0, cacheRead: 0, calls: 0, cost: 0 };
          const cost = costOfAiUsage(r);
          cur.input += r.input_tokens;
          cur.output += r.output_tokens;
          cur.cacheRead += r.cache_read_tokens;
          cur.calls += r.calls;
          cur.cost += cost;
          totalCost += cost;
          byUser.set(r.user_id, cur);
        }
        // deno-lint-ignore no-explicit-any
        const emailById = new Map((await listAllUsers(admin)).map((u: any) => [u.id, u.email ?? '']));
        const users = Array.from(byUser.entries())
          .map(([userId, v]) => ({
            userId,
            email: emailById.get(userId) ?? '(deleted)',
            calls: v.calls,
            inputTokens: v.input,
            outputTokens: v.output,
            cacheReadTokens: v.cacheRead,
            estCostUsd: Math.round(v.cost * 100) / 100,
          }))
          .sort((a, b) => b.estCostUsd - a.estCostUsd);
        // Last 30 days split by feature and model, so the admin can see where
        // the money goes. Empty until migration 20261128 is applied.
        const FEATURE_DAYS = 30;
        const byFeature: Array<{ feature: string; model: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; estCostUsd: number; costPerCallUsd: number }> = [];
        const { data: featureRows, error: featureError } = await admin.rpc('admin_ai_usage_by_feature', {
          since: new Date(Date.now() - FEATURE_DAYS * 86_400_000).toISOString(),
        });
        if (!featureError && Array.isArray(featureRows)) {
          for (const r of featureRows as Array<AiUsageTotal & { kind: string }>) {
            const cost = costOfAiUsage(r);
            byFeature.push({
              feature: r.kind,
              model: r.model,
              calls: r.calls,
              inputTokens: r.input_tokens,
              outputTokens: r.output_tokens,
              cacheReadTokens: r.cache_read_tokens,
              estCostUsd: Math.round(cost * 100) / 100,
              costPerCallUsd: r.calls ? Math.round((cost / r.calls) * 100_000) / 100_000 : 0,
            });
          }
          byFeature.sort((a, b) => b.estCostUsd - a.estCostUsd);
        }
        return json({ users, totalEstCostUsd: Math.round(totalCost * 100) / 100, byFeature, featureDays: FEATURE_DAYS, features: AI_FEATURES });
      }

      case 'ai_balance': {
        // Best-effort. Deepgram exposes balances (needs a scoped key);
        // Anthropic has no public balance endpoint, so we report usage cost.
        const out: { deepgram: string | null; note: string } = {
          deepgram: null,
          note: 'Anthropic exposes no balance API — see the token-cost estimate above. Deepgram balance requires a key with balances:read.',
        };
        const dg = Deno.env.get('DEEPGRAM_API_KEY');
        if (dg) {
          try {
            const pr = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${dg}` } });
            if (pr.ok) {
              const pj = await pr.json();
              const pid = pj?.projects?.[0]?.project_id;
              if (pid) {
                const br = await fetch(`https://api.deepgram.com/v1/projects/${pid}/balances`, { headers: { Authorization: `Token ${dg}` } });
                if (br.ok) {
                  const bj = await br.json();
                  const bal = bj?.balances?.[0];
                  if (bal) out.deepgram = `$${Number(bal.amount).toFixed(2)} ${bal.units ?? ''}`.trim();
                }
              }
            }
          } catch { /* leave null */ }
        }
        return json(out);
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
