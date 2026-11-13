# Sign in with Apple and app auth returns — setup

ToothOps offers Sign in with Apple on the website and in the iOS app
(App Store Guideline 4.8: an app that offers Google sign-in must offer
Apple too). The code is in `src/components/AppleSignInButton.tsx` and
`src/native/authReturn.ts`. These are the one-time console steps that make it
work.

How it signs in:

- **Website**: Supabase OAuth redirect (`signInWithOAuth({ provider: 'apple' })`),
  the same as Google. This uses the **Services ID**.
- **iOS app**: the native Apple sheet (`@capacitor-community/apple-sign-in`)
  returns an ID token whose audience is the bundle ID `app.toothops.ios`. The app
  then calls `signInWithIdToken({ provider: 'apple', token, nonce })`. Apple gets
  the SHA-256 of a random nonce and Supabase gets the raw nonce to check it.
- **Google, magic links, confirmation and reset emails started in the app**
  come back through the custom URL scheme `toothops://auth-callback`. The app
  catches it (`App.addListener('appUrlOpen')`, plus `App.getLaunchUrl()` on a
  cold start) and exchanges the PKCE code for a session.
- **Team invites sent from the app** link to `https://toothops.app/`, because the
  person invited opens the email in a browser.

## 1. Apple Developer portal

Do this in Certificates, Identifiers & Profiles, under the team the app ships from.

1. **App ID capability**: Identifiers → App IDs → `app.toothops.ios` → turn on
   **Sign In with Apple** (as a primary App ID) → Save. Automatic signing then
   picks up the entitlement that is already in the Xcode project
   (`ios/App/App/App.entitlements`, `com.apple.developer.applesignin = Default`).
2. **Services ID** (for the website):
   Identifiers → + → Services IDs → e.g. `app.toothops.web` →
   enable **Sign In with Apple** → Configure:
   - Primary App ID: `app.toothops.ios`
   - Domains: `<project-ref>.supabase.co` (and `toothops.app`)
   - Return URLs: `https://<project-ref>.supabase.co/auth/v1/callback`
3. **Key**: Keys → + → enable **Sign In with Apple** → Configure → primary App ID
   `app.toothops.ios` → Register. Download the `.p8` file (you can only download
   it once). Write down the **Key ID** and your **Team ID**.

## 2. Supabase: Apple provider

Dashboard → Authentication → Sign In / Providers → **Apple** → Enable.

- **Client IDs**: `app.toothops.ios,<your Services ID>` (comma-separated, for
  example `app.toothops.ios,app.toothops.web`). The bundle ID accepts the app's
  native ID tokens. The Services ID is used by the website's OAuth redirect.
- **Secret Key (for OAuth)**: the client-secret JWT generated from the `.p8` key,
  Key ID, Team ID and Services ID. Supabase's Apple docs have a generator. The
  secret expires after at most 6 months: **put a reminder in the calendar to
  rotate it**, or website Apple sign-in stops working. Native app sign-in uses ID
  tokens and does not depend on this secret.

## 3. Supabase: redirect URLs

Dashboard → Authentication → URL Configuration → **Redirect URLs**. Add:

- `toothops://auth-callback` (Google, magic links, confirmation and reset links
  started in the app)

Keep the existing website entries (`https://toothops.app/` and any preview URLs).
If a redirect isn't on this list, Supabase falls back to the Site URL and the
app never receives the callback.

## 4. Xcode

The **Sign in with Apple** capability is already in the project
(`CODE_SIGN_ENTITLEMENTS = App/App.entitlements` for Debug and Release). In
Xcode → App target → Signing & Capabilities, choose the development team. Once
the App ID has the capability, automatic signing creates a matching profile.
The `toothops` URL scheme is registered in `ios/App/App/Info.plist`
(`CFBundleURLTypes`).

## 5. Check it works

- Website: "Continue with Apple" → Apple → back on toothops.app signed in.
- App, cold and warm: "Continue with Apple" shows the native sheet and signs in.
  Cancelling the sheet shows no error.
- App: "Continue with Google" opens the system browser and returns to the app
  signed in. This should also work when the app was killed while the browser
  was open.
- App: "Forgot password?" → the email link opens the app → set new password.
- App: invite a team member → the email links to `https://toothops.app/`.
- A new Apple account is asked for practice and doctor name (finish setup).
- If the user hid their email (Hide My Email) they get a separate account. That
  is accepted for v1, and the hint under the Apple button points existing and
  invited users to email sign-in.
