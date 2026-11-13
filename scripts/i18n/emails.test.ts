// @vitest-environment node
// Transactional emails sent by edge functions (team-api, invite-reminders).
// Edge functions can't import src/, so their strings are generated from
// src/locales/<lng>/email.json into supabase/functions/_shared/emailStrings.ts.
import { readFileSync } from 'node:fs';
import { loadCatalogs } from './catalog';
import { EMAIL_STRINGS_FILE, emailStringsProblem, generateEmailStrings } from './gen-email-strings';
import { EMAIL_LANGUAGES, emailT } from '../../supabase/functions/_shared/emailStrings.ts';
import { renderBrandedEmail, type BrandedEmail } from '../../supabase/functions/_shared/email.ts';
import {
  chooseInviteLanguage,
  inviteReminderEmail,
  joinRequestEmail,
  teamInviteEmail,
} from '../../supabase/functions/_shared/inviteEmails.ts';

// Rendered from the pre-localization code (same inputs as below): the oracle
// for "English output is byte-identical".
type Snap = { subject: string; html: string; text: string };
const SNAP: Record<string, Snap> = JSON.parse(readFileSync('scripts/i18n/fixtures/emails-en.snapshot.json', 'utf8'));
const URL = 'https://toothops.app/#/join/abc.def?x=1&y="2"';
const EXPIRES = new Date(Date.UTC(2026, 10, 27, 23, 30));

const render = (m: { subject: string; email: BrandedEmail }, lng = 'en'): Snap => ({
  subject: m.subject,
  ...renderBrandedEmail(m.email, lng),
});

describe('generated emailStrings.ts', () => {
  test('is current: generating from the catalogs reproduces the committed file', () => {
    expect(generateEmailStrings(loadCatalogs())).toBe(readFileSync(EMAIL_STRINGS_FILE, 'utf8'));
    expect(emailStringsProblem(loadCatalogs())).toBeNull();
  });

  test('a changed email.json without regenerating is reported', () => {
    const c = loadCatalogs();
    c.fr.email['invite.subject'] = 'Autre chose';
    expect(emailStringsProblem(c)).toMatch(/npm run i18n:emails/);
  });

  test('has no imports and starts with the generated header', () => {
    const text = readFileSync(EMAIL_STRINGS_FILE, 'utf8');
    expect(text.split('\n')[0]).toMatch(/generated — run npm run i18n:emails/i);
    expect(text).not.toMatch(/^import /m);
  });
});

describe('English is byte-identical to before', () => {
  for (const [tag, practice] of [['named', 'Happy Paws <Vet> & Co'], ['unnamed', '']] as const) {
    test(`team invite (${tag})`, () => {
      expect(render(teamInviteEmail('en', practice, URL))).toEqual(SNAP[`invite.${tag}`]);
    });
    test(`existing-account join request (${tag})`, () => {
      expect(render(joinRequestEmail('en', practice, URL))).toEqual(SNAP[`join.${tag}`]);
    });
    test(`invite reminder (${tag})`, () => {
      expect(render(inviteReminderEmail('en', { practice, final: false, expiresAt: null, url: URL }))).toEqual(SNAP[`reminder.${tag}`]);
    });
    test(`final invite reminder (${tag})`, () => {
      expect(render(inviteReminderEmail('en', { practice, final: true, expiresAt: EXPIRES, url: URL }))).toEqual(SNAP[`reminderFinal.${tag}`]);
    });
  }

  test('layout without a footnote; default language is English', () => {
    const e = { preheader: 'P', title: 'T', paragraphs: ['a', 'b'], button: { label: 'Go', url: URL } };
    const { html, text } = SNAP['layout.noFootnote'];
    expect(renderBrandedEmail(e)).toEqual({ html, text });
    expect(renderBrandedEmail(e, 'en')).toEqual({ html, text });
  });

  test('emailT(en) returns today’s literal subjects', () => {
    expect(emailT('en', 'invite.subject', { who: 'Acme' })).toBe('Acme invited you to ToothOps');
    expect(emailT('en', 'join.subject', { name: 'Acme' })).toBe('Join Acme on ToothOps?');
    expect(emailT('en', 'reminder.subject', { who: 'Acme' })).toBe('Reminder: Acme invited you to ToothOps');
    expect(emailT('en', 'reminder.subjectFinal', { who: 'Acme' })).toBe('Last reminder: join Acme on ToothOps');
  });
});

describe('localized emails', () => {
  test('renderBrandedEmail(fr) sets lang="fr" and French layout text', () => {
    const { html, text } = renderBrandedEmail(teamInviteEmail('fr', 'Clinique', URL).email, 'fr');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain(emailT('fr', 'layout.linkFallback'));
    expect(html).toContain(`ToothOps · ${emailT('fr', 'layout.tagline')} · `);
    expect(html).not.toContain('copy this link');
    expect(html).not.toContain('Veterinary dental charting');
    expect(text.endsWith('— ToothOps · toothops.app')).toBe(true);
  });

  test('every language fills every placeholder and differs from English', () => {
    for (const lng of EMAIL_LANGUAGES) {
      for (const practice of ['Acme', '']) {
        const all = [
          teamInviteEmail(lng, practice, URL),
          joinRequestEmail(lng, practice, URL),
          inviteReminderEmail(lng, { practice, final: false, expiresAt: null, url: URL }),
          inviteReminderEmail(lng, { practice, final: true, expiresAt: EXPIRES, url: URL }),
        ];
        for (const m of all) {
          const out = render(m, lng);
          expect(out.subject + out.html + out.text).not.toMatch(/\{\{|\}\}/);
        }
      }
      if (lng === 'en') continue;
      expect(teamInviteEmail(lng, 'Acme', URL).subject).not.toBe(teamInviteEmail('en', 'Acme', URL).subject);
      expect(joinRequestEmail(lng, 'Acme', URL).subject).not.toBe(joinRequestEmail('en', 'Acme', URL).subject);
    }
  });

  test('the final reminder writes the expiry date in the recipient’s language', () => {
    const fr = inviteReminderEmail('fr', { practice: 'Acme', final: true, expiresAt: EXPIRES, url: URL });
    expect(fr.email.footnote).toContain('27 novembre');
    const de = inviteReminderEmail('de', { practice: 'Acme', final: true, expiresAt: EXPIRES, url: URL });
    expect(de.email.footnote).toContain('27. November');
  });

  test('emailT interpolates and falls back to English for unknown languages', () => {
    expect(emailT('fr', 'invite.subject', { who: 'Acme' })).toContain('Acme');
    expect(emailT('fr-CA', 'invite.subject', { who: 'Acme' })).toBe(emailT('fr', 'invite.subject', { who: 'Acme' }));
    expect(emailT('ja', 'invite.subject', { who: 'Acme' })).toBe('Acme invited you to ToothOps');
    expect(emailT('xx', 'join.subject', { name: 'A' })).toBe('Join A on ToothOps?');
  });
});

describe('chooseInviteLanguage', () => {
  test('invite uses recipient language when known, else inviter’s', () => {
    expect(chooseInviteLanguage({ language: 'de' }, 'fr')).toBe('de');
    expect(chooseInviteLanguage({ language: null }, 'fr')).toBe('fr');
    expect(chooseInviteLanguage({ language: 'ja' }, 'fr')).toBe('fr');
    expect(chooseInviteLanguage(null, 'it')).toBe('it');
    expect(chooseInviteLanguage(undefined, 'es-MX')).toBe('es');
    expect(chooseInviteLanguage({ fontScale: 1 }, undefined)).toBe('en');
    expect(chooseInviteLanguage(null, 'xx')).toBe('en');
    expect(chooseInviteLanguage('garbage', 42)).toBe('en');
  });
});
