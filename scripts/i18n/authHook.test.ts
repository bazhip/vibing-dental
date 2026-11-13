// @vitest-environment node
// Supabase Send Email Hook (supabase/functions/send-auth-email): localized
// auth emails built by the pure module _shared/authEmails.ts.
import { readFileSync } from 'node:fs';
import { Webhook } from 'standardwebhooks';
import { loadCatalogs } from './catalog';
import { emailStringsProblem } from './gen-email-strings';
import {
  authEmailLanguage,
  buildAuthEmails,
  isKnownAuthEmailType,
  sendAuthEmails,
  verifyLink,
  type AuthHookPayload,
} from '../../supabase/functions/_shared/authEmails.ts';
import { sendEmail } from '../../supabase/functions/_shared/email.ts';
import { verifyHook } from '../../supabase/functions/_shared/hookSignature.ts';

const catalogs = loadCatalogs();
const SUPABASE_URL = 'https://abc.supabase.co';
const SITE = 'https://toothops.app';
const REDIRECT = 'https://toothops.app/#/welcome?x=1&y=2';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text of an HTML fragment, whitespace-normalized. */
const visible = (html: string) => normalize(decode(html.replace(/<\/?strong>/g, '').replace(/<[^>]+>/g, ' ')));

function payload(type: string, over: { user?: Record<string, unknown>; email_data?: Record<string, unknown> } = {}): AuthHookPayload {
  return {
    user: { id: 'u1', email: 'vet@example.com', user_metadata: { language: 'en' }, ...over.user },
    email_data: {
      token: '123456',
      token_hash: 'hash-main',
      redirect_to: REDIRECT,
      email_action_type: type,
      site_url: SITE,
      token_new: '',
      token_hash_new: '',
      ...over.email_data,
    },
  } as AuthHookPayload;
}

/** The sentences of today's English dashboard template, with Go placeholders filled. */
function templateSentences(file: string, vars: Record<string, string>): string[] {
  const src = readFileSync(`scripts/i18n/fixtures/auth-templates/${file}.html`, 'utf8');
  const fill = (s: string) => s.replace(/\{\{ \.(\w+) \}\}/g, (_, n: string) => vars[n] ?? '');
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(src)![1];
  const body = /<p style="margin:0;font-size:16px[^>]*>([\s\S]*?)<\/p>/.exec(src)![1];
  const button = /<a href="\{\{ \.ConfirmationURL \}\}" style="display:inline-block[^>]*>([\s\S]*?)<\/a>/.exec(src)![1];
  const ignore = /<p style="margin:16px 0 0;">([\s\S]*?)<\/p>/.exec(src)![1];
  const fallback = /color:#64748b;">\s*([^<]*)<br>/.exec(src)![1];
  return [title, body, button, ignore, fallback].map((s) => visible(fill(s)));
}

const PARITY = [
  { type: 'signup', file: 'confirm-signup', ns: 'confirmSignup' },
  { type: 'recovery', file: 'reset-password', ns: 'resetPassword' },
  { type: 'email_change', file: 'change-email', ns: 'changeEmail' },
] as const;

const ALL_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
  'reauthentication',
  'password_changed_notification',
  'email_changed_notification',
  'phone_changed_notification',
  'identity_linked_notification',
  'identity_unlinked_notification',
  'mfa_factor_enrolled_notification',
  'mfa_factor_unenrolled_notification',
];

describe('verifyLink', () => {
  test('builds the Supabase verify URL with encoded params', () => {
    const url = new URL(verifyLink(SITE, SUPABASE_URL, 'h a/sh', 'recovery', REDIRECT));
    expect(url.origin + url.pathname).toBe(`${SUPABASE_URL}/auth/v1/verify`);
    expect(url.searchParams.get('token')).toBe('h a/sh');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.get('redirect_to')).toBe(REDIRECT);
  });

  test('falls back to the site URL when redirect_to is empty', () => {
    expect(new URL(verifyLink(SITE, `${SUPABASE_URL}/`, 'h', 'signup', '')).searchParams.get('redirect_to')).toBe(SITE);
  });
});

describe('authEmailLanguage', () => {
  test('uses user_metadata.language, else English', () => {
    expect(authEmailLanguage({ language: 'fr' })).toBe('fr');
    expect(authEmailLanguage({ language: 'de-CH' })).toBe('de');
    expect(authEmailLanguage({ language: 'xx' })).toBe('en');
    expect(authEmailLanguage({})).toBe('en');
    expect(authEmailLanguage(null)).toBe('en');
    expect(authEmailLanguage({ language: 42 })).toBe('en');
  });
});

describe('English parity with today’s dashboard templates', () => {
  test.each(PARITY)('$type', ({ type, file, ns }) => {
    const p = payload(type, { user: { new_email: 'new@example.com' } });
    const [mail] = buildAuthEmails(p, SUPABASE_URL);
    expect(mail.subject).toBe(catalogs.en.authEmail[`${ns}.subject`]);
    const subjectsMd = readFileSync('supabase/templates/subjects.md', 'utf8');
    expect(subjectsMd).toContain(`| en | ${mail.subject} |`);

    const html = visible(mail.html);
    const text = normalize(mail.text);
    for (const s of templateSentences(file, { Email: 'vet@example.com', NewEmail: 'new@example.com' })) {
      expect(html).toContain(s);
      if (!s.startsWith('If the button')) expect(text).toContain(s);
    }
    const link = verifyLink(SITE, SUPABASE_URL, 'hash-main', type, REDIRECT);
    expect(mail.html).toContain(`href="${link.replace(/&/g, '&amp;')}"`);
    expect(mail.text).toContain(link);
    expect(mail.text).not.toContain('123456');
    expect(mail.html).not.toContain('123456');
    expect(mail.html).toContain('<html lang="en">');
  });
});

describe('French', () => {
  test.each(PARITY)('$type uses the French catalog', ({ type, ns }) => {
    const p = payload(type, { user: { user_metadata: { language: 'fr' }, new_email: 'new@example.com' } });
    for (const mail of buildAuthEmails(p, SUPABASE_URL)) {
      expect(mail.subject).toBe(catalogs.fr.authEmail[`${ns}.subject`]);
      expect(mail.html).toContain('<html lang="fr">');
      expect(visible(mail.html)).toContain(visible(catalogs.fr.authEmail[`${ns}.button`]));
    }
  });
});

describe('language fallback', () => {
  test.each([{ language: 'xx' }, {}, undefined])('metadata %j gives English', (meta) => {
    const [mail] = buildAuthEmails(payload('recovery', { user: { user_metadata: meta } }), SUPABASE_URL);
    expect(mail.subject).toBe('Reset your ToothOps password');
    expect(mail.html).toContain('<html lang="en">');
  });
});

describe('email change', () => {
  test('secure change (two pairs): current address gets token_hash_new, new address gets token_hash', () => {
    const p = payload('email_change', {
      user: { new_email: 'new@example.com' },
      email_data: { token: '111111', token_hash: 'hash-for-new', token_new: '222222', token_hash_new: 'hash-for-current' },
    });
    const mails = buildAuthEmails(p, SUPABASE_URL);
    expect(mails.map((m) => m.to).sort()).toEqual(['new@example.com', 'vet@example.com']);
    const current = mails.find((m) => m.to === 'vet@example.com')!;
    const next = mails.find((m) => m.to === 'new@example.com')!;
    expect(current.text).toContain(verifyLink(SITE, SUPABASE_URL, 'hash-for-current', 'email_change', REDIRECT));
    expect(next.text).toContain(verifyLink(SITE, SUPABASE_URL, 'hash-for-new', 'email_change', REDIRECT));
    expect(current.text).not.toContain('hash-for-new');
    expect(next.text).not.toContain('hash-for-current');
  });

  test('single pair: one email, to the new address', () => {
    const mails = buildAuthEmails(payload('email_change', { user: { new_email: 'new@example.com' } }), SUPABASE_URL);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('new@example.com');
    expect(mails[0].text).toContain(verifyLink(SITE, SUPABASE_URL, 'hash-main', 'email_change', REDIRECT));
  });

  test('missing new_email fails closed: the new-address link never goes to the current address', () => {
    expect(buildAuthEmails(payload('email_change'), SUPABASE_URL)).toEqual([]);
    expect(
      buildAuthEmails(payload('email_change', { email_data: { token_hash: 'hash-for-new', token_hash_new: '' } }), SUPABASE_URL),
    ).toEqual([]);
  });

  test('missing new_email with two pairs: only the current address gets its own link', () => {
    const two = buildAuthEmails(
      payload('email_change', { email_data: { token_new: '2', token_hash_new: 'hash-for-current' } }),
      SUPABASE_URL,
    );
    expect(two).toHaveLength(1);
    expect(two[0].to).toBe('vet@example.com');
    expect(two[0].text).toContain('hash-for-current');
  });
});

describe('other action types', () => {
  test('reauthentication shows the code and no link', () => {
    for (const lng of ['en', 'de']) {
      const [mail] = buildAuthEmails(payload('reauthentication', { user: { user_metadata: { language: lng } } }), SUPABASE_URL);
      expect(mail.subject).toBe(catalogs[lng].authEmail['reauthentication.subject']);
      expect(visible(mail.html)).toContain('123456');
      expect(mail.text).toContain('123456');
      expect(mail.html).not.toContain('/auth/v1/verify');
      expect(mail.html).not.toContain('hash-main');
    }
  });

  test.each(['invite', 'magiclink'])('%s has its own copy and a verify link', (type) => {
    const [mail] = buildAuthEmails(payload(type, { user: { user_metadata: { language: 'es' } } }), SUPABASE_URL);
    expect(mail.subject).toBe(catalogs.es.authEmail[`${type}.subject`]);
    expect(mail.text).toContain(verifyLink(SITE, SUPABASE_URL, 'hash-main', type, REDIRECT));
  });

  test('email is treated like magiclink', () => {
    const [mail] = buildAuthEmails(payload('email'), SUPABASE_URL);
    expect(mail.subject).toBe(catalogs.en.authEmail['magiclink.subject']);
    expect(mail.text).toContain(verifyLink(SITE, SUPABASE_URL, 'hash-main', 'email', REDIRECT));
  });

  test('notifications are a localized notice with no link or token', () => {
    const [mail] = buildAuthEmails(payload('password_changed_notification', { user: { user_metadata: { language: 'it' } } }), SUPABASE_URL);
    expect(mail.subject).toBe(catalogs.it.authEmail['notice.passwordChanged.subject']);
    expect(visible(mail.html)).toContain(catalogs.it.authEmail['notice.passwordChanged.body']);
    expect(mail.html).toContain('<html lang="it">');
    expect(mail.html).not.toContain('/auth/v1/verify');
    expect(mail.text).not.toContain('123456');
  });

  test('an unknown notification gets the generic notice', () => {
    const [mail] = buildAuthEmails(payload('something_new_notification'), SUPABASE_URL);
    expect(mail.subject).toBe('Your ToothOps account was updated');
  });

  test('user-controlled values are HTML-escaped', () => {
    const [mail] = buildAuthEmails(payload('recovery', { user: { email: 'a<b>"c@example.com' } }), SUPABASE_URL);
    expect(mail.html).toContain('<strong>a&lt;b&gt;&quot;c@example.com</strong>');
    expect(mail.html).not.toContain('<b>');
  });

  test.each(ALL_TYPES)('%s produces at least one email without throwing', (type) => {
    for (const lng of ['en', 'fr', 'de', 'it', 'es']) {
      const mails = buildAuthEmails(payload(type, { user: { user_metadata: { language: lng }, new_email: 'n@example.com' } }), SUPABASE_URL);
      expect(mails.length).toBeGreaterThan(0);
      for (const m of mails) {
        expect(m.to).toMatch(/@/);
        expect(m.subject.length).toBeGreaterThan(0);
        expect(m.html).toContain(`<html lang="${lng}">`);
        expect(m.html).not.toMatch(/\{\{|\}\}/);
        expect(m.text).not.toMatch(/\{\{|\}\}/);
      }
    }
  });

  test('a malformed payload does not throw', () => {
    expect(() => buildAuthEmails({} as AuthHookPayload, SUPABASE_URL)).not.toThrow();
    expect(() => buildAuthEmails({ user: null, email_data: null } as unknown as AuthHookPayload, SUPABASE_URL)).not.toThrow();
  });
});

describe('known action types', () => {
  test.each(ALL_TYPES)('%s is known', (type) => expect(isKnownAuthEmailType(type)).toBe(true));
  test.each(['something_new_notification', 'constructor', ''])('%j is unknown', (type) => expect(isKnownAuthEmailType(type)).toBe(false));
});

describe('sending (Resend, fetch mocked)', () => {
  type Call = { url: string; init: RequestInit };
  let calls: Call[];
  let ok: (i: number) => boolean;
  beforeEach(() => {
    calls = [];
    ok = () => true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: ok(calls.length - 1) } as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];
  const mail = (to: string) => ({ to, subject: 's', html: '<p>h</p>', text: 't' });

  test('sendEmail sets Idempotency-Key only when given, and a timeout signal', async () => {
    expect(await sendEmail('k', mail('a@example.com'))).toBe(true);
    expect(await sendEmail('k', mail('a@example.com'), { idempotencyKey: 'msg_1:0' })).toBe(true);
    expect(header(calls[0], 'Idempotency-Key')).toBeUndefined();
    expect(header(calls[1], 'Idempotency-Key')).toBe('msg_1:0');
    expect(calls[1].init.signal).toBeInstanceOf(AbortSignal);
  });

  test('sendAuthEmails keys each email by webhook id and index, all sent', async () => {
    expect(await sendAuthEmails('k', [mail('cur@example.com'), mail('new@example.com')], 'msg_9')).toBe(true);
    expect(calls).toHaveLength(2);
    const byTo = Object.fromEntries(calls.map((c) => [JSON.parse(String(c.init.body)).to[0], header(c, 'Idempotency-Key')]));
    expect(byTo).toEqual({ 'cur@example.com': 'msg_9:0', 'new@example.com': 'msg_9:1' });
  });

  test('sendAuthEmails reports failure if any send fails, and omits the key without a webhook id', async () => {
    ok = (i) => i === 0;
    expect(await sendAuthEmails('k', [mail('a@example.com'), mail('b@example.com')], '')).toBe(false);
    expect(calls.every((c) => header(c, 'Idempotency-Key') === undefined)).toBe(true);
  });
});

describe('verifyHook (Standard Webhooks signature)', () => {
  const raw = 'whsec_' + Buffer.from('a-test-secret-of-sufficient-length!!').toString('base64');
  const secret = `v1,${raw}`;
  const body = JSON.stringify(payload('recovery'));
  const sign = (b: string) => {
    const id = 'msg_1';
    const ts = new Date();
    const signature = new Webhook(raw).sign(id, ts, b);
    return { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': signature };
  };

  test('a valid signature passes and returns the payload', () => {
    const r = verifyHook(body, sign(body), secret);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.payload as AuthHookPayload).email_data.email_action_type).toBe('recovery');
  });

  test('a tampered body fails', () => {
    const headers = sign(body);
    expect(verifyHook(body.replace('recovery', 'signup'), headers, secret).ok).toBe(false);
  });

  test('missing headers or the wrong secret fail', () => {
    expect(verifyHook(body, {}, secret).ok).toBe(false);
    const other = 'v1,whsec_' + Buffer.from('another-secret-of-sufficient-len!!').toString('base64');
    expect(verifyHook(body, sign(body), other).ok).toBe(false);
    expect(verifyHook(body, sign(body), '').ok).toBe(false);
  });
});

describe('generated authEmail strings', () => {
  test('emailStrings.ts is current and carries authEmail', () => {
    expect(emailStringsProblem(catalogs)).toBeNull();
  });

  test('a changed authEmail.json without regenerating is reported', () => {
    const c = loadCatalogs();
    c.fr.authEmail['magiclink.subject'] = 'Autre chose';
    expect(emailStringsProblem(c)).toMatch(/npm run i18n:emails/);
  });
});
