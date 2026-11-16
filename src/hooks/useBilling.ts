import i18n from '../i18n';
import { invokeFunction } from '../utils/edgeFunctions';
import { LocalizedError } from '../utils/apiErrors';
import { PlanKey } from '../constants/plans';

/**
 * Client side of the billing-api edge function. The practice row is the
 * billing anchor; only its owner can start, change, or manage the
 * subscription. Statuses come from Stripe ('active', 'trialing',
 * 'past_due', 'canceled', …) plus two of ours: 'none' (never subscribed)
 * and 'comped' (admin-granted access, no Stripe).
 */

export interface BillingInfo {
  practice: { id: string; name: string } | null;
  role: 'owner' | 'member';
  plan: 'basic' | 'pro';
  accountType: 'individual' | 'practice';
  status: string;
  periodEnd: string | null;
  /** When the practice's subscription lapsed (it's on the free plan since).
   *  Informational only: lapsing never locks anyone out or deletes data. */
  frozenAt: string | null;
  seats: number;
  memberCount: number;
  hasStripe: boolean;
  ownerEmail: string;
  /** The plan picked at signup — preselected in the gate's chooser. */
  intendedPlan: PlanKey;
}

/** Statuses of a live paid (or comped) plan. Anything else is the free
 *  plan: a lapsed subscription never locks anyone out or deletes data. */
export const ACCESS_STATUSES = ['active', 'trialing', 'comped'];

async function call<T = Record<string, unknown>>(body: object): Promise<T> {
  return invokeFunction<T>('billing-api', body);
}

const returnUrl = () => window.location.origin + window.location.pathname;

export async function fetchBilling(): Promise<BillingInfo> {
  return call<BillingInfo>({ action: 'get_billing' });
}

/** Start Stripe Checkout for a plan — navigates away on success. */
export async function startCheckout(plan: PlanKey): Promise<void> {
  const { url } = await call<{ url: string }>({ action: 'checkout', plan, returnUrl: returnUrl() });
  if (!url) throw new LocalizedError(i18n.t('errors.checkoutLink', { ns: 'billing' }));
  window.location.assign(url);
}

/** Open the Stripe billing portal (card, invoices, cancel). */
export async function openBillingPortal(): Promise<void> {
  const { url } = await call<{ url: string }>({ action: 'portal', returnUrl: returnUrl() });
  if (!url) throw new LocalizedError(i18n.t('errors.portalLink', { ns: 'billing' }));
  window.location.assign(url);
}

/** Switch the live subscription to another plan (prorated). */
export async function changePlan(plan: PlanKey): Promise<void> {
  await call({ action: 'change_plan', plan });
}
