// Team invitation emails (team-api, invite-reminders) in the recipient's
// language. Pure builders — no Deno APIs — so vitest can check them
// (scripts/i18n/emails.test.ts). Text comes from the generated
// emailStrings.ts (source: src/locales/<lng>/email.json).

import type { BrandedEmail } from './email.ts';
import { emailLanguage, emailT, isEmailLanguage, type EmailLanguage } from './emailStrings.ts';

export interface InviteMessage {
  subject: string;
  email: BrandedEmail;
}

/** The invitee's saved language (profiles.chart_prefs.language) if they
 *  have one, else the language the inviter sent, else English. */
export function chooseInviteLanguage(existingPrefs: unknown, inviterLang: unknown): EmailLanguage {
  const saved = existingPrefs && typeof existingPrefs === 'object'
    ? (existingPrefs as { language?: unknown }).language
    : undefined;
  if (isEmailLanguage(saved)) return emailLanguage(saved);
  return emailLanguage(inviterLang);
}

/** New account: set a password to join `practiceName`. */
export function teamInviteEmail(lng: string, practiceName: string, url: string): InviteMessage {
  const who = practiceName || emailT(lng, 'invite.fallback.who');
  return {
    subject: emailT(lng, 'invite.subject', { who }),
    email: {
      preheader: emailT(lng, 'invite.preheader', { practice: practiceName || emailT(lng, 'invite.fallback.preheader') }),
      title: emailT(lng, 'invite.title', { practice: practiceName || emailT(lng, 'invite.fallback.title') }),
      paragraphs: [emailT(lng, 'invite.body1', { who }), emailT(lng, 'invite.body2')],
      button: { label: emailT(lng, 'common.setPasswordButton'), url },
      footnote: emailT(lng, 'invite.footnote'),
    },
  };
}

/** Existing account: a signed link asking them to accept joining. */
export function joinRequestEmail(lng: string, practiceName: string, url: string): InviteMessage {
  const name = practiceName || emailT(lng, 'join.fallback');
  return {
    subject: emailT(lng, 'join.subject', { name }),
    email: {
      preheader: emailT(lng, 'join.preheader', { name }),
      title: emailT(lng, 'join.title', { name }),
      paragraphs: [emailT(lng, 'join.body1', { name }), emailT(lng, 'join.body2')],
      button: { label: emailT(lng, 'join.button'), url },
      footnote: emailT(lng, 'join.footnote'),
    },
  };
}

const DATE_LOCALES: Record<EmailLanguage, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES' };

/** Daily reminder to a never-activated invitee; the final one names the expiry date. */
export function inviteReminderEmail(
  lng: string,
  o: { practice: string; final: boolean; expiresAt: Date | null; url: string },
): InviteMessage {
  const who = o.practice || emailT(lng, 'reminder.fallback');
  const date = o.expiresAt
    ? o.expiresAt.toLocaleDateString(DATE_LOCALES[emailLanguage(lng)], { month: 'long', day: 'numeric', timeZone: 'UTC' })
    : '';
  return {
    subject: emailT(lng, o.final ? 'reminder.subjectFinal' : 'reminder.subject', { who }),
    email: {
      preheader: emailT(lng, 'reminder.preheader', { who }),
      title: o.final ? emailT(lng, 'reminder.titleFinal') : emailT(lng, 'reminder.title', { who }),
      paragraphs: [emailT(lng, 'reminder.body1', { who }), emailT(lng, 'reminder.body2')],
      button: { label: emailT(lng, 'common.setPasswordButton'), url: o.url },
      footnote: o.final ? emailT(lng, 'reminder.footnoteFinal', { date, who }) : emailT(lng, 'reminder.footnote'),
    },
  };
}
