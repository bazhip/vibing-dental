import type { BillingInfo } from '../hooks/useBilling';
import { readJson, writeJson } from '../utils/storage';

/**
 * Last successful billing check, kept on the device so the app can open
 * offline. BillingGate (app only) saves it after every successful check
 * and falls back to it when the check fails — but only for 7 days after
 * the last success; past that, or with no cache, the gate shows its
 * "couldn't check" screen. A fresh online check always wins.
 */

/** How long a cached billing status stays good: 7 days. */
export const BILLING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const KEY = 'toothops.billingCache';
const VERSION = 1;

type Entry = { savedAt: number; info: BillingInfo };

export function saveBillingCache(info: BillingInfo, now: number = Date.now()): void {
  writeJson(KEY, VERSION, { savedAt: now, info } satisfies Entry);
}

/** The cached status, or null when absent, unreadable, or older than
 *  the grace period. */
export function readBillingCache(now: number = Date.now()): BillingInfo | null {
  const entry = readJson<Partial<Entry> | null>(KEY, VERSION, null);
  if (!entry || typeof entry !== 'object') return null;
  const { savedAt, info } = entry;
  if (typeof savedAt !== 'number' || !info || typeof info.status !== 'string') return null;
  if (now - savedAt > BILLING_GRACE_MS) return null;
  return info;
}
