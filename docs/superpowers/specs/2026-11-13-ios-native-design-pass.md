# ToothOps iOS App — Native Design Pass

Date: 2026-11-13
Status: approved 2026-11-13
Builds on: `2026-11-12-ios-app-design.md` (the Capacitor app, PR #56)

## Intent

The iOS app should look and feel as clean and native as possible — like an
app Apple would ship — so it reads as a real iPhone/iPad app, not a website
in a frame. The website must not change: the iOS look exists only inside
the app.

This is the first of three passes the owner wants:
1. **iOS app** — as native as possible (this document).
2. Mobile website — as mobile-friendly as possible, still a website.
3. Desktop website — as desktop-friendly as possible.
Passes 2 and 3 get their own designs later.

## Goals

- Follows Apple's current Human Interface Guidelines (Liquid Glass design
  language, iOS 26–27; HIG pages checked 2026-11-13: tab bars, toolbars,
  sheets, materials, typography, dark mode, color, lists, alerts, toggles).
- Navigation, sheets, lists, settings, typography, color and dark mode all
  behave the way an iOS user expects.
- Consistent: no screen in the app looks like the website.
- iPhone and iPad both feel native (iPad uses the regular-width patterns).

## Non-goals

- Any visual change to the website (desktop or mobile browser).
- Rewriting the charting grid, tooth diagrams, or PDF output; they're
  restyled, not replaced. PDFs and diagrams stay light (printed output).
- Native Swift UI components (chosen approach is web-based; see below).
- Mobile- and desktop-website improvements (passes 2 and 3).

## Anti-goals

- Website regressions of any kind.
- Gestures that feel off (sheet drag, swipe actions, back swipe) — a
  half-right gesture is worse than none.
- Dark mode with unreadable or still-white areas.
- A half-iOS, half-web app where some screens were missed.

## Constraints

- Everything app-only goes behind `isNativeApp()` (JS) or `html.native-ios`
  (CSS). With `isNativeApp()` false, every screen renders exactly as today.
- One set of screens: components gain an iOS presentation; no duplicate
  screens.
- Existing behavior and tests keep passing; the website suite is the guard.
- Respect system settings: Dynamic Type size, dark mode, Reduce
  Transparency, Increase Contrast, Reduce Motion, Bold Text where feasible.

## Approaches considered

1. **iOS layer on the existing web app (chosen).** App-only components and
   styles (tab bar, navigation bar, shared swipeable sheet, iOS lists,
   design tokens) that existing screens adopt when `isNativeApp()` is true.
   One codebase; website untouched. Liquid Glass is approximated with
   blur/translucency (close, not pixel-identical).
2. **Option 1 plus a real native (Swift) tab bar** for genuine Liquid Glass.
   Rejected for now: the web layer would have to drive the native bar's
   visibility and selection around every sheet — more moving parts and
   glitch risk. Can be added later without redoing the rest.
3. **A web UI kit (Ionic) in iOS mode.** Rejected: because the website must
   keep its own look, every screen would exist twice (Ionic for the app,
   current UI for the web), doubling all future work; its iOS styling also
   tends to trail Apple's latest design.

## The design

### App structure (iPhone)

A floating, translucent **tab bar** at the bottom with four tabs, each with
an SF-Symbols-style filled icon and a one-word label:

| Tab | Contents (today's equivalent) |
|---|---|
| **Chart** | The current chart (EntryGrid sections) |
| **Patients** | My charts (ChartLibrary), grouped by patient, with search |
| **Rechecks** | Recheck reminders (RemindersModal content) |
| **Settings** | Everything in today's Settings menu (ChartMenu) |

Each tab keeps its own navigation state when switching (HIG). The tab bar
is always visible except under a modal sheet. No More tab.

### Chart tab

- **Navigation bar** with the patient's name as a large title that
  collapses to an inline title on scroll; save status ("Saved", "Saving…",
  "Not saved", "View only") as a small subtitle.
- **Title menu:** tapping the title opens a menu to jump between sections
  (Patient, Exam, Anesthesia, Charting, Diagnosis, Procedure, Images,
  Treatment report) — replaces the section rail / MobileSectionMenu.
- **Trailing bar items** (icons, no borders): Share/PDF (opens Documents),
  and a More (…) menu with New chart, Chart history, Edit chart (for
  view-only saved visits), and section Customize where relevant.
- **Dictation** keeps its existing button and bottom sheet, restyled, and
  sits above the tab bar.
- Form sections (Patient, Exam, Anesthesia, Treatment report) render as
  **iOS grouped inset lists**: label/value rows, switches for booleans,
  inline pickers/menus for choices, chevrons for drill-in.
- The **charting grid** and **diagrams** keep their layout, restyled with
  iOS colors, separators, and fonts; pinned headers sit under the glass
  navigation bar with a scroll-edge effect.

### Patients tab

- Large title "Patients", **search field** in the navigation bar.
- iOS **list** of patients (inset grouped), each row: name, details line
  (#PID · visits · last updated), chevron. Recheck-due status as a small
  colored label.
- All of today's filters and sort (species, doctor, Due toggle, sort
  order) stay, in an iOS filter/sort menu in the navigation bar.
- **Swipe actions** on patient rows: Send reminder, Clear recheck, History
  (the actions that exist today). **Delete stays per visit only**, on visit
  rows, destructive in red with confirmation — no new patient-level delete
  or archive.
- **Long-press context menu** with the same actions plus Open.
- Tapping a patient opens their visit list (pushed screen with Back);
  tapping a visit opens it in the Chart tab.

### Rechecks tab

- Built from the data ChartLibrary's "Due" filter uses today
  (`listCharts({ dueOnly: true })`, recall date ≤ today). Large title
  "Rechecks"; sections **Overdue** (before today) and **Due today**. No
  "Later" section (would need new backend).
- Row tap opens the patient; swipe actions: **Send reminder** (opens the
  existing ReminderModal composer as a sheet) and **Clear recheck** (the
  existing action). No new "mark sent" state.
- The reminder email template stays in Settings only.

### Settings tab

One iOS Settings-style list, grouped:
- **Account** (name/email row → Account settings screen)
- **Practice** (Practice settings — name, logo, team; owners only where
  today's rules apply)
- **Charting** (Chart settings), **Recheck reminders** template
  (no AI settings row — there are no user-facing AI settings today)
- **Help**: Getting started, What's new, Send feedback
- **Admin panel** (admins only)
- **Sign out** (destructive, centered, own group)

Each row pushes a sub-screen with a standard Back button and back-swipe;
today's settings modals become these pushed screens in the app. Values
save on change (as today); no Save buttons where today has none.

### Sheets, alerts, menus

- One shared **sheet** component for every remaining dialog (Documents/PDF
  preview, Chart history, Reminder composer, Feedback, What's new,
  Walkthrough, Join practice, Finish setup, PDF style picker):
  grabber, swipe down to dismiss (with an action-sheet confirm if there are
  unsaved changes), Cancel leading / Done trailing per HIG, medium + large
  detents where the content suits progressive disclosure, large only for
  compose/edit flows.
- Only one sheet at a time (HIG).
- App `confirm`/`alert` dialogs (`components/ui/dialogs`) render as **iOS
  alerts**; choice prompts with a destructive option render as **action
  sheets**.
- Toasts become a small capsule banner near the top.

### Visual system

- **Font:** the system font (SF Pro / SF Pro Rounded not required) via
  `-apple-system`; **Dynamic Type** — text sizes derive from the user's
  preferred size (iOS text styles: Large Title, Title, Headline, Body,
  Callout, Subheadline, Footnote, Caption).
- **Color:** iOS semantic colors (system background, grouped background,
  label/secondary label, separator, fills) with ToothOps teal as the tint.
  Red for destructive/abnormal stays.
- **Dark mode:** follows the system setting; every app screen has a dark
  appearance **including the charting grid** (owner decision), with every
  clinical color (abnormal red, missing/extracted marks, score colors)
  re-checked for meaning and WCAG AA contrast in dark. PDFs, PDF preview
  pages, and diagram artwork stay light on their own surfaces.
- **Materials:** tab bar, navigation bars and bottom bars use a translucent
  blurred material (Liquid Glass approximation), regular variant; fall back
  to solid when Reduce Transparency is on; stronger borders with Increase
  Contrast.
- **Motion:** iOS-like push/pop and sheet transitions; disabled with
  Reduce Motion.
- **Haptics:** selection feedback on tab switch, segmented/picker changes
  and toggles (existing haptics stay).
- **Icons:** SF-Symbols-style glyphs (bundled SVGs or a symbol font with
  equivalents); no emoji or text glyphs (×, ☰, ⤓, ▾) in the app chrome.

### iPad

- Regular width: a **sidebar** (Chart sections, Patients, Rechecks,
  Settings) instead of the bottom tab bar, collapsible; compact width
  (Slide Over / narrow split) falls back to the tab bar.
- Sheets use the form/page sheet style (centered card) per HIG.
- The existing ≥1280px grid + diagram side-by-side stays.

### Scope of screens

Every customer-facing screen gets the full treatment, including Login (app
mode), BillingGate / InactivePlan, SessionExpiredOverlay, AppLockOverlay,
AI consent sheet, PracticeSettings, Account, ChartSettings,
OwnerReportCustomize, OwnerReport/Report templates. The **Admin panel and
admin chart viewer** (admins only) get a light pass — iOS font, colors,
dark mode, inside a pushed screen — but keep their data tables.

### Release

Built on the `ios-app` branch; nothing reaches testers until the whole pass
is done (the app hasn't shipped, so no half-converted build goes out).

### Already done (keep)

Safe areas, 16px inputs, keyboard handling, Pencil palm rejection, haptics,
share sheet, camera, Face ID + privacy cover, chart-settings switches, PDF
style sheet — these fold into the new system rather than being redone.

## Left to the builder

- Component internals and file layout for the iOS layer; how screens opt
  in (props vs. platform hook).
- Gesture physics (velocity thresholds, rubber-banding) — must match iOS
  feel; verify on simulator.
- Exact token values (from Apple's published system colors/type sizes).
- Which sheets get a medium detent.
- Icon source (bundled SVG set vs. font), as long as glyphs read as SF
  Symbols.
- Test strategy: unit tests for the components and the web/app branch of
  each adopted screen; screenshot checks on iPhone + iPad simulators in
  light and dark mode.
