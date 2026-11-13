import { supabase } from './supabaseClient';
import { clearChartStorage } from '../hooks/useChartState';
import { markExplicitSignOut } from './signOutIntent';
import { clearBillingCache } from '../native/billingCache';

/** The non-interactive part of signing out, shared by the app menu, the
 *  lock screen and the billing screens: mark the sign-out deliberate, end
 *  the session, then sweep local patient data and the app's billing cache. */
export async function signOutAndSweep(): Promise<void> {
  if (!supabase) return;
  // Deliberate sign-out — App must NOT treat the coming SIGNED_OUT
  // event as a session expiry (which keeps the chart mounted).
  markExplicitSignOut();
  await supabase.auth.signOut();
  // Shared clinic machines: the next account must not inherit this
  // patient's chart from localStorage.
  clearChartStorage();
  // The app's offline billing cache belongs to whoever signed out.
  clearBillingCache();
  // Legacy BYOK era left API keys in localStorage; the app no longer
  // collects keys client-side, so sweep any stragglers with the session.
  for (const k of [
    'vibing-dental.anthropic-api-key.v1',
    'vibing-dental.deepgram-api-key.v1',
    'vibing-dental.anthropic-model.v1',
  ]) {
    try { localStorage.removeItem(k); } catch { /* storage unavailable */ }
  }
}
