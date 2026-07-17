// Team API — practice (multi-doctor) management for the signed-in user.
//
// verify_jwt ON: the gateway checks the JWT, then this function
// re-resolves the caller and enforces ownership per action with the
// service role. Adding a member requires an existing account (looked up
// by email); we never expose whether an arbitrary email has an account
// beyond the owner's own add attempt.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: Json, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
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

  // The practice the caller owns (each user owns at most one, for now).
  const myOwned = async () => {
    const { data } = await admin.from('practices').select('id, name').eq('owner', caller.id).maybeSingle();
    return data;
  };

  try {
    switch (action) {
      case 'get_team': {
        // The caller's practice: one they own, else one they're a member of.
        let practice = await myOwned();
        let role: 'owner' | 'member' | null = practice ? 'owner' : null;
        if (!practice) {
          const { data: mem } = await admin
            .from('practice_members')
            .select('practice_id, practices(id, name, owner)')
            .eq('user_id', caller.id)
            .maybeSingle();
          if (mem?.practices) {
            practice = { id: (mem.practices as { id: string }).id, name: (mem.practices as { name: string }).name };
            role = 'member';
          }
        }
        if (!practice) return json({ practice: null, role: null, members: [] });
        const { data: members } = await admin
          .from('practice_members')
          .select('user_id, role, created_at')
          .eq('practice_id', practice.id);
        // Resolve emails/names for display.
        const enriched = [];
        for (const m of members ?? []) {
          const { data: u } = await admin.auth.admin.getUserById(m.user_id);
          const { data: p } = await admin.from('profiles').select('doctor_name').eq('id', m.user_id).maybeSingle();
          enriched.push({
            userId: m.user_id,
            email: u?.user?.email ?? '',
            doctorName: p?.doctor_name ?? '',
            role: m.role,
            isYou: m.user_id === caller.id,
          });
        }
        return json({ practice, role, members: enriched });
      }

      case 'create_practice': {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return json({ error: 'Give the practice a name.' }, 400);
        const existing = await myOwned();
        if (existing) return json({ error: 'You already own a practice.' }, 400);
        const { data: prac, error: pErr } = await admin
          .from('practices')
          .insert({ name, owner: caller.id })
          .select('id, name')
          .single();
        if (pErr) throw pErr;
        // Owner is a member; set their current practice.
        await admin.from('practice_members').insert({ practice_id: prac.id, user_id: caller.id, role: 'owner' });
        await admin.from('profiles').upsert({ id: caller.id, practice_id: prac.id });
        return json({ practice: prac });
      }

      case 'add_member': {
        const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
        if (!email) return json({ error: 'Enter an email.' }, 400);
        const practice = await myOwned();
        if (!practice) return json({ error: 'Create a practice first.' }, 400);
        // Find the account by email (paged search).
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const target = list.users.find((u) => (u.email ?? '').toLowerCase() === email);
        if (!target) return json({ error: 'No account with that email. Ask them to sign up first.' }, 404);
        await admin.from('practice_members').upsert({ practice_id: practice.id, user_id: target.id, role: 'member' });
        // Point the new member at this practice if they aren't in one.
        const { data: prof } = await admin.from('profiles').select('practice_id').eq('id', target.id).maybeSingle();
        if (!prof?.practice_id) {
          await admin.from('profiles').upsert({ id: target.id, practice_id: practice.id });
        }
        return json({ ok: true });
      }

      case 'remove_member': {
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const practice = await myOwned();
        if (!practice) return json({ error: 'You do not own a practice.' }, 400);
        if (userId === caller.id) return json({ error: 'Remove yourself by deleting the practice instead.' }, 400);
        await admin.from('practice_members').delete().eq('practice_id', practice.id).eq('user_id', userId);
        // Clear their current-practice pointer if it was this one.
        await admin.from('profiles').update({ practice_id: null }).eq('id', userId).eq('practice_id', practice.id);
        return json({ ok: true });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
