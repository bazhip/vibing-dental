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
        const chartCounts = new Map<string, number>();
        for (const r of chartRows ?? []) {
          chartCounts.set(r.created_by, (chartCounts.get(r.created_by) ?? 0) + 1);
        }
        const profilesById = new Map((profileRows ?? []).map((p) => [p.id, p]));
        const users = usersData.users.map((u) => {
          const p = profilesById.get(u.id);
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
          .select('id, name, owner, created_at')
          .order('created_at', { ascending: true });
        const { data: mems } = await admin.from('practice_members').select('practice_id, user_id, role');
        const { data: chartRows } = await admin.from('charts').select('practice_id').not('practice_id', 'is', null).limit(20000);
        const memberCount = new Map<string, number>();
        for (const m of mems ?? []) memberCount.set(m.practice_id, (memberCount.get(m.practice_id) ?? 0) + 1);
        const chartCount = new Map<string, number>();
        for (const c of chartRows ?? []) if (c.practice_id) chartCount.set(c.practice_id, (chartCount.get(c.practice_id) ?? 0) + 1);
        const practices = [];
        for (const p of pracs ?? []) {
          const { data: ownerUser } = await admin.auth.admin.getUserById(p.owner);
          const memberDetails = [];
          for (const m of (mems ?? []).filter((x) => x.practice_id === p.id)) {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            memberDetails.push({ userId: m.user_id, email: u?.user?.email ?? '', role: m.role });
          }
          practices.push({
            id: p.id,
            name: p.name ?? '',
            ownerEmail: ownerUser?.user?.email ?? '',
            memberCount: memberCount.get(p.id) ?? 0,
            chartCount: chartCount.get(p.id) ?? 0,
            members: memberDetails,
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
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        let target = list.users.find((u) => (u.email ?? '').toLowerCase() === email);
        let invited = false;
        if (!target) {
          // No account yet — invite them (creates the account + emails a
          // set-password link).
          const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(
            email,
            redirectTo ? { redirectTo } : undefined
          );
          if (invErr || !inv?.user) return json({ error: `Couldn't send the invite: ${invErr?.message ?? 'unknown'}` }, 502);
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
        return json({ ok: true, invited });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
