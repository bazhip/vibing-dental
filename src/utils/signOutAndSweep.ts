import { supabase } from './supabaseClient';
import { clearChartStorage } from '../hooks/useChartState';
import { markExplicitSignOut, consumeExplicitSignOut } from './signOutIntent';
import { isNativeApp } from '../native/platform';
import { hasStoredSession, removeStoredSession } from '../native/offlineSession';
import { clearBillingCache } from '../native/billingCache';

/** The non-interactive part of signing out, shared by the app menu, the
 *  lock screen and the billing screens: mark the sign-out deliberate, end
 *  the session, then sweep local patient data and the app's billing cache. */
export async function signOutAndSweep(
  { reload = () => window.location.reload() }: { reload?: () => void } = {}
): Promise<void> {
  if (!supabase) return;
  const client = supabase;
  // Deliberate sign-out — App must NOT treat the coming SIGNED_OUT
  // event as a session expiry (which keeps the chart mounted).
  markExplicitSignOut();
  let { error } = await client.auth.signOut();
  let mustReload = false;
  if (error && isNativeApp() && hasStoredSession(client)) {
    // App offline (e.g. from the lock screen) with an expired access token:
    // the remote sign-out can't run. Sign out on this device only; if even
    // that can't load the session, remove it directly and reload, since no
    // SIGNED_OUT event will come to take the app to the login screen.
    ({ error } = await client.auth.signOut({ scope: 'local' }));
    if (hasStoredSession(client)) {
      removeStoredSession(client);
      mustReload = true;
    }
  }
  // No SIGNED_OUT came to consume the mark: clear it, or a later real
  // expiry would be mistaken for a deliberate sign-out.
  if (error || mustReload) consumeExplicitSignOut();
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
  if (mustReload) reload();
}
