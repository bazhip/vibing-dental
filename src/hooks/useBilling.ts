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
  /** Set when the practice entered a non-paying status — data is kept
   *  (frozen) for 30 days from here, then deleted by the daily purge. */
  frozenAt: string | null;
  seats: number;
  memberCount: number;
  hasStripe: boolean;
  ownerEmail: string;
  /** The plan picked at signup — preselected in the gate's chooser. */
  intendedPlan: PlanKey;
}

/** Statuses that let the practice into the app. Anything else —
 *  including past_due — freezes the account: data is kept for 30 days
 *  (see frozenAt) and the gate shows the recovery path. */
export const ACCESS_STATUSES = ['active', 'trialing', 'comped'];

/** How long a frozen practice's data is kept before the daily purge
 *  deletes it (mirrors purge_lapsed_practices in the database). */
export const FREEZE_GRACE_DAYS = 30;

/** The date a frozen practice will be deleted, or null when not frozen. */
export function deletionDate(info: BillingInfo): Date | null {
  if (!info.frozenAt) return null;
  const d = new Date(info.frozenAt);
  d.setDate(d.getDate() + FREEZE_GRACE_DAYS);
  return d;
}

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
