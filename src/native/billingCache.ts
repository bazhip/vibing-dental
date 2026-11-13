import type { BillingInfo } from '../hooks/useBilling';
import { readJson, writeJson, removeKey } from '../utils/storage';

/**
 * Last successful billing check, kept on the device so the app can open
 * offline. BillingGate (app only) saves it after every successful check
 * and falls back to it when the check fails — but only for 7 days after
 * the last success; past that, or with no cache, the gate shows its
 * "couldn't check" screen. A fresh online check always wins.
 *
 * The entry belongs to one user: it's saved with the signed-in user's id
 * and never read back for anyone else, and App clears it on sign-out and
 * when a different account signs in (shared devices).
 */

/** How long a cached billing status stays good: 7 days. */
export const BILLING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const KEY = 'toothops.billingCache';
const VERSION = 1;

type Entry = { savedAt: number; info: BillingInfo; userId?: string };

export function saveBillingCache(info: BillingInfo, now: number = Date.now(), userId?: string): void {
  writeJson(KEY, VERSION, { savedAt: now, info, userId } satisfies Entry);
}

/** The cached status, or null when absent, unreadable, older than the
 *  grace period, or (when `userId` is given) saved for someone else. */
export function readBillingCache(now: number = Date.now(), userId?: string): BillingInfo | null {
  const entry = readJson<Partial<Entry> | null>(KEY, VERSION, null);
  if (!entry || typeof entry !== 'object') return null;
  const { savedAt, info } = entry;
  if (typeof savedAt !== 'number' || !info || typeof info.status !== 'string') return null;
  if (userId !== undefined && entry.userId !== userId) return null;
  if (now - savedAt > BILLING_GRACE_MS) return null;
  return info;
}

export function clearBillingCache(): void {
  removeKey(KEY, VERSION);
}
