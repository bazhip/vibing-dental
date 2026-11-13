// Supabase Auth Send Email Hook — sends Auth's own emails (sign-up
// confirmation, password reset, email change, invite, magic link,
// reauthentication code, security notices) in the user's language through
// Resend, instead of Supabase's SMTP + dashboard templates.
//
// Deployed with verify_jwt OFF (`--no-verify-jwt`): Supabase Auth calls it
// with a Standard Webhooks signature, not a JWT. Every request is verified
// with SEND_EMAIL_HOOK_SECRET (the `v1,whsec_…` value from Dashboard →
// Authentication → Hooks); anything unsigned gets 401 and no email.
//
// A non-200 response makes Supabase report the auth request as failed, so
// the user sees an error instead of waiting for an email that never comes.
// Never log tokens, token hashes, links or user metadata.
//
// Secrets: SEND_EMAIL_HOOK_SECRET; RESEND_API_KEY (or Vault resend_api_key).
// Text: _shared/authEmails.ts (strings from src/locales/<lng>/authEmail.json).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildAuthEmails, isKnownAuthEmailType, sendAuthEmails, type AuthHookPayload } from '../_shared/authEmails.ts';
import { verifyHook } from '../_shared/hookSignature.ts';

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, message: string) => json({ error: { http_code: status, message } }, status);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return fail(405, 'method not allowed');

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers);
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '';
  // The caller only ever learns "invalid signature"; a missing secret is our problem, logged here.
  if (!secret) console.error('send-auth-email: hook secret not configured');
  const verified = verifyHook(rawBody, headers, secret);
  if (!verified.ok) return fail(401, 'invalid signature');

  const payload = verified.payload as AuthHookPayload;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  let emails;
  try {
    emails = buildAuthEmails(payload, supabaseUrl);
  } catch {
    return fail(500, 'could not build email');
  }
  const type = String(payload?.email_data?.email_action_type ?? '');
  if (!isKnownAuthEmailType(type)) console.warn('send-auth-email: unknown action type (generic notice)', type);
  if (!emails.length) {
    console.error('send-auth-email: nothing to send', type);
    return fail(500, 'no recipient');
  }

  let key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try {
      const { data } = await admin.rpc('get_resend_key').abortSignal(AbortSignal.timeout(4000));
      key = data ?? undefined;
    } catch {
      /* timeout or network error → no key, reported below */
    }
  }
  if (!key) {
    console.error('send-auth-email: no Resend key');
    return fail(500, 'send failed');
  }

  // Idempotency-Key per email (webhook-id:index): a Supabase retry after a
  // partial failure doesn't re-send the emails that already went out.
  if (!(await sendAuthEmails(key, emails, headers['webhook-id'] ?? ''))) {
    console.error('send-auth-email: send failed', type);
    return fail(500, 'send failed');
  }
  return json({});
});
