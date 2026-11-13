// Supabase Auth emails for the Send Email Hook (send-auth-email), in the
// user's language. Pure builders — no Deno APIs — so vitest can check them
// (scripts/i18n/authHook.test.ts). Text comes from the generated
// emailStrings.ts (source: src/locales/<lng>/authEmail.json); the layout is
// renderBrandedEmail, the same one as the dashboard templates.

import { renderBrandedEmail, sendEmail, type BrandedEmail, type RichParagraph } from './email.ts';
import { authEmailRaw, emailLanguage, type AuthEmailKey, type EmailLanguage } from './emailStrings.ts';

/** The parts of the hook payload we use (supabase.com/docs/guides/auth/auth-hooks/send-email-hook). */
export interface AuthHookPayload {
  user: {
    id?: string;
    email?: string;
    new_email?: string;
    user_metadata?: unknown;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    old_email?: string;
  };
}

export interface AuthEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The user's saved language (`user_metadata.language`, set by the app), else English. */
export function authEmailLanguage(userMetadata: unknown): EmailLanguage {
  const v = userMetadata && typeof userMetadata === 'object' ? (userMetadata as { language?: unknown }).language : undefined;
  return emailLanguage(v);
}

/** The link that verifies `tokenHash` with Supabase Auth and then redirects (to the site URL when none was given). */
export function verifyLink(siteUrl: string, supabaseUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo || siteUrl });
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/verify?${params}`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A catalog string as a paragraph: text escaped, <strong> kept, {{var}} filled (escaped in HTML). */
function rich(raw: string, vars: Record<string, string>): RichParagraph {
  const parts = raw.split(/(<\/?strong>|\{\{\s*\w+\s*\}\})/);
  const fill = (part: string) => vars[part.replace(/[{}\s]/g, '')] ?? '';
  const html = parts
    .map((part, i) => (i % 2 === 0 ? esc(part) : part.startsWith('<') ? part : esc(fill(part))))
    .join('');
  const text = parts.map((part, i) => (i % 2 === 0 ? part : part.startsWith('<') ? '' : fill(part))).join('');
  return { html, text };
}

const plain = (raw: string, vars: Record<string, string> = {}) => rich(raw, vars).text;

/** Templates with a confirmation link: today's three dashboard templates plus invite and magic link. */
const LINK_TEMPLATES: Record<string, 'confirmSignup' | 'resetPassword' | 'changeEmail' | 'invite' | 'magiclink'> = {
  signup: 'confirmSignup',
  recovery: 'resetPassword',
  email_change: 'changeEmail',
  invite: 'invite',
  magiclink: 'magiclink',
  email: 'magiclink',
};

const NOTICES: Record<string, string> = {
  password_changed_notification: 'passwordChanged',
  email_changed_notification: 'emailChanged',
  phone_changed_notification: 'phoneChanged',
  identity_linked_notification: 'identityLinked',
  identity_unlinked_notification: 'identityUnlinked',
  mfa_factor_enrolled_notification: 'mfaEnrolled',
  mfa_factor_unenrolled_notification: 'mfaUnenrolled',
};

const str = (s: unknown): string => (typeof s === 'string' ? s : '');
const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** True for an email_action_type we have copy for (anything else gets the generic notice). */
export function isKnownAuthEmailType(type: string): boolean {
  return own(LINK_TEMPLATES, type) !== undefined || own(NOTICES, type) !== undefined || type === 'reauthentication';
}

/**
 * Sends the built emails through Resend concurrently. Each carries the
 * Idempotency-Key `${webhookId}:${index}`, so a retried hook call doesn't
 * re-send what already went out. True only if every send succeeded.
 */
export async function sendAuthEmails(apiKey: string, emails: AuthEmail[], webhookId: string): Promise<boolean> {
  const results = await Promise.all(
    emails.map((m, i) => sendEmail(apiKey, m, webhookId ? { idempotencyKey: `${webhookId}:${i}` } : {})),
  );
  return results.every(Boolean);
}

/**
 * The email(s) Supabase asked us to send. One for most action types; two for
 * a secure email change (one to each address). Never throws: an unknown
 * action type gets the generic security notice.
 */
export function buildAuthEmails(payload: AuthHookPayload, supabaseUrl: string): AuthEmail[] {
  // An email without a recipient (malformed payload) can't be sent; drop it.
  return build(payload, supabaseUrl).filter((m) => m.to);
}

function build(payload: AuthHookPayload, supabaseUrl: string): AuthEmail[] {
  const user: AuthHookPayload['user'] = (payload && typeof payload.user === 'object' && payload.user) || {};
  const data: AuthHookPayload['email_data'] = (payload && typeof payload.email_data === 'object' && payload.email_data) || {};
  const lng = authEmailLanguage(user.user_metadata);
  const t = (key: string) => authEmailRaw(lng, key as AuthEmailKey) ?? '';
  const email = str(user.email);
  const newEmail = str(user.new_email);
  const type = str(data.email_action_type);
  const vars = { email, newEmail };
  const link = (tokenHash: string) =>
    verifyLink(str(data.site_url), supabaseUrl, tokenHash, type, str(data.redirect_to));
  const render = (to: string, subject: string, e: BrandedEmail): AuthEmail => ({ to, subject, ...renderBrandedEmail(e, lng) });

  const tpl = own(LINK_TEMPLATES, type);
  if (tpl) {
    const k = (name: string) => t(`${tpl}.${name}`);
    const linkEmail = (to: string, tokenHash: string) =>
      render(to, plain(k('subject'), vars), {
        preheader: plain(k('preheader'), vars),
        title: plain(k('title'), vars),
        paragraphs: [rich(k('body'), vars)],
        button: { label: plain(k('button'), vars), url: link(tokenHash) },
        footnote: plain(k('ignore'), vars),
      });

    if (type === 'email_change') {
      // Supabase's naming is intentionally crossed: the current address gets
      // token_hash_new, the new address gets token_hash.
      const hashNew = str(data.token_hash_new);
      const hash = str(data.token_hash);
      const out: AuthEmail[] = [];
      if (hashNew && email) out.push(linkEmail(email, hashNew));
      if (hash && newEmail) out.push(linkEmail(newEmail, hash));
      // Fail closed: a link meant for the new address is never sent anywhere else
      // (no new_email → no email; the handler reports the failure).
      return out;
    }
    return [linkEmail(email, str(data.token_hash))];
  }

  if (type === 'reauthentication') {
    return [
      render(email, plain(t('reauthentication.subject')), {
        preheader: plain(t('reauthentication.preheader')),
        title: plain(t('reauthentication.title')),
        paragraphs: [rich(t('reauthentication.body'), vars)],
        code: str(data.token),
        footnote: plain(t('reauthentication.ignore')),
      }),
    ];
  }

  // Security notices (known *_notification types; anything unknown gets the generic one).
  const notice = own(NOTICES, type) ?? 'generic';
  const body = plain(t(`notice.${notice}.body`));
  // An email-change notice goes to the address it was changed from, when Supabase says which.
  const to = notice === 'emailChanged' && str(data.old_email) ? str(data.old_email) : email;
  return [
    render(to, plain(t(`notice.${notice}.subject`)), {
      preheader: body,
      title: plain(t(`notice.${notice}.subject`)),
      paragraphs: [rich(t(`notice.${notice}.body`), vars)],
      footnote: plain(t('notice.footnote')),
    }),
  ];
}
