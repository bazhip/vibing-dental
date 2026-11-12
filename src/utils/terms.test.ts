import { beforeEach, describe, expect, it, vi } from 'vitest';

const eq = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const update = vi.hoisted(() => vi.fn(() => ({ eq })));
vi.mock('./supabaseClient', () => ({ supabase: { from: () => ({ update }) }, cloudEnabled: true }));

import { TERMS_VERSION, flushPendingTerms, markTermsPending } from './terms';

// This test environment has no working localStorage (as in GoogleSignIn.test).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
});

describe('terms acceptance recording', () => {
  beforeEach(() => { localStorage.clear(); update.mockClear(); eq.mockClear(); });

  it('records a sign-in made beside the notice, once', () => {
    markTermsPending(1_000);
    flushPendingTerms('user-1', 2_000);
    expect(update).toHaveBeenCalledWith({ terms_version: TERMS_VERSION, terms_accepted_at: new Date(1_000).toISOString() });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
    flushPendingTerms('user-1', 3_000);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('records nothing without a recent notice click', () => {
    flushPendingTerms('user-1');
    markTermsPending(0);
    flushPendingTerms('user-1', 2 * 60 * 60 * 1000); // marker older than an hour
    expect(update).not.toHaveBeenCalled();
  });
});
