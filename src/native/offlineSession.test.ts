import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError, AuthApiError } from '@supabase/supabase-js';

const flags = vi.hoisted(() => ({ native: true }));
vi.mock('./platform', () => ({ isNativeApp: () => flags.native }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { getSessionTolerant } from './offlineSession';

const KEY = 'sb-test-auth-token';
const stored = { access_token: 'old', refresh_token: 'r1', expires_at: 1, user: { id: 'u1', email: 'me@vet.com' } };
const client = (result: unknown) =>
  ({ auth: { storageKey: KEY, getSession: vi.fn(async () => result) } }) as never;

beforeEach(() => {
  flags.native = true;
  store.clear();
});

describe('getSessionTolerant', () => {
  it('passes a live session straight through', async () => {
    const session = { user: { id: 'u2' } };
    const r = await getSessionTolerant(client({ data: { session }, error: null }));
    expect(r).toEqual({ session, offline: false });
  });

  it('app offline with an expired token: falls back to the stored session', async () => {
    store.set(KEY, JSON.stringify(stored));
    const r = await getSessionTolerant(
      client({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    );
    expect(r.offline).toBe(true);
    expect(r.session?.user.id).toBe('u1');
  });

  it('a real (non-network) refresh failure means signed out', async () => {
    store.set(KEY, JSON.stringify(stored));
    const r = await getSessionTolerant(
      client({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') })
    );
    expect(r).toEqual({ session: null, offline: false });
  });

  it('offline with nothing stored: signed out', async () => {
    const r = await getSessionTolerant(
      client({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    );
    expect(r.session).toBeNull();
  });

  it('ignores a malformed stored session', async () => {
    store.set(KEY, '{"access_token":"x"}');
    const r = await getSessionTolerant(
      client({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    );
    expect(r.session).toBeNull();
  });

  it('the website is unchanged: no fallback', async () => {
    flags.native = false;
    store.set(KEY, JSON.stringify(stored));
    const r = await getSessionTolerant(
      client({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    );
    expect(r.session).toBeNull();
  });
});
