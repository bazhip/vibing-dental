import { isNativeApp } from '../native/platform';

/**
 * Whether to offer Sign in with Apple. Always in the iOS app (App Store
 * 4.8: an app with Google sign-in must offer Apple). On the website (and in
 * the Chrome extension's side panel) only once Supabase's Apple provider is
 * configured and the build sets VITE_APPLE_SIGNIN_WEB=true
 * (docs/ios/sign-in-with-apple.md); unset, the website looks exactly as it
 * did before. The hint follows the button. A leaf module so the side panel
 * can use it without the Capacitor Apple plugin.
 */
export function showAppleSignIn(): boolean {
  return isNativeApp() || import.meta.env?.VITE_APPLE_SIGNIN_WEB === 'true';
}
