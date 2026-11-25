// The one-off "What's new" product-update email: who is eligible and how it is
// built. Sent by admin-api (whats_new_send); every message carries a signed
// unsubscribe link and List-Unsubscribe headers.

import { renderBrandedEmail } from './email.ts';
import { emailLanguage, emailT } from './emailStrings.ts';
import { unsubscribeToken } from './unsubscribe.ts';

export const WHATS_NEW_CAMPAIGN = 'whats-new-2026-11';
/** Accounts whose last sign-in was before this instant get the email. */
export const WHATS_NEW_CUTOFF = '2026-11-14T00:00:00Z';
const APP = 'https://toothops.app';

export interface CandidateUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
}

/** A confirmed, not-banned account that last signed in before the cutoff. */
export function isWhatsNewCandidate(u: CandidateUser, cutoff = WHATS_NEW_CUTOFF, now = Date.now()): boolean {
  if (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) return false;
  if (!u.email_confirmed_at || !u.last_sign_in_at) return false;
  if (u.banned_until && Date.parse(u.banned_until) > now) return false;
  return Date.parse(u.last_sign_in_at) < Date.parse(cutoff);
}

export async function buildWhatsNewEmail(
  language: unknown,
  userId: string,
  secret: string,
  supabaseUrl: string,
): Promise<{ subject: string; html: string; text: string; headers: Record<string, string> }> {
  const lng = emailLanguage(language);
  const token = await unsubscribeToken(userId, secret);
  const page = `${APP}/unsubscribe?t=${encodeURIComponent(token)}&lang=${lng}`;
  const oneClick = `${supabaseUrl}/functions/v1/unsubscribe?t=${encodeURIComponent(token)}`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = (['item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7'] as const).map((k) => {
    const title = emailT(lng, `whatsNew.${k}.title`);
    const body = emailT(lng, `whatsNew.${k}.body`);
    return { html: `<strong>${esc(title)}</strong><br>${esc(body)}`, text: `${title}: ${body}` };
  });
  const { html, text } = renderBrandedEmail({
    preheader: emailT(lng, 'whatsNew.preheader'),
    title: emailT(lng, 'whatsNew.title'),
    paragraphs: [emailT(lng, 'whatsNew.intro'), ...items],
    button: { label: emailT(lng, 'whatsNew.button'), url: APP },
    unsubscribe: { text: emailT(lng, 'whatsNew.unsubscribe.text'), label: emailT(lng, 'whatsNew.unsubscribe.label'), url: page },
  }, lng);
  return {
    subject: emailT(lng, 'whatsNew.subject'), html, text,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
