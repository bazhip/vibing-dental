/// <reference types="chrome" />
import i18n from '../../i18n';
import { supabase } from '../../utils/supabaseClient';
import { LocalizedError } from '../../utils/apiErrors';

// Closing the provider window (or declining) rejects launchWebAuthFlow with Chrome's
// "The user did not approve access." (or a "User cancelled" / "canceled" variant).
const CANCELLED = /^(the user did not approve access\.?|user cancell?ed\b.*|cancell?ed\.?)$/i;

const incomplete = () => new LocalizedError(i18n.t('account:auth.incomplete'));

/**
 * Google/Apple sign-in from the side panel. The provider page opens in a Chrome auth window and
 * comes back to `https://<extension-id>.chromiumapp.org/auth` (on Supabase's Redirect URLs list)
 * with a PKCE code, exchanged here with the verifier this panel stored when it started. The
 * session then arrives through `onAuthStateChange`. Resolves without signing in when the user
 * closes the window; throws a translated error when sign-in fails.
 */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<void> {
  if (!supabase) return;
  const redirectTo = chrome.identity.getRedirectURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw incomplete();

  // If the panel closes mid-flow, this page (and the promise below) is gone: the auth window
  // may still finish, but nothing exchanges the code, so no session is created and the panel
  // opens signed out next time. The PKCE verifier left in storage is replaced by the next attempt.
  let returned: string | undefined;
  try {
    returned = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  } catch (err) {
    if (err instanceof Error && CANCELLED.test(err.message)) return;
    throw incomplete();
  }
  if (!returned) return;

  let url: URL;
  try {
    url = new URL(returned);
  } catch {
    throw incomplete();
  }
  // Only our own redirect, and only a PKCE code: tokens in the hash are never accepted.
  if (`${url.origin}${url.pathname}` !== redirectTo) throw incomplete();
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const failure = url.searchParams.get('error') ?? hash.get('error');
  // Declining on the provider's consent page is a cancel too.
  if (failure === 'access_denied') return;
  if (failure !== null || url.searchParams.has('error_description') || hash.has('error_description')) throw incomplete();
  const code = url.searchParams.get('code');
  if (!code) throw incomplete();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.warn('Sign-in could not be completed:', exchangeError.message);
    throw incomplete();
  }
}
