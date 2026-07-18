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
  const key = Deno.env.get('RESEND_API_KEY') ?? (await admin.rpc('get_resend_key')).data;
  if (key) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: INVITE_FROM,
        to: [email],
        subject: `You've been added to ${practiceName || 'a practice'} on ToothOps`,
        text:
          `You've been added to ${practiceName || 'a practice'} on ToothOps.\n\n` +
          `Set your password to activate your account:\n${link.properties.action_link}\n\n` +
          `If you weren't expecting this, you can ignore this email.`,
      }),
    }).catch(() => {});
  }
  return { user: link.user, error: null };
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
        const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 500,
        });
        if (usersError) throw usersError;
        const { data: profileRows } = await admin
          .from('profiles')
          .select('id, practice_name, doctor_name, logo_path');
        const { data: chartRows } = await admin
          .from('charts')
          .select('created_by')
          .limit(10000);
        // Team membership is the authoritative practice tie — invited
        // members have an empty profiles.practice_name, so the panel
        // needs the practice_members → practices resolution.
        const { data: memRows } = await admin.from('practice_members').select('user_id, practice_id, role');
        const { data: pracNameRows } = await admin.from('practices').select('id, name');
        const pracNameById = new Map((pracNameRows ?? []).map((p) => [p.id, p.name ?? '']));
        const memByUser = new Map((memRows ?? []).map((m) => [m.user_id, m]));
        const chartCounts = new Map<string, number>();
        for (const r of chartRows ?? []) {
          chartCounts.set(r.created_by, (chartCounts.get(r.created_by) ?? 0) + 1);
        }
        const profilesById = new Map((profileRows ?? []).map((p) => [p.id, p]));
        const users = usersData.users.map((u) => {
          const p = profilesById.get(u.id);
          const mem = memByUser.get(u.id);
          return {
            id: u.id,
            email: u.email ?? '',
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
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
          // Sole member: the practice row goes with them — un-share
          // record pointers and drop its logo first (mirrors
          // delete_practice) so nothing dangles.
          await admin.from('charts').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('report_templates').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('attachments').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.from('profiles').update({ practice_id: null }).eq('practice_id', owned.id);
          await admin.storage.from('logos').remove([`${owned.id}/logo.png`]);
        }
        // Storage objects aren't FK-cascaded — remove the logo first.
        await admin.storage.from('logos').remove([`${userId}/logo.png`]);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        // profiles / charts / report_templates cascade via FK.
        return json({ ok: true });
      }

      case 'list_practices': {
        const { data: pracs } = await admin
          .from('practices')
          .select('id, name, owner, logo_path, created_at, plan, account_type, subscription_status, billing_period_end, stripe_subscription_id, frozen_at')
          .order('created_at', { ascending: true });
        const { data: mems } = await admin.from('practice_members').select('practice_id, user_id, role');
        // A practice's chart count = charts shared to it PLUS members'
        // personal charts (practice_id NULL — e.g. rows predating team
        // sharing), so the tab matches the per-user counts in Accounts.
        const { data: chartRows } = await admin.from('charts').select('practice_id, created_by').limit(20000);
        const memberCount = new Map<string, number>();
        for (const m of mems ?? []) memberCount.set(m.practice_id, (memberCount.get(m.practice_id) ?? 0) + 1);
        const practiceByUser = new Map((mems ?? []).map((m) => [m.user_id, m.practice_id]));
        const chartCount = new Map<string, number>();
        for (const c of chartRows ?? []) {
          const pid = c.practice_id ?? practiceByUser.get(c.created_by);
          if (pid) chartCount.set(pid, (chartCount.get(pid) ?? 0) + 1);
        }
        const practices = [];
        for (const p of pracs ?? []) {
          const { data: ownerUser } = await admin.auth.admin.getUserById(p.owner);
          // The logos bucket is private — hand the panel a short-lived
          // signed URL (service role bypasses storage RLS).
          let logoUrl = '';
          if (p.logo_path) {
            const { data: signed } = await admin.storage.from('logos').createSignedUrl(p.logo_path, 3600);
            logoUrl = signed?.signedUrl ?? '';
          }
          const memberDetails = [];
          for (const m of (mems ?? []).filter((x) => x.practice_id === p.id)) {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            memberDetails.push({
              userId: m.user_id,
              email: u?.user?.email ?? '',
              role: m.role,
              pending: !u?.user?.email_confirmed_at,
              isPrimaryOwner: m.user_id === p.owner,
            });
          }
          practices.push({
            id: p.id,
            name: p.name ?? '',
            ownerEmail: ownerUser?.user?.email ?? '',
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

      case 'delete_practice': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        if (!practiceId) return json({ error: 'missing practiceId' }, 400);
        // Un-share the practice's records (keep them, owned by creators),
        // clear member pointers, then drop the practice + memberships.
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
        return json({ ok: true });
      }

      case 'practice_add_member': {
        const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
        const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        if (!practiceId || !email) return json({ error: 'missing practiceId or email' }, 400);
        const { data: pracRow } = await admin.from('practices').select('name').eq('id', practiceId).maybeSingle();
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        let target = list.users.find((u) => (u.email ?? '').toLowerCase() === email);
        let invited = false;
        if (!target) {
          const inv = await inviteViaResend(admin, email, pracRow?.name ?? '', redirectTo);
          if (inv.error || !inv.user) return json({ error: `Couldn't send the invite: ${inv.error ?? 'unknown'}` }, 502);
          target = inv.user;
          invited = true;
        }
        await admin.from('practice_members').upsert({ practice_id: practiceId, user_id: target.id, role: 'member' });
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
        // Invite links only mint for brand-new accounts, so recreate the
        // never-activated account and re-run the invite. Pending accounts
        // own nothing; the membership + profile rows are re-created here.
        const { data: pracRow } = await admin.from('practices').select('name').eq('id', practiceId).maybeSingle();
        await admin.auth.admin.deleteUser(userId);
        const inv = await inviteViaResend(admin, email, pracRow?.name ?? '', redirectTo);
        if (inv.error || !inv.user) return json({ error: `Couldn't resend the invite: ${inv.error ?? 'unknown'}` }, 502);
        await admin.from('practice_members').upsert({ practice_id: practiceId, user_id: inv.user.id, role: 'member' });
        await admin.from('profiles').upsert({ id: inv.user.id, practice_id: practiceId });
        await admin.from('practices').delete().eq('owner', inv.user.id).neq('id', practiceId);
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
        const { data: cfg } = await admin.from('app_config').select('ai_model').eq('id', 1).maybeSingle();
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
        return json({ model: cfg?.ai_model ?? 'claude-opus-4-8', models, configured: !!key });
      }

      case 'set_ai_model': {
        const model = typeof body.model === 'string' ? body.model.trim() : '';
        if (!model) return json({ error: 'missing model' }, 400);
        const { error } = await admin.from('app_config').update({ ai_model: model, updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'ai_usage': {
        // Per-user token totals + a rough cost estimate. Rates are $/million
        // tokens (input/output); cache reads billed at ~10% of input.
        const RATES: Record<string, { in: number; out: number }> = {
          'claude-opus-4-8': { in: 15, out: 75 },
          'claude-sonnet-4-6': { in: 3, out: 15 },
          'claude-haiku-4-5': { in: 0.8, out: 4 },
        };
        const rate = (model: string) => {
          const k = Object.keys(RATES).find((r) => model.startsWith(r));
          return k ? RATES[k] : { in: 5, out: 20 };
        };
        const { data: rows } = await admin
          .from('ai_usage')
          .select('user_id, model, input_tokens, output_tokens, cache_read_tokens')
          .limit(100000);
        const byUser = new Map<string, { input: number; output: number; cacheRead: number; calls: number; cost: number }>();
        let totalCost = 0;
        for (const r of rows ?? []) {
          const cur = byUser.get(r.user_id) ?? { input: 0, output: 0, cacheRead: 0, calls: 0, cost: 0 };
          const rt = rate(r.model);
          const cost =
            (r.input_tokens / 1e6) * rt.in +
            (r.output_tokens / 1e6) * rt.out +
            (r.cache_read_tokens / 1e6) * rt.in * 0.1;
          cur.input += r.input_tokens;
          cur.output += r.output_tokens;
          cur.cacheRead += r.cache_read_tokens;
          cur.calls += 1;
          cur.cost += cost;
          totalCost += cost;
          byUser.set(r.user_id, cur);
        }
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const emailById = new Map(list.users.map((u) => [u.id, u.email ?? '']));
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
        return json({ users, totalEstCostUsd: Math.round(totalCost * 100) / 100 });
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
