// Unsubscribe from product-update emails. verify_jwt OFF: the signed token in
// the link is the credential. POST {token} (or ?t= with an RFC 8058 one-click
// body) records the opt-out; GET only redirects to the landing page, so mail
// scanners that pre-fetch links can't unsubscribe anyone.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyUnsubscribeToken } from '../_shared/unsubscribe.ts';

const APP = 'https://toothops.app';
const CORS = {
  'Access-Control-Allow-Origin': APP,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const t = url.searchParams.get('t') ?? '';
    return Response.redirect(`${APP}/unsubscribe${t ? `?t=${encodeURIComponent(t)}` : ''}`, 302);
  }
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let token = url.searchParams.get('t') ?? '';
  if (!token) {
    try { token = String(((await req.json()) as { token?: unknown }).token ?? ''); } catch { /* none */ }
  }
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userId = await verifyUnsubscribeToken(token, secret);
  if (!userId) return json({ error: 'invalid link' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secret);
  const { error } = await admin.from('marketing_opt_outs').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) return json({ error: 'could not save' }, 500);
  return json({ ok: true });
});
