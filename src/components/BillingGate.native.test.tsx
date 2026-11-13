import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { BillingInfo } from '../hooks/useBilling';

const flags = vi.hoisted(() => ({ native: true, paid: false }));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1', app_metadata: {} } } } })),
  signOut: vi.fn(),
}));
const fetchBilling = vi.hoisted(() => vi.fn());
const signOutAndSweep = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('../utils/signOutAndSweep', () => ({ signOutAndSweep }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));
vi.mock('../hooks/useBilling', async (orig) => ({
  ...(await orig<typeof import('../hooks/useBilling')>()),
  fetchBilling,
}));
vi.mock('../constants/plans', async (orig) => {
  const real = await orig<typeof import('../constants/plans')>();
  return {
    ...real,
    get PAID_SIGNUP() { return flags.paid; },
  };
});

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

import { BillingGate } from './BillingGate';
import { readBillingCache, saveBillingCache } from '../native/billingCache';

const DAY = 24 * 60 * 60 * 1000;
const billing = (over: Partial<BillingInfo> = {}): BillingInfo => ({
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
  ...over,
});

const renderGate = () =>
  render(
    <BillingGate>
      <div>charting app</div>
    </BillingGate>
  );

const expectNoBillingUi = () => {
  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(/Subscribe|Checkout|\$/i);
  expect(document.querySelectorAll('a')).toHaveLength(0);
  expect(screen.queryByRole('link')).toBeNull();
};

beforeEach(() => {
  flags.native = true;
  flags.paid = false;
  store.clear();
  vi.clearAllMocks();
});

describe('BillingGate in the app', () => {
  it('offline with a fresh cached active plan: lets them in', async () => {
    saveBillingCache(billing({ status: 'active' }), Date.now() - 6 * DAY, 'u1');
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText('charting app')).toBeInTheDocument();
  });

  it('offline with a stale cache: says it could not check', async () => {
    saveBillingCache(billing({ status: 'active' }), Date.now() - 8 * DAY, 'u1');
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText("Couldn't check your subscription")).toBeInTheDocument();
    expect(screen.queryByText('charting app')).toBeNull();
  });

  it('offline with no cache: says it could not check', async () => {
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText("Couldn't check your subscription")).toBeInTheDocument();
    expect(screen.queryByText('charting app')).toBeNull();
  });

  it('offline with another user\'s fresh cache: says it could not check', async () => {
    saveBillingCache(billing({ status: 'active' }), Date.now() - DAY, 'someone-else');
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText("Couldn't check your subscription")).toBeInTheDocument();
    expect(screen.queryByText('charting app')).toBeNull();
  });

  it('a successful check is cached for the signed-in user', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'trialing' }));
    renderGate();
    expect(await screen.findByText('charting app')).toBeInTheDocument();
    await waitFor(() => expect(readBillingCache(undefined, 'u1')?.status).toBe('trialing'));
    expect(readBillingCache(undefined, 'u2')).toBeNull();
  });

  it('without a signed-in user id, a successful check is not cached', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never);
    fetchBilling.mockResolvedValue(billing({ status: 'active' }));
    renderGate();
    expect(await screen.findByText('charting app')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(readBillingCache()).toBeNull();
  });

  it('a fresh check overrides the cache', async () => {
    saveBillingCache(billing({ status: 'active' }), Date.now() - DAY, 'u1');
    fetchBilling.mockResolvedValue(billing({ status: 'canceled' }));
    renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
    expect(screen.queryByText('charting app')).toBeNull();
  });

  it('owner with a canceled plan: neutral screen, sign out only, no billing UI', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'canceled' }));
    renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
    expect(screen.getByText('Manage it at toothops.app.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sign out']);
    expectNoBillingUi();
  });

  it('past due with Stripe, and members: the same neutral screen', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'past_due', hasStripe: true }));
    const { unmount } = renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
    expectNoBillingUi();
    unmount();
    fetchBilling.mockResolvedValue(billing({ status: 'canceled', role: 'member' }));
    renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
    expectNoBillingUi();
  });

  it('offline with a fresh cached canceled plan: the neutral screen', async () => {
    saveBillingCache(billing({ status: 'canceled' }), Date.now() - DAY, 'u1');
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
  });

  it('paid signup off + never subscribed: straight in (unchanged)', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'none' }));
    renderGate();
    expect(await screen.findByText('charting app')).toBeInTheDocument();
  });

  it('paid signup on + never subscribed: the neutral screen, not the plan chooser', async () => {
    flags.paid = true;
    fetchBilling.mockResolvedValue(billing({ status: 'none' }));
    renderGate();
    expect(await screen.findByText("Your plan isn't active")).toBeInTheDocument();
    expectNoBillingUi();
  });
});

describe('BillingGate sign out', () => {
  it('the inactive-plan screen signs out through signOutAndSweep', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'canceled' }));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signOutAndSweep).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('the could-not-check screen signs out through signOutAndSweep', async () => {
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    await screen.findByText("Couldn't check your subscription");
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutAndSweep).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe('BillingGate on the web (unchanged)', () => {
  beforeEach(() => {
    flags.native = false;
  });

  it('owner with a canceled plan still gets the plan chooser', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'canceled' }));
    renderGate();
    expect(await screen.findByText('Choose your plan')).toBeInTheDocument();
    expect(screen.queryByText("Your plan isn't active")).toBeNull();
  });

  it('does not cache, and does not use a cache when the check fails', async () => {
    saveBillingCache(billing({ status: 'active' }), Date.now() - DAY, 'u1');
    fetchBilling.mockRejectedValue(new Error('Failed to fetch'));
    renderGate();
    expect(await screen.findByText("Couldn't check your subscription")).toBeInTheDocument();
    expect(screen.queryByText('charting app')).toBeNull();
  });

  it('a successful check is not cached on the web', async () => {
    fetchBilling.mockResolvedValue(billing({ status: 'active' }));
    renderGate();
    expect(await screen.findByText('charting app')).toBeInTheDocument();
    expect(readBillingCache()).toBeNull();
  });
});
