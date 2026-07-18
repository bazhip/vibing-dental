// Team API — practice (multi-doctor) management for the signed-in user.
//
// verify_jwt ON: the gateway checks the JWT, then this function
// re-resolves the caller and enforces ownership per action with the
// service role. "Owner" is a role in practice_members, so a practice can
// have several owners; practices.owner marks the primary owner (the
// billing/deletion anchor) and can be transferred.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Json, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// deno-lint-ignore no-explicit-any
async function addOrInviteMember(admin: any, practiceId: string, email: string, redirectTo?: string) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let target = list.users.find((u: { email?: string }) => (u.email ?? '').toLowerCase() === email);
  let invited = false;
  if (!target) {
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (invErr || !inv?.user) return { status: 502, body: { error: `Couldn't send the invite: ${invErr?.message ?? 'unknown error'}` } };
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
        return json({ practice: prac });
      }

      case 'add_member': {
        const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
        const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
        if (!email) return json({ error: 'Enter an email.' }, 400);
        const m = await requireOwner();
        if (!m) return json({ error: 'Only a practice owner can add members.' }, 403);
        const result = await addOrInviteMember(admin, m.practiceId, email, redirectTo);
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

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
