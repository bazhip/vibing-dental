import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingInfo } from '../hooks/useBilling';
import { BILLING_GRACE_MS, clearBillingCache, readBillingCache, saveBillingCache } from './billingCache';

// This jsdom build has no Web Storage — give the cache somewhere to live.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

const info: BillingInfo = {
  practice: { id: 'p1', name: 'SoCal Vet' },
  role: 'owner',
  plan: 'basic',
  accountType: 'individual',
  status: 'active',
  periodEnd: null,
  frozenAt: null,
  seats: 1,
  memberCount: 1,
  hasStripe: true,
  ownerEmail: 'me@vet.com',
  intendedPlan: 'individual_basic',
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 1_800_000_000_000;

beforeEach(() => store.clear());

describe('billing cache', () => {
  it('grace is 7 days', () => {
    expect(BILLING_GRACE_MS).toBe(7 * DAY);
  });

  it('round-trips', () => {
    saveBillingCache(info, T0);
    expect(readBillingCache(T0)).toEqual(info);
    expect(Array.from(store.keys()).some((k) => k.includes('toothops.billingCache.v1'))).toBe(true);
  });

  it('is still good at 6 days 23 hours', () => {
    saveBillingCache(info, T0);
    expect(readBillingCache(T0 + 6 * DAY + 23 * HOUR)).toEqual(info);
  });

  it('expires just past 7 days', () => {
    saveBillingCache(info, T0);
    expect(readBillingCache(T0 + 7 * DAY + 1)).toBeNull();
  });

  it('is null when absent or garbage', () => {
    expect(readBillingCache(T0)).toBeNull();
    for (const k of Array.from(store.keys())) store.delete(k);
    saveBillingCache(info, T0);
    const key = Array.from(store.keys())[0];
    store.set(key, '{not json');
    expect(readBillingCache(T0)).toBeNull();
    store.set(key, JSON.stringify({ hello: 'world' }));
    expect(readBillingCache(T0)).toBeNull();
    store.set(key, JSON.stringify({ savedAt: 'yesterday', info }));
    expect(readBillingCache(T0)).toBeNull();
  });

  it('belongs to the user it was saved for', () => {
    saveBillingCache(info, T0, 'user-a');
    expect(readBillingCache(T0, 'user-a')).toEqual(info);
    expect(readBillingCache(T0, 'user-b')).toBeNull();
  });

  it('an entry without a user never matches a user', () => {
    saveBillingCache(info, T0);
    expect(readBillingCache(T0, 'user-a')).toBeNull();
  });

  it('can be cleared', () => {
    saveBillingCache(info, T0, 'user-a');
    clearBillingCache();
    expect(readBillingCache(T0, 'user-a')).toBeNull();
  });
});
