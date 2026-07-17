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

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
