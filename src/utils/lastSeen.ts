import { supabase } from './supabaseClient';

/** Client-side throttle for touch_last_seen (the database throttles too). */
const MIN_INTERVAL_MS = 15 * 60 * 1000;
let lastTouch = 0;

/**
 * Record that the signed-in user is using the app — feeds the admin
 * panel's "Last active" (sign-in time alone goes stale for people who
 * stay signed in). Fire-and-forget: a missing migration, offline device
 * or signed-out session just means no update.
 */
export function touchLastSeen(now = Date.now()): void {
  if (!supabase || now - lastTouch < MIN_INTERVAL_MS) return;
  lastTouch = now;
  void supabase.rpc('touch_last_seen').then(
    () => undefined,
    () => undefined
  );
}

/** Test hook. */
export function resetLastSeenThrottle(): void {
  lastTouch = 0;
}
