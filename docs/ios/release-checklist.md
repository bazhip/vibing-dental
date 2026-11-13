# iOS release checklist

Work through this before every App Store submission of the ToothOps iOS app
(bundle ID `app.toothops.ios`, US storefront only). One-time Sign in with Apple
and redirect-URL setup is in [sign-in-with-apple.md](sign-in-with-apple.md).

## 1. Prerequisites (once per Mac)

- Xcode (current release) with an iOS Simulator runtime installed.
- CocoaPods: `brew install cocoapods`. Capacitor's iOS project uses Pods, so
  `npx cap sync ios` runs `pod install`.
- Node and `npm install` at the repo root.
- Membership in the Apple Developer team the app ships from.

## 2. Build

```sh
npm run ios:sync    # vite build + npx cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=<device>' build
```

- Always build the **workspace** (`ios/App/App.xcworkspace`), not
  `App.xcodeproj`: the workspace includes the Pods.
- The minimum iOS version is **iOS 15** (app target and Podfile).
- The app uses the UIScene lifecycle (`ios/App/App/SceneDelegate.swift`). iOS 27
  crashes at launch without it. Keep it if the iOS project is ever regenerated
  with `npx cap add ios`: Capacitor 7's template is AppDelegate-only.
- Build-time env vars (Vercel and local `.env`): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. `VITE_APPLE_SIGNIN_WEB=true` only affects the
  **website**: it turns on the website's Apple button once Supabase's Apple
  provider is set up. The app always shows Apple, flag or not. See
  sign-in-with-apple.md, step 4.

## 3. Signing

1. Open `ios/App/App.xcworkspace` in Xcode → App target → **Signing &
   Capabilities** → pick the **Team** and leave "Automatically manage signing"
   on. Do this for Debug and Release.
2. In the Apple Developer portal, the App ID `app.toothops.ios` must have **Sign
   In with Apple** enabled (Identifiers → App IDs). The entitlement is already in
   `ios/App/App/App.entitlements`.
3. Bump `MARKETING_VERSION` (user-facing, e.g. 1.0.1) and
   `CURRENT_PROJECT_VERSION` (build number, must increase for every upload) in
   the App target's build settings.

## 4. Manual device checks

Use a real iPhone and a real iPad (with an Apple Pencil). Simulators can't test
Face ID timing, the Pencil or the microphone properly.

Sign-in and auth return:

- [ ] **Cold-start magic link**: force-quit the app, open a sign-in or reset
      email on the same device, tap the link → the app opens and signs in (or
      shows set-new-password). Email links requested in the app open the app
      **only on the same device**. On another device they fail, because the PKCE
      code verifier lives on the device that asked.
- [ ] Warm magic link (app in the background) → signs in.
- [ ] A failed or cancelled link return shows "Sign-in didn't complete. Please
      try again." and no blank screen.
- [ ] **Sign in with Apple**: native sheet, signs in. Cancelling shows no error.
      A brand-new Apple account is asked for practice and doctor name.
- [ ] **Google**: opens the system browser and comes back to the app signed in.
      Also when the app was killed while the browser was open.
- [ ] "New to ToothOps? Sign up at toothops.app" opens Safari, and there is no
      sign-up form in the app.
- [ ] Inviting a team member from the app sends an email that links to
      `https://toothops.app/`.

Native features:

- [ ] **Camera**: "Take photo" in Imaging → permission prompt (first time) →
      photo attaches to the chart.
- [ ] **Share sheet**: export a chart PDF → share sheet → save to Files. Success
      haptic. Dismissing the sheet shows no error toast.
- [ ] **Face ID after 5 minutes**: background the app for 5+ minutes → Face ID
      lock on return. Under 5 minutes → no lock. "Sign out" on the lock screen
      works.
- [ ] **Dictation**: microphone permission prompt, then live transcription
      through the PCM AudioWorklet in WKWebView (Deepgram). Check that it fills
      the chart.
- [ ] **Airplane-mode launch within 7 days** of the last online billing check →
      the app opens normally.
- [ ] **Airplane-mode launch after 7 days** (or a fresh install with no cache) →
      "Couldn't check your subscription". Never a blank screen.
- [ ] Edits made offline save automatically when the connection comes back.
- [ ] **Pencil drawing** on the iPad diagram: a resting palm adds no strokes, and
      finger drawing still works on an iPad without a Pencil.
- [ ] **Rotation on iPad** in all four orientations. The side-by-side layout
      (chart grid + diagram) starts at **1280px** wide: 13" iPad landscape and
      desktops. 11" iPads in landscape, and all iPads in portrait, keep the
      stacked layout.
- [ ] Safe areas (notch, Dynamic Island, home indicator) and status bar look
      right on iPhone and iPad. No web tap flashes.
- [ ] No prices, plan names, upgrade prompts, checkout, billing portal or Stripe
      links anywhere in the app, including the free-tier imaging note and the
      team seat-limit message. A practice without an active plan sees only "Your
      plan isn't active / Manage it at toothops.app." and Sign out.
- [ ] **Account deletion** is reachable in the app (Guideline 5.1.1(v)).

## 5. App Store Connect

### Availability

- **US storefront only** (Pricing and Availability → only United States).
- Price: Free. No in-app purchases.

### Guideline 3.1.1(a): re-check before every submission

The app links out with "Sign up at toothops.app", and practices pay on the
website. The US storefront allows that link under the anti-steering exemption
that came out of Epic v. Apple. That exemption may change. **Re-read Guideline
3.1.1(a) and 3.1.3 right before each submission.** If US link-outs are no longer
allowed, remove the link before submitting.

### Privacy nutrition label inventory

Declare every flow below. None of it is used for tracking or sold.

| Data | Where it goes | Why |
| --- | --- | --- |
| Email, name, practice name; account ID | Supabase (auth + database) | Account, sign-in |
| Patient charts, findings, notes (health-adjacent records), photos and radiographs | Supabase (database + storage) | App functionality |
| Usage data (page views, events) | Vercel Analytics; Cloudflare Web Analytics (cookieless beacon in `index.html`) | Analytics |
| Audio from dictation | Deepgram (streamed speech-to-text) | App functionality |
| Chart text, dictation transcripts | Anthropic (AI autofill via the `ai-autofill` edge function) | App functionality |
| Camera photos, photo library picks | Supabase storage, attached to the chart | App functionality |

The usage strings in `Info.plist` cover camera, photo library, microphone and
Face ID.

### Reviewer notes and demo account

- Provide a **demo account** (email + password) on a practice with an
  **active** plan and some sample charts, so the reviewer gets past the billing
  gate. Check that it works on the build you submit.
- Notes to include:
  - The app is for veterinary dental practices. Accounts and subscriptions are
    created on toothops.app. The app sells nothing and has no in-app purchases
    (US storefront link-out, 3.1.1(a)).
  - Sign in with Apple is offered alongside Google (4.8). Existing or invited
    users are told to use email sign-in.
  - Where to find the camera, dictation (microphone), the Face ID lock (after 5
    minutes in the background) and account deletion.

### Upload and TestFlight

1. Xcode → select **Any iOS Device (arm64)** → Product → **Archive**.
2. Organizer → **Distribute App** → App Store Connect → Upload.
3. App Store Connect → TestFlight: wait for processing, answer export compliance
   (standard HTTPS only), add internal testers, and run section 4 on the
   TestFlight build.
4. Select that build on the version page, fill in the reviewer notes and demo
   account, and submit for review.
