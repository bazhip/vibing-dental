import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  clearChartStorage: vi.fn(),
  clearBillingCache: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { signOut: mocks.signOut } }, cloudEnabled: true }));
vi.mock('../hooks/useChartState', () => ({ clearChartStorage: mocks.clearChartStorage }));
vi.mock('../native/billingCache', () => ({ clearBillingCache: mocks.clearBillingCache }));

import { signOutAndSweep } from './signOutAndSweep';
import { consumeExplicitSignOut } from './signOutIntent';

beforeEach(() => {
  vi.clearAllMocks();
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
});
