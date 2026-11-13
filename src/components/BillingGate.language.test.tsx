// The billing gate's blocking screens (paywall, Stripe return, check failed) are
// shown instead of the chart, which owns the account's language — so they apply
// it themselves, else this device's.
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import i18n from '../i18n';
import type { BillingInfo } from '../hooks/useBilling';
import { holdLanguage, restoreLoaders } from '../i18n/testing/holdLanguage';

const account = vi.hoisted(() => ({ prefs: null as unknown }));
const fetchBilling = vi.hoisted(() => vi.fn());

vi.mock('../utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', app_metadata: { role: 'user' } } } } }),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { chart_prefs: account.prefs }, error: null }) }) }),
    }),
  },
}));
vi.mock('../hooks/useBilling', async (orig) => ({
  ...(await orig<typeof import('../hooks/useBilling')>()),
  fetchBilling,
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { BillingGate } from './BillingGate';

const frozen: BillingInfo = {
  practice: { id: 'p1', name: 'Elm Vet' }, role: 'owner', plan: 'basic', accountType: 'individual', status: 'canceled',
  periodEnd: null, frozenAt: '2026-11-01T00:00:00Z', seats: 1, memberCount: 1, hasStripe: true, ownerEmail: 'boss@vet.com',
  intendedPlan: 'individual_basic',
};

beforeEach(() => {
  store.clear();
  account.prefs = null;
  fetchBilling.mockResolvedValue(frozen);
});
afterEach(async () => {
  vi.restoreAllMocks();
  restoreLoaders();
  await i18n.changeLanguage('en');
});

test('the paywall is in French for a French browser', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'en']);
  holdLanguage('fr').release(); // catalogs not yet loaded, as on a first visit
  render(<BillingGate><div /></BillingGate>);
  expect(await screen.findByRole('heading', { name: 'Choisissez votre formule' }, { timeout: 5000 })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('fr');
});

test("the paywall follows the account's language over the browser's", async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
  account.prefs = { language: 'de' };
  render(<BillingGate><div /></BillingGate>);
  expect(await screen.findByRole('heading', { name: 'Wählen Sie Ihren Tarif' }, { timeout: 5000 })).toBeInTheDocument();
  expect(i18n.language).toBe('de');
});
