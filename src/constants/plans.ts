/**
 * The subscription catalog — one source of truth for the landing page,
 * signup, the billing gate, and practice settings. The edge functions
 * (billing-api / stripe-webhook) carry a mirror of these keys, prices,
 * and seat counts; keep them in sync when a plan changes.
 *
 * Two axes: account type (individual = 1 user, practice = up to 5) and
 * tier (basic / pro — pro gates AI autofill + more image storage, see
 * PLAN_LIMITS in useProfile). Teams beyond 5 seats are handled by hand —
 * the pricing page points them at CONTACT_EMAIL.
 */

import i18n from '../i18n';
import { formatNumber } from '../i18n/format';
import type billing from '../locales/en/billing.json';

export type PlanKey =
  | 'individual_basic'
  | 'individual_pro'
  | 'practice_basic'
  | 'practice_pro';

export type AccountType = 'individual' | 'practice';
export type PlanTier = 'basic' | 'pro';

/** Feature ids are catalog keys (billing:features.*), without plural suffixes. */
type FeatureId = {
  [K in keyof typeof billing.features]: K extends `${infer B}_${'one' | 'other'}` ? B : K;
}[keyof typeof billing.features];

/** One line of a plan's feature list. Amounts stay data: `count` feeds the
 *  plural, `plan` names another plan ("Everything in Individual"). */
export interface PlanFeature {
  id: FeatureId;
  count?: number;
  plan?: PlanKey;
}

export interface PlanDef {
  key: PlanKey;
  /** Display text, read in the active language each time (see planName). */
  readonly name: string;
  priceMonthly: number;
  accountType: AccountType;
  tier: PlanTier;
  seats: number;
  readonly tagline: string;
  readonly features: string[];
  featureList: PlanFeature[];
}

/** A whole-dollar USD price in the active language ("$20" in English). */
export const formatPlanPrice = (n: number): string =>
  formatNumber(n, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });

const billingT = (lng: string) => i18n.getFixedT(lng, 'billing');

/** A plan's display name in `lng` (the active language by default). */
export const planName = (key: PlanKey, lng: string = i18n.language): string => billingT(lng)(`plans.${key}.name`);

export const planTagline = (key: PlanKey, lng: string = i18n.language): string =>
  billingT(lng)(`plans.${key}.tagline`);

/** A plan's feature list, one line per feature, in `lng`. */
export function planFeatures(key: PlanKey, lng: string = i18n.language): string[] {
  const t = billingT(lng);
  return planByKey(key)!.featureList.map(({ id, count, plan }) => {
    const opts: { count?: number; plan?: string } = {};
    if (count !== undefined) opts.count = count;
    if (plan) opts.plan = planName(plan, lng);
    return t(`features.${id}`, opts);
  });
}

const plan = (def: Omit<PlanDef, 'name' | 'tagline' | 'features'>): PlanDef => ({
  ...def,
  get name() {
    return planName(def.key);
  },
  get tagline() {
    return planTagline(def.key);
  },
  get features() {
    return planFeatures(def.key);
  },
});

export const TRIAL_DAYS = 14;

/** Feature flag: show public pricing (the landing page's Pricing nav +
 *  section and the hero's price note). Flip to true to put pricing back
 *  on the homepage. */
export const PRICING_PUBLIC = false;

/** Feature flag: paid signup. While false, new accounts land on the FREE
 *  plan (single user, AI dictation, 10 images per chart) — signup hides the plan pickers
 *  and the BillingGate lets never-subscribed accounts straight in. All
 *  the Stripe machinery (checkout, webhook, portal, freeze/purge) stays
 *  live for existing subscriptions; flip to true to resume selling. */
export const PAID_SIGNUP = false;

/** Free beta: while paid signup is off, every account gets AI dictation,
 *  5 seats and the owner report, with 10 images per chart on the free
 *  tier. The edge functions (team-api) mirror this with their own
 *  FREE_BETA constant — keep them in step. */
export const FREE_BETA = !PAID_SIGNUP;
export const FREE_BETA_SEATS = 5;

export const CONTACT_EMAIL = 'bazhip@gmail.com';

export const PLANS: PlanDef[] = [
  plan({
    key: 'individual_basic',
    priceMonthly: 20,
    accountType: 'individual',
    tier: 'basic',
    seats: 1,
    featureList: [
      { id: 'fullCharting' },
      { id: 'photos', count: 30 },
      { id: 'visitHistory' },
      { id: 'users', count: 1 },
    ],
  }),
  plan({
    key: 'individual_pro',
    priceMonthly: 40,
    accountType: 'individual',
    tier: 'pro',
    seats: 1,
    featureList: [
      { id: 'everythingIn', plan: 'individual_basic' },
      { id: 'aiAutofill' },
      { id: 'imagesPerChart', count: 100 },
      { id: 'users', count: 1 },
    ],
  }),
  plan({
    key: 'practice_basic',
    priceMonthly: 60,
    accountType: 'practice',
    tier: 'basic',
    seats: 5,
    featureList: [
      { id: 'everythingIn', plan: 'individual_basic' },
      { id: 'teamMembers', count: 5 },
      { id: 'sharedCharts' },
      { id: 'teamRoles' },
    ],
  }),
  plan({
    key: 'practice_pro',
    priceMonthly: 120,
    accountType: 'practice',
    tier: 'pro',
    seats: 5,
    featureList: [
      { id: 'everythingIn', plan: 'practice_basic' },
      { id: 'aiAutofillTeam' },
      { id: 'imagesPerChart', count: 100 },
      { id: 'teamMembers', count: 5 },
    ],
  }),
];

export const planByKey = (key: string): PlanDef | undefined =>
  PLANS.find((p) => p.key === key);

/** The plan key for an account-type + tier pair (signup's two choices). */
export const planKeyFor = (accountType: AccountType, tier: PlanTier): PlanKey =>
  `${accountType}_${tier}` as PlanKey;
