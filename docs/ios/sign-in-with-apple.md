# Sign in with Apple and app auth returns — setup

ToothOps offers Sign in with Apple in the iOS app (App Store Guideline 4.8:
an app that offers Google sign-in must offer Apple too), and on the website
once it is turned on with `VITE_APPLE_SIGNIN_WEB` (step 4). The code is in `src/components/AppleSignInButton.tsx` and
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

## 4. Turn the button on for the website: `VITE_APPLE_SIGNIN_WEB`

The iOS app always shows "Continue with Apple" (Guideline 4.8). The **website**
shows it only when the build sets:

```
VITE_APPLE_SIGNIN_WEB=true
```

Unset (or any other value), the website looks exactly as it did before Apple
sign-in was added: no Apple button and no hint under it. Set the flag only
after steps 1 to 3 are done, because a website Apple button with no Supabase
Apple provider just shows an error. In Vercel, add it under Project → Settings →
Environment Variables (Production and Preview), then redeploy. Vite inlines it at
build time. The check is `showAppleSignIn()` in
`src/components/AppleSignInButton.tsx`, used by the login screen and the
session-expired overlay. The hint always appears and disappears with the button.

## 5. Xcode

The **Sign in with Apple** capability is already in the project
(`CODE_SIGN_ENTITLEMENTS = App/App.entitlements` for Debug and Release). In
Xcode → App target → Signing & Capabilities, choose the development team. Once
the App ID has the capability, automatic signing creates a matching profile.
The `toothops` URL scheme is registered in `ios/App/App/Info.plist`
(`CFBundleURLTypes`).

## 6. Check it works

- Website with `VITE_APPLE_SIGNIN_WEB=true`: "Continue with Apple" → Apple → back
  on toothops.app signed in. Without the flag: no Apple button on the website.
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

## 7. Known gap: Apple token revocation on account deletion (not implemented)

Apple requires apps that offer Sign in with Apple to **revoke the user's Apple
tokens when they delete their account** (Guideline 5.1.1(v) and Apple's
"Sign in with Apple REST API" account-deletion requirement). ToothOps deletes
the account (`delete_account` in `supabase/functions/team-api/index.ts`), but
it does **not** revoke the Apple token yet. App Review may reject a build for
this. It needs server work, which hasn't been done.

What it would take:

1. **Keep a token to revoke.** At sign-in the native sheet returns
   `response.authorizationCode` (in `src/components/AppleSignInButton.tsx`,
   next to `response.identityToken`). The app currently discards it. The code
   is single-use and expires after 5 minutes, so right after
   `signInWithIdToken` succeeds the app must send it to a server function
   (for example a new `apple_link` action in team-api). The server exchanges it
   at `POST https://appleid.apple.com/auth/token` (`grant_type=authorization_code`,
   `code`, `client_id`, `client_secret`) and stores the returned
   `refresh_token`, keyed by the user id, in a service-role-only table. Never
   store it on the device or in a table users can read.
2. **Client secret JWT.** Both Apple endpoints take a `client_secret`: an ES256
   JWT signed with the Sign in with Apple `.p8` key from step 1.3. Header
   `kid` = Key ID. Claims: `iss` = Team ID, `sub` = the client ID (the bundle ID
   `app.toothops.ios` for tokens from the app, the Services ID for tokens from
   the website), `aud` = `https://appleid.apple.com`, `iat` = now, `exp` = at
   most 6 months later. Generate it in the edge function from secrets
   (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`), not by hand.
3. **Revoke on deletion.** In team-api's `delete_account`, after the checks and
   just before `purgeAccount(admin, caller.id, ...)`, look up the stored Apple
   refresh token for `caller.id` and call
   `POST https://appleid.apple.com/auth/revoke` (form-encoded: `client_id`,
   `client_secret`, `token`, `token_type_hint=refresh_token`). Apple answers
   200 on success. Log a failure, but don't block the deletion. Then delete the
   stored token row with the rest of the account.
4. **Website Apple sign-ins** go through Supabase's OAuth redirect, which
   doesn't hand the app an authorization code. Accounts that only ever signed
   in with Apple on the website have no token to revoke until the website flow
   also captures one. Apple's requirement is about the app, so the native path
   (steps 1 to 3) is the minimum.

Until this ships, write it in the App Review notes if asked, and track it in
the release checklist (`docs/ios/release-checklist.md`).
