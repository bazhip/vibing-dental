import React from 'react';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { supabase } from '../utils/supabaseClient';
import { isNativeApp } from '../native/platform';
import { AUTH_CALLBACK_URL, startOAuth } from '../native/authReturn';
import { friendlyError } from './ui/dialogs';

/** The app's bundle ID — Apple puts it in the ID token's audience, so it
 *  must be one of the Client IDs on Supabase's Apple provider. */
const APPLE_CLIENT_ID = 'app.toothops.ios';

/** Shown under the Apple button wherever it appears: Apple may hide the
 *  real email, so existing and invited users should use email sign-in. */
export const APPLE_HINT = 'Already have an account or were invited? Sign in with your email.';

/**
 * Whether to offer Sign in with Apple. Always in the iOS app (App Store
 * 4.8: an app with Google sign-in must offer Apple). On the website only
 * once Supabase's Apple provider is configured and the build sets
 * VITE_APPLE_SIGNIN_WEB=true (docs/ios/sign-in-with-apple.md); unset, the
 * website looks exactly as it did before. The hint follows the button.
 */
export function showAppleSignIn(): boolean {
  return isNativeApp() || import.meta.env?.VITE_APPLE_SIGNIN_WEB === 'true';
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

/** Apple reports a dismissed sheet as ASAuthorizationError.canceled (1001).
 *  The plugin rejects with only `error.localizedDescription`, e.g. "The
 *  operation couldn’t be completed. (com.apple.AuthenticationServices.
 *  AuthorizationError error 1001.)" — the word "error" is localized, the
 *  domain and code aren't. Match that code only. */
const isCancel = (e: unknown) =>
  /AuthorizationError\D*\b1001\b/.test(e instanceof Error ? e.message : String(e));

/**
 * "Continue with Apple". Web: Supabase OAuth redirect, like Google. App:
 * the native Apple sheet, then Supabase signs in with Apple's ID token.
 * Apple embeds the SHA-256 of our nonce in the token; Supabase is given
 * the raw nonce to check it against. Apple shares the name only on the
 * first sign-in, so it's saved for the finish-setup prompt.
 */
export const AppleSignInButton: React.FC<{
  label?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
  /** Runs just before sign-in starts (e.g. to note the terms notice). */
  onStart?: () => void;
}> = ({ label = 'Continue with Apple', disabled, onError, onStart }) => {
  const [busy, setBusy] = React.useState(false);
  if (!supabase) return null;
  const client = supabase;

  const nativeSignIn = async () => {
    const rawNonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const { response } = await SignInWithApple.authorize({
      clientId: APPLE_CLIENT_ID,
      redirectURI: AUTH_CALLBACK_URL,
      scopes: 'email name',
      nonce: await sha256Hex(rawNonce),
    });
    const { error } = await client.auth.signInWithIdToken({
      provider: 'apple',
      token: response.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    const fullName = [response.givenName, response.familyName].filter(Boolean).join(' ');
    if (fullName) await client.auth.updateUser({ data: { full_name: fullName } }).catch(() => undefined);
  };

  const start = async () => {
    setBusy(true);
    onStart?.();
    try {
      if (isNativeApp()) {
        await nativeSignIn();
        setBusy(false);
      } else {
        await startOAuth('apple'); // on success the page is navigating away
      }
    } catch (e) {
      setBusy(false);
      if (!isCancel(e)) onError?.(friendlyError(e, 'Couldn’t sign in with Apple.'));
    }
  };

  return (
    <button type="button" className="login-apple" onClick={() => void start()} disabled={disabled || busy}>
      <svg className="login-apple__logo" viewBox="0 0 17 20" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M14.2 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.7 4.8 2 5.8 1.1 7.4c-1.9 3.3-.5 8.1 1.3 10.8.9 1.3 2 2.7 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9c1.5 0 2.4-1.3 3.3-2.6 1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-2.9-4.3zM11.6 3c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"
        />
      </svg>
      {busy ? 'Signing in with Apple…' : label}
    </button>
  );
};
