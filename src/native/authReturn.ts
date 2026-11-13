import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '../utils/supabaseClient';
import { isNativeApp, WEB_ORIGIN } from './platform';
import { toastWhenReady } from '../components/ui/dialogs';
import i18n from '../i18n';

/** Where auth flows started in the app come back to (the `toothops` URL
 *  scheme in Info.plist). Must be on Supabase's Redirect URLs allow-list. */
export const AUTH_CALLBACK_URL = 'toothops://auth-callback';

const thisPage = () => window.location.origin + window.location.pathname;

/** Where OAuth, confirmation and reset links land: the app itself when
 *  native, this page on the web. */
export function authRedirectUrl(): string {
  return isNativeApp() ? AUTH_CALLBACK_URL : thisPage();
}

/** Base URL for links in emails sent on someone else's behalf (team
 *  invites): the recipient opens them in a browser, so in the app this is
 *  the website — never the app's internal capacitor:// origin. */
export function emailLinkOrigin(): string {
  return isNativeApp() ? WEB_ORIGIN : thisPage();
}

/**
 * Starts Google/Apple OAuth. Web: Supabase navigates this page away and
 * back. App: Google blocks embedded web views, so the provider page opens
 * in the system browser and comes back through `toothops://auth-callback`
 * (see `handleAuthUrl`). Throws when Supabase refuses to start.
 */
export async function startOAuth(provider: 'google' | 'apple'): Promise<void> {
  if (!supabase) return;
  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUrl() } });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (data?.url) await Browser.open({ url: data.url });
}

/** Auth-return URLs already handled. Kept in sessionStorage, not just
 *  memory: Capacitor keeps reporting the launch URL after a page reload
 *  (it never clears it natively), and re-exchanging a used code fails
 *  with a false "Sign-in didn't complete". Stored as hashes so the codes
 *  themselves aren't persisted. */
const HANDLED_KEY = 'toothops.handledAuthUrls';
const HANDLED_MAX = 20;
const handled = new Set<string>();

function urlHash(url: string): string {
  // FNV-1a: dedupe only, not security.
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function readHandled(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(HANDLED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Marks the URL handled; returns false if it already was. */
function markHandled(url: string): boolean {
  const key = urlHash(url);
  const stored = readHandled();
  if (handled.has(key) || stored.includes(key)) return false;
  handled.add(key);
  try {
    sessionStorage.setItem(HANDLED_KEY, JSON.stringify([...stored, key].slice(-HANDLED_MAX)));
  } catch {
    /* storage unavailable: the in-memory set still covers this page */
  }
  return true;
}

/** Exactly `toothops://auth-callback` (any path/query/hash), never a
 *  look-alike such as `toothops://auth-callback.evil.example`. */
function parseAuthCallback(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'toothops:' && u.host === 'auth-callback' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Finishes an auth flow that came back into the app. Returns false for
 * URLs that aren't ours. Only PKCE codes are accepted: the app's client
 * is PKCE-only, so every flow it starts returns `?code=`, and a code only
 * exchanges with the verifier this device stored when it started the
 * flow. Tokens in the hash are ignored on purpose — any page or app can
 * open this URL, and accepting them would let a stranger's link swap the
 * signed-in account (login CSRF).
 */
export async function handleAuthUrl(url: string): Promise<boolean> {
  const parsed = parseAuthCallback(url);
  if (!parsed) return false;
  // A cold start can report the same URL as both the launch URL and an
  // appUrlOpen event, and again after a reload; a code can only be
  // exchanged once.
  if (!markHandled(url)) return true;
  // The in-app browser may already be gone (magic links open from Mail).
  await Browser.close().catch(() => undefined);
  if (!supabase) return true;
  // The provider or Supabase reports failures as error/error_description,
  // in the query (PKCE) or the hash. Say so — never fail silently.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const failed = ['error', 'error_description'].some((k) => parsed.searchParams.has(k) || hash.has(k));
  if (failed) {
    signInFailed();
    return true;
  }
  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn('Sign-in link could not be completed:', error.message);
      signInFailed();
    }
  }
  return true;
}

function signInFailed(): void {
  // Held until the toast host mounts: a cold-start link is handled before
  // React's first commit.
  toastWhenReady(i18n.t('account:auth.incomplete'), { kind: 'error' });
}

/** Listens for auth returns: `appUrlOpen` while running, and the launch
 *  URL when the link cold-started the app. No-op on the web. */
export function initAuthReturn(): void {
  if (!isNativeApp()) return;
  void App.addListener('appUrlOpen', ({ url }) => {
    void handleAuthUrl(url);
  });
  void App.getLaunchUrl()
    .then((launch) => (launch?.url ? handleAuthUrl(launch.url) : false))
    .catch(() => undefined);
}
