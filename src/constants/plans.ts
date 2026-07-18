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

export type PlanKey =
  | 'individual_basic'
  | 'individual_pro'
  | 'practice_basic'
  | 'practice_pro';

export type AccountType = 'individual' | 'practice';
export type PlanTier = 'basic' | 'pro';

export interface PlanDef {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  accountType: AccountType;
  tier: PlanTier;
  seats: number;
  tagline: string;
  features: string[];
}

export const TRIAL_DAYS = 14;

/** Feature flag: show public pricing (the landing page's Pricing nav +
 *  section and the hero's price note). Billing itself stays live either
 *  way — signup plan choice and checkout are unaffected. Flip to true
 *  to put pricing back on the homepage. */
export const PRICING_PUBLIC = false;

export const CONTACT_EMAIL = 'bazhip@gmail.com';

export const PLANS: PlanDef[] = [
  {
    key: 'individual_basic',
    name: 'Individual',
    priceMonthly: 20,
    accountType: 'individual',
    tier: 'basic',
    seats: 1,
    tagline: 'For a solo practitioner',
    features: [
      'Full charting, diagrams & branded PDFs',
      'Photos & radiographs — 30 images per chart',
      'Visit history & recheck reminders',
      '1 user',
    ],
  },
  {
    key: 'individual_pro',
    name: 'Individual Pro',
    priceMonthly: 40,
    accountType: 'individual',
    tier: 'pro',
    seats: 1,
    tagline: 'Solo, with AI on the mic',
    features: [
      'Everything in Individual',
      'AI voice autofill — dictate, the chart fills itself',
      '100 images per chart',
      '1 user',
    ],
  },
  {
    key: 'practice_basic',
    name: 'Practice',
    priceMonthly: 60,
    accountType: 'practice',
    tier: 'basic',
    seats: 5,
    tagline: 'Your whole team, one record',
    features: [
      'Everything in Individual',
      'Up to 5 team members',
      'Shared charts, templates & practice logo',
      'Team roles & ownership transfer',
    ],
  },
  {
    key: 'practice_pro',
    name: 'Practice Pro',
    priceMonthly: 120,
    accountType: 'practice',
    tier: 'pro',
    seats: 5,
    tagline: 'The full clinic, hands-free',
    features: [
      'Everything in Practice',
      'AI voice autofill for the whole team',
      '100 images per chart',
      'Up to 5 team members',
    ],
  },
];

export const planByKey = (key: string): PlanDef | undefined =>
  PLANS.find((p) => p.key === key);

/** The plan key for an account-type + tier pair (signup's two choices). */
export const planKeyFor = (accountType: AccountType, tier: PlanTier): PlanKey =>
  `${accountType}_${tier}` as PlanKey;
