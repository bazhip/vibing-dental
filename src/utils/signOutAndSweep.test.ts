import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: false,
  signOut: vi.fn(async (..._a: unknown[]) => ({ error: null as null | Error })),
  clearChartStorage: vi.fn(),
  clearBillingCache: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { signOut: mocks.signOut, storageKey: 'sb-test-auth-token' } }, cloudEnabled: true }));
vi.mock('../native/platform', () => ({ isNativeApp: () => mocks.native }));

// This jsdom build has no Web Storage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});
vi.mock('../hooks/useChartState', () => ({ clearChartStorage: mocks.clearChartStorage }));
vi.mock('../native/billingCache', () => ({ clearBillingCache: mocks.clearBillingCache }));

import { signOutAndSweep } from './signOutAndSweep';
import { consumeExplicitSignOut } from './signOutIntent';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.native = false;
  store.clear();
  consumeExplicitSignOut();
});

describe('signOutAndSweep', () => {
  it('marks the sign-out deliberate, ends the session and sweeps the chart and billing cache', async () => {
    await signOutAndSweep();
    expect(consumeExplicitSignOut()).toBe(true);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.clearChartStorage).toHaveBeenCalledTimes(1);
    expect(mocks.clearBillingCache).toHaveBeenCalledTimes(1);
  });

  it('a failed sign-out does not leave the deliberate-sign-out flag set', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('Failed to fetch') });
    await signOutAndSweep({ reload: vi.fn() });
    expect(consumeExplicitSignOut()).toBe(false);
  });

  it('app, offline with an expired token: removes the local session and reloads to the login', async () => {
    // auth-js can't sign out at all here (it fails loading the session
    // before it gets to removing it, even for scope: local).
    mocks.native = true;
    mocks.signOut.mockResolvedValue({ error: new Error('Failed to fetch') });
    store.set('sb-test-auth-token', '{"refresh_token":"r","user":{"id":"u1"}}');
    store.set('sb-test-auth-token-code-verifier', 'v');
    store.set('sb-test-auth-token-user', '{}');
    const reload = vi.fn();
    await signOutAndSweep({ reload });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(store.has('sb-test-auth-token')).toBe(false);
    expect(store.has('sb-test-auth-token-code-verifier')).toBe(false);
    expect(store.has('sb-test-auth-token-user')).toBe(false);
    expect(mocks.clearChartStorage).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('app: a local sign-out fallback that works needs no reload', async () => {
    mocks.native = true;
    store.set('sb-test-auth-token', '{"refresh_token":"r","user":{"id":"u1"}}');
    mocks.signOut
      .mockResolvedValueOnce({ error: new Error('Failed to fetch') })
      .mockImplementationOnce(async () => {
        store.delete('sb-test-auth-token');
        return { error: null };
      });
    const reload = vi.fn();
    await signOutAndSweep({ reload });
    expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('website: a failed sign-out is not retried or forced', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('Failed to fetch') });
    store.set('sb-test-auth-token', '{}');
    const reload = vi.fn();
    await signOutAndSweep({ reload });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(store.has('sb-test-auth-token')).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
