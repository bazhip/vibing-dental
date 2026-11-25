import { describe, expect, it } from 'vitest';
import { buildWhatsNewEmail, isWhatsNewCandidate } from './whatsNewEmail';
import { EMAIL_LANGUAGES } from './emailStrings';
import { verifyUnsubscribeToken } from './unsubscribe';

const base = { id: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b', email: 'a@b.co', email_confirmed_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-11-01T00:00:00Z' };
describe('isWhatsNewCandidate', () => {
  it('includes confirmed accounts that last signed in before the cutoff', () => {
    expect(isWhatsNewCandidate(base)).toBe(true);
  });
  it.each([
    ['signed in since the cutoff', { last_sign_in_at: '2026-11-14T00:00:00Z' }],
    ['never signed in', { last_sign_in_at: null }],
    ['unconfirmed', { email_confirmed_at: null }],
    ['no email', { email: null }],
    ['malformed email', { email: 'nope' }],
    ['banned', { banned_until: '2999-01-01T00:00:00Z' }],
  ])('excludes %s', (_name, patch) => {
    expect(isWhatsNewCandidate({ ...base, ...patch })).toBe(false);
  });
  it('includes an account whose ban has expired', () => {
    expect(isWhatsNewCandidate({ ...base, banned_until: '2026-01-01T00:00:00Z' })).toBe(true);
  });
});

describe('buildWhatsNewEmail', () => {
  it.each(EMAIL_LANGUAGES)('renders %s with a verifiable unsubscribe link and headers', async (lng) => {
    const m = await buildWhatsNewEmail(lng, base.id, 'secret', 'https://x.supabase.co');
    expect(m.subject.length).toBeGreaterThan(0);
    expect(m.html).toContain('https://toothops.app/unsubscribe?t=');
    expect(m.text).toContain('https://toothops.app/unsubscribe?t=');
    expect(m.headers['List-Unsubscribe']).toMatch(/^<https:\/\/x\.supabase\.co\/functions\/v1\/unsubscribe\?t=/);
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const token = decodeURIComponent(m.headers['List-Unsubscribe'].split('?t=')[1].replace('>', ''));
    expect(await verifyUnsubscribeToken(token, 'secret')).toBe(base.id);
    expect(m.html).not.toMatch(/\{\{|undefined/);
    expect(m.html.match(/<strong>/g)).toHaveLength(7);
  });
  it('falls back to English for an unknown language', async () => {
    expect((await buildWhatsNewEmail('xx', base.id, 's', 'https://x')).subject).toBe('What’s new in ToothOps');
  });
});
