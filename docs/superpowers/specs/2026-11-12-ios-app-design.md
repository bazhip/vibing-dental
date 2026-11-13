# ToothOps iOS App — Design

Date: 2026-11-12
Status: draft, awaiting approval

## Intent

Put ToothOps (the React/Vite veterinary dental charting app at toothops.app)
in the US App Store as an iPhone and iPad app that feels native and polished,
with real native features — not a website in a box. The website keeps
working exactly as today; the app and the site ship from one codebase.

Why: App Store presence, a better feel on the devices techs and DVMs actually
chart on, and native capabilities the browser can't give (camera, share
sheet, Face ID, haptics, offline launch).

## Goals

- Approved on the US App Store, universal (iPhone + iPad).
- Every existing charting feature works in the app: patient/exam forms, the
  grid, tooth diagrams with drawing, PDF export/reload, voice/AI autofill,
  saved charts, team sharing, imaging attachments, account deletion.
- Feels native: no web tap flashes, correct safe areas, native status bar,
  bounce scrolling that doesn't fight the grid, keyboard that doesn't jump
  the layout, haptics, splash screen, app icon.
- Native features in v1 (below).
- iPad is a first-class layout, not a stretched phone.

## Non-goals (v1)

- Push notifications (explicitly out).
- Selling anything in the app; Apple in-app purchase.
- Sign-up inside the app.
- Non-US App Store storefronts.
- Rewriting screens in SwiftUI/React Native.
- Android (Capacitor makes it possible later; not in scope).

## Anti-goals

- A wrapper that Apple rejects under 4.2 (minimum functionality).
- Forking the codebase into a separate "app version" that drifts from web.
- Regressing the website in any way while adding app behavior.
- Any in-app path to Stripe checkout or the billing portal, or any pricing,
  in the app.

## Constraints

- App Store Review Guidelines (checked 2026-11-12):
  - 4.2 minimum functionality — met by the native feature set below.
  - 4.8 — app offers Google sign-in, so it must offer Sign in with Apple.
  - 3.1.1 / 3.1.3 — digital subscriptions sold in-app need IAP. The US
    storefront is exempt from the anti-steering rule, so a "Sign up at
    toothops.app" link is allowed there. This exemption stems from Epic v.
    Apple and may change: re-check the guidelines right before each
    submission.
  - 5.1.1(v) — account deletion stays available in-app.
  - Privacy nutrition labels must reflect Supabase, Vercel Analytics,
    Deepgram, and Anthropic data flows; camera/mic/photo usage strings
    required.
- Codebase: ~32k lines TS, ~8k lines CSS, 85 components, React 19 + Vite 8,
  Supabase auth/data/edge functions, Stripe billing, localStorage autosave.
- Tooling: the full Xcode app and an Apple Developer Program membership are
  prerequisites (only Command Line Tools appear to be installed today).

## Approaches considered

1. **Capacitor shell + native plugins + iOS polish (chosen).** The existing
   web build is bundled into a native iOS app; native capabilities come
   from Capacitor plugins; CSS/JS tuned for iOS. One codebase, weeks not
   months. Trade-off: scrolling/transitions remain web-rendered, so polish
   comes from careful tuning rather than UIKit for free.
2. **React Native UI rewrite.** Truly native widgets, but the grid, tooth
   diagrams with freehand drawing, and PDF preview would be rebuilt from
   scratch — months of work and two UIs to maintain.
3. **SwiftUI app.** Best possible feel, but a total rewrite in another
   language with a permanent second codebase. Only sensible if iOS
   replaced the web product.

Chosen: 1, because it reaches the App Store fastest, keeps a single product,
and puts native effort where users feel it. If a specific screen still feels
off later, it can be replaced with a native view inside the same shell.

## Decisions made with the product owner

### Accounts & payments
- App is **sign-in only**: email/password, magic link, Google, and
  **Sign in with Apple**.
- **Sign in with Apple is added to the website too**, so accounts work in
  both places.
- No sign-up form in the app. The login screen shows
  "New to ToothOps? Sign up at toothops.app ↗", opening the site in Safari.
- No billing UI in the app. A signed-in user without an active plan sees a
  neutral "Your plan isn't active — manage it at toothops.app" screen in
  place of `BillingGate`'s checkout/portal UI.
- Stripe (checkout, webhook, portal, `billing-api`, `stripe-webhook`) is
  unchanged.
- The Landing/marketing page is not shown in the app; the app opens to
  login, or straight into charting when signed in.
- Launch on the **US storefront only**.
- In-app account deletion stays.

### Devices
- **Universal: iPhone and iPad.** iPad gets a first-class layout: use the
  width (e.g. grid and diagram side by side where it fits) and support
  **Apple Pencil** drawing on the tooth diagrams (pen input with palm
  rejection — ignore touch strokes while a pen is in use).

### Native features in v1
- **Camera + photo library** for patient photos/radiographs (wherever
  `ImagingSection` and other file pickers take images).
- **Share sheet** for chart PDFs (replaces `downloadjs` in the app:
  Files, AirDrop, Mail, AirPrint).
- **Face ID / Touch ID** app lock when returning to the app (patient data).
- **Haptics** on score taps, missing-tooth toggles, and saves.
- **Native microphone permission** for Deepgram dictation; verify the PCM
  AudioWorklet works in WKWebView.
- **App icon, splash screen, native status bar and safe-area handling.**
- **Offline launch:** web assets bundled in the app; charting works with no
  signal (localStorage autosave as today); cloud saves retry on reconnect.
- **iOS feel pass:** no tap highlight, no accidental text selection/callouts
  on controls, overscroll that doesn't drag the pinned grid header,
  keyboard avoidance that keeps the active grid cell visible, 16px+ inputs
  so iOS doesn't zoom.

### Not in v1
- Push notifications.

## Known integration points (from the code)

- Auth redirects use `window.location.origin + pathname` in
  `src/components/Login.tsx` (`authRedirect`),
  `src/components/GoogleSignInButton.tsx` (`returnUrl`),
  `src/components/AdminPanel.tsx`, `src/hooks/useTeam.ts`, and
  `src/hooks/useBilling.ts`. In the app these must return to the app
  (universal links on toothops.app or a custom URL scheme) and be added to
  Supabase's allowed redirect URLs. Team-invite emails sent from the app
  should still link to the website URL, not the app's internal origin.
- OAuth (Google/Apple) must run in a system browser session
  (ASWebAuthenticationSession / in-app browser), not inside the WKWebView —
  Google blocks embedded web views.
- PDF export: `src/utils/pdfGenerator.ts` uses `downloadjs`.
- File inputs: `ImagingSection`, `ChartLibrary` (PDF reload), `Login`,
  `FinishSetupModal`, `PracticeSettingsModal`, `AdminPanel`.
- Drawing: `src/components/ToothDiagram.tsx` uses pointer events.
- Billing: `src/components/BillingGate.tsx`, `src/hooks/useBilling.ts`,
  `src/constants/plans.ts`; billing entries in `ChartMenu` and
  `PracticeSettingsModal`.
- Landing: `src/components/Landing.tsx`, routed from `src/App.tsx`.
- Analytics: `@vercel/analytics` in `src/index.tsx` (privacy label;
  decide whether it runs in the app).
- Platform branching should go through one small helper (e.g.
  `isNativeApp()` built on `Capacitor.isNativePlatform()`), so web
  behavior is untouched when not native.

## Left to the builder

- Capacitor version, exact plugins, and whether any small custom plugin is
  needed (e.g. Pencil-specific behavior, if pointer events aren't enough).
- Universal links vs custom URL scheme for auth return (universal links
  preferred; requires an `apple-app-site-association` file on toothops.app
  via Vercel).
- Exact iPad layout breakpoints and which screens get side-by-side treatment.
- Face ID lock timeout (suggest: lock after 5 minutes in background).
- Whether Vercel Analytics is disabled in the app.
- Build/release pipeline (local Xcode archive vs Xcode Cloud/fastlane),
  TestFlight setup.
- Test strategy: unit tests for platform-branching helpers and redirect
  logic; manual device test checklist for native features.
- App Store listing assets (screenshots, description, privacy labels,
  reviewer demo account and notes).

## Prerequisites for the product owner

- Install Xcode.
- Apple Developer Program membership (and the team/org the app ships under).
- Sign in with Apple: Services ID + key in the Apple Developer portal,
  configured in Supabase Auth.
- A reviewer demo account with sample charts.
