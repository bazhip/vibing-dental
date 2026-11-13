# iOS Native Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen of the ToothOps iOS app look and behave like a native iOS 26–27 (Liquid Glass) app, with zero visual change to the website.

**Architecture:** An app-only iOS layer: design tokens (light/dark, Dynamic Type, system font) scoped to `html.native-ios`, a small component kit in `src/ios/` (sheet, nav bar, tab bar, stack, lists, icons, alerts), and an app shell with four tabs. Existing screens adopt the kit when `isNativeApp()` is true and render exactly as today otherwise.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, CSS (no new UI dependencies), Capacitor 7 (StatusBar, Haptics), Playwright WebKit for screenshot checks (scratch install at /tmp/pw).

**Spec:** `docs/superpowers/specs/2026-11-13-ios-native-design-pass.md`

## Global Constraints

- With `isNativeApp()` false (the website), every screen renders exactly as before. The full existing suite and `npm run build` pass after every task.
- App-only CSS lives under `html.native-ios`; app-only JS branches on `isNativeApp()`. No new runtime dependencies.
- Follow the HIG as summarized in the spec: tab bar (4 tabs: Chart, Patients, Rechecks, Settings), navigation bars with large titles, sheets with grabber + swipe-to-dismiss + Cancel (leading) / Done (trailing), one sheet at a time, iOS alerts/action sheets, inset-grouped lists, switches, system font, Dynamic Type, system dark mode, translucent bars with Reduce Transparency fallback, Reduce Motion respected.
- Dark mode covers every app screen including the charting grid; PDFs, PDF preview pages and diagram artwork stay light. Clinical colors keep their meaning and meet WCAG AA in both schemes.
- No new destructive actions; delete stays per visit. No new backend or schema.
- Touch targets ≥ 44pt. No text glyphs (×, ☰, ⤓, ▾, ↶) in app chrome — icons from `src/ios/icons`.
- Dev-only preview: `?iosPreview=1` works only when `import.meta.env.DEV` (never in production builds).
- Commits as bazhip (`git config user.email` = 10350445+bazhip@users.noreply.github.com), co-author line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, branch `ios-app`, no push from task agents.

## Review Focus

1. **Website unchanged** — any web screen differing from main is a defect. Each task adds/keeps web-mode tests for the screens it touches (render with `isNativeApp` false and assert the old structure/classes).
2. **Sheet gestures** — a drag that starts inside a scrolled sheet body scrolls content, not the sheet; swipe-down dismiss only from the top of the content or the grabber; unsaved-changes confirm. Test in Task 2.
3. **Dark mode completeness** — no white or unreadable surfaces on any app screen; grid clinical colors legible. Screenshot every tab + main sheets in dark (Task 7).
4. **Dynamic Type extremes** — largest accessibility size doesn't clip nav titles, tab labels, or list rows (truncate/wrap gracefully). Screenshot at xSmall and AX3 (Task 7).
5. **State preservation** — switching tabs keeps scroll position, pushed screens, and the open chart; a chart opened from Patients/Rechecks lands in the Chart tab. Test in Task 3.

---

### Task 1: iOS tokens, dark mode, Dynamic Type, color sweep, dev preview

**Files:**
- Create: `src/ios/tokens.css`, `src/ios/colorSweep.test.ts`, `src/ios/preview.ts`, `src/ios/preview.test.ts`
- Modify: `src/index.tsx` (import tokens.css; init preview), `src/native/platform.ts` (preview override), `src/native/iosFeel.ts` (status bar follows scheme), CSS files used by app screens: `src/components/EntryGrid.css`, `src/styles/boards.css`, `src/components/Login.css`, `src/components/BillingGate.css`, `src/components/AccountSurfaces.css`, `src/components/OwnerReportTemplatesModal.css`, `src/index.css`, `src/App.css`; inline color styles in TSX that render in the app.

**Interfaces:**
- Produces: CSS custom properties under `html.native-ios` (light) and `html.native-ios` + `@media (prefers-color-scheme: dark)` (dark): iOS semantic tokens `--ios-bg`, `--ios-bg-grouped`, `--ios-bg-elevated`, `--ios-cell`, `--ios-label`, `--ios-label-2`, `--ios-label-3`, `--ios-separator`, `--ios-fill`, `--ios-tint` (ToothOps teal, adjusted for dark), `--ios-danger`, `--ios-bar-material` (translucent bar background), `--ios-font`, and Dynamic Type sizes `--ios-text-large-title|title1|title2|title3|headline|body|callout|subheadline|footnote|caption1|caption2`. The existing theme variables (`--bg-page`, `--surface`, `--text`, `--primary`, `--border`, …) are re-pointed to these in the app so existing screens follow automatically.
- Produces: `isIosPreview(): boolean` in `src/ios/preview.ts`; `isNativeApp()` returns true when `isIosPreview()` (DEV only, `?iosPreview=1`, remembered in sessionStorage), and `initNativeShell()` then adds `native-ios`.

- [ ] **Step 1: Failing tests.** `preview.test.ts`: `isIosPreview()` false when `import.meta.env.DEV` is false even with `?iosPreview=1`; true in DEV with the param. `colorSweep.test.ts`: for each listed CSS file, every hex/rgb color literal is either inside a `var(--…, <fallback>)` fallback, inside a `html.native-ios` block, or on an allow-list of print/diagram/PDF-preview selectors (listed in the test with a reason each). Run → FAIL.
- [ ] **Step 2: Tokens.** Write `tokens.css` with light and dark token sets from Apple's published iOS system colors; system font stack `-apple-system, system-ui`; Dynamic Type: in the app, root `font: -apple-system-body` so `rem`/`em` scale with the user's text size, and text-style tokens derived from it. `@media (prefers-reduced-transparency: reduce)` → opaque bar material; `(prefers-contrast: more)` → stronger separators; `(prefers-reduced-motion: reduce)` → no transitions.
- [ ] **Step 3: Sweep.** Replace bare color literals in the listed CSS files with `var(--existing-or-new-token, <original literal>)` so the website (tokens unset or equal) is pixel-identical, and the app follows the iOS tokens. Grid clinical colors (abnormal, missing/extracted, scores, selection) get dedicated tokens with dark values checked for meaning + WCAG AA; record the values and contrast ratios in the report. Inline styles: same approach.
- [ ] **Step 4: Status bar** style follows `prefers-color-scheme` (listen for changes).
- [ ] **Step 5: Verify.** Tests pass; `npm test`, `tsc`, `build`. Playwright WebKit (iPhone 15) against `npm run dev` with `?iosPreview=1` in light and `colorScheme: 'dark'`: screenshots of the trial chart (all sections), chart settings, PDF preview into the sdd screens dir. Web (no param) screenshots of the same pages must be pixel-identical to `origin/main`'s build for the landing page and trial chart (compare with Playwright `toHaveScreenshot`-style pixel diff or image hash; report the result).
- [ ] **Step 6: Commit** `feat(ios): iOS tokens, dark mode, Dynamic Type, app-only color sweep`.

---

### Task 2: iOS component kit

**Files:**
- Create: `src/ios/icons.tsx`, `src/ios/Sheet.tsx`, `src/ios/NavBar.tsx`, `src/ios/TabBar.tsx`, `src/ios/Stack.tsx`, `src/ios/List.tsx`, `src/ios/SwipeRow.tsx`, `src/ios/ContextMenu.tsx`, `src/ios/ios.css`, tests `src/ios/*.test.tsx`
- Modify: `src/components/ui/dialogs.tsx` (DialogHost renders iOS alert / action sheet / capsule toast when native)

**Interfaces (Produces):**
- `Icon({ name: IconName; size?: number; title?: string })` — SF-Symbols-style SVGs; `IconName` includes at least: `chevron-left`, `chevron-right`, `chevron-down`, `xmark`, `ellipsis-circle`, `square-and-arrow-up`, `doc-text`, `person-2`, `calendar-badge-clock`, `gear`, `magnifyingglass`, `line-3-horizontal-decrease`, `mic`, `plus`, `trash`, `arrow-uturn-backward`, `arrow-uturn-forward`, `checkmark`, `bell`, `clock-arrow-circlepath`, `sidebar-left`, `tooth` (custom), `camera`, `photo`.
- `Sheet({ open, onClose, title?, cancelLabel?, onCancel?, doneLabel?, onDone?, doneDisabled?, detents?: ('medium'|'large')[], confirmDismiss?: () => Promise<boolean> | boolean, children })` — grabber, swipe-down dismiss (from grabber/header, or body when scrolled to top), velocity + distance threshold, rubber-band, backdrop tap closes, focus trap, Escape closes, only one open at a time (a second open closes the first), iPad (≥ 768px wide) renders a centered form sheet.
- `NavBar({ title, subtitle?, largeTitle?: boolean, leading?: ReactNode, trailing?: ReactNode, titleMenu?: { label: string; onSelect(): void; checked?: boolean }[], scrollRef?: RefObject<HTMLElement> })` — glass material, large title collapses to inline on scroll, title menu opens a popover menu.
- `TabBar({ tabs: { id: string; label: string; icon: IconName; badge?: number }[], active: string, onChange(id) })` — floating glass bar, filled icon for active tab, haptic selection.
- `Stack({ root: ReactNode })` + `useStack(): { push(screen: StackScreen): void; pop(): void; depth: number }`, `StackScreen = { id: string; title: string; render(): ReactNode; trailing?: ReactNode }` — push/pop animation, Back button with previous title, edge back-swipe.
- `List`, `ListSection({ header?, footer?, children })`, `ListRow({ title, subtitle?, value?, icon?, accessory?: 'chevron'|'check'|ReactNode, destructive?, onClick? })`, `SwitchRow({ title, subtitle?, checked, onChange, disabled? })`.
- `SwipeRow({ actions: { label; icon?; tone?: 'default'|'destructive'|'tint'; onAction(): void }[], children })` — trailing swipe actions, full-swipe triggers first, closes on outside tap.
- `ContextMenu({ items: { label; icon?; destructive?; onSelect() }[], children })` — long-press (500ms) menu with haptic.
- Native DialogHost: `confirmDialog` → iOS alert (two buttons; destructive styled red), choice prompts with `destructive` → action sheet; `promptDialog` → alert with text field; toasts → capsule at top.

- [ ] **Step 1: Failing tests** per component: Sheet — renders grabber/Cancel/Done, Escape and backdrop close, `confirmDismiss` false keeps it open, opening a second Sheet closes the first, drag with body `scrollTop > 0` doesn't dismiss (simulate pointer events), drag past threshold dismisses (Review Focus 2). NavBar — title menu items call onSelect; large title class toggles on scroll. TabBar — onChange called, active has `aria-selected`. Stack — push renders new screen with Back labelled with previous title; pop returns. SwipeRow — action buttons revealed and callable via keyboard (accessible alternative). ContextMenu — long-press opens, Escape closes. dialogs — native confirm renders role="alertdialog" with buttons; web unchanged (existing tests). Run → FAIL.
- [ ] **Step 2: Implement** each component with `ios.css` (tokens from Task 1). Pointer-event gestures, `prefers-reduced-motion` honored. Accessibility: roles, labels, focus management, VoiceOver-friendly alternatives (SwipeRow actions reachable via a "More actions" button for keyboard/VO; Sheet has a close control).
- [ ] **Step 3: Verify** tests, suite, tsc, build. Add a DEV-only gallery route (`?iosPreview=1&iosGallery=1`) rendering every component; screenshot it light + dark (iPhone 15 and iPad Pro 11 viewports).
- [ ] **Step 4: Commit** `feat(ios): iOS component kit (sheet, nav, tabs, stack, lists, menus, alerts)`.

---

### Task 3: App shell (tabs, sidebar on iPad, routing)

**Files:**
- Create: `src/ios/AppShell.tsx`, `src/ios/AppShell.test.tsx`, placeholder screens `src/ios/screens/PatientsScreen.tsx`, `RechecksScreen.tsx`, `SettingsScreen.tsx` (minimal, replaced in Tasks 5–6)
- Modify: `src/EntryGrid.tsx` (when native: render `AppShell` with the chart as the Chart tab; topbar/section rail/MobileSectionMenu/ChartMenu not rendered), `src/App.tsx` only if needed

**Interfaces:**
- Consumes: Task 2 kit.
- Produces: `AppShell({ chart: ReactNode; patients: ReactNode; rechecks: ReactNode; settings: ReactNode; activeTab; onTabChange })`, `type AppTab = 'chart'|'patients'|'rechecks'|'settings'`, and a context `useAppShell(): { goToTab(tab: AppTab): void; openChart(): void }` so Patients/Rechecks can open a chart and land on the Chart tab. Each tab body is a `Stack` root. iPad regular width (≥ 1024px, or ≥ 768px landscape): sidebar listing the four destinations (and chart sections under Chart) instead of the tab bar.
- EntryGrid exposes to tabs what they need today from its own state (open chart by id, library data, settings modal state) — implementer decides the minimal prop surface and documents it in the report for Tasks 4–6.

- [ ] **Step 1: Failing tests:** tab switch keeps each tab mounted (state preserved, Review Focus 5); `openChart()` from Patients switches to Chart; web render of EntryGrid unchanged (topbar present, no tab bar); iPad width renders sidebar not tab bar. Run → FAIL.
- [ ] **Step 2: Implement.** Tabs stay mounted (hidden with `hidden`/`inert`), scroll positions preserved.
- [ ] **Step 3: Verify** + preview screenshots (iPhone + iPad, light + dark). Commit `feat(ios): app shell with tab bar and iPad sidebar`.

---

### Task 4: Chart tab

**Files:** Modify `src/EntryGrid.tsx` (Chart tab content), `src/components/PatientForm.tsx`, `ExamForm.tsx`, `AnesthesiaForm.tsx`, `SurgeryReportForm.tsx`, `OwnerReportSection.tsx`, `DentalGrid.tsx`, `DiagramView.tsx`, `ToothDiagram.tsx` (chrome only), `VoiceInputButton.tsx` (placement/style), `ScoreChips.tsx`, `ImagingSection.tsx`, related CSS (app-scoped). Tests alongside.

**Interfaces:** Consumes AppShell + kit. NavBar title = patient name (or "New chart"), subtitle = save status text; `titleMenu` = the 8 sections (jump/scroll); trailing = Share (opens Documents sheet) + More menu (New chart, Chart history, Edit chart when view-only, Customize for the current section). Dictation button floats above the tab bar. **Saved-visit state:** no banner in the app — when viewing a view-only saved visit, the NavBar subtitle reads `View only · <date>` and the trailing items gain an **Edit** button (same handler as today's banner "Edit chart"); "New visit" and "History" move into the More menu; editing/two-tab-warning states show as the subtitle plus an iOS banner-style inline notice that never overlaps the bar.

- [ ] **Step 1: Failing tests:** native chart renders NavBar with patient name + save status; view-only saved visit shows `View only · <date>` subtitle + Edit button and no `.chart-lock-banner`; title menu jumps to a section; More menu items call existing handlers; form sections render inset-grouped rows with switches for booleans; web render unchanged for each form.
- [ ] **Step 2: Implement.** Forms: label/value rows, iOS pickers/menus for choices, switches; grid and diagrams restyled via tokens (no layout change), pinned header under the glass bar with scroll-edge fade; diagram toolbar icons from `Icon`.
- [ ] **Step 3: Verify** + preview screenshots of every section, light + dark, iPhone + iPad. Commit `feat(ios): native chart tab`.

---

### Task 5: Patients and Rechecks tabs

**Files:** Create `src/ios/screens/PatientsScreen.tsx`, `RechecksScreen.tsx` (+ tests); Modify `src/components/ChartLibrary.tsx` (extract data/actions hooks it already has so the iOS screens reuse them; web markup unchanged).

**Interfaces:** Patients: large title, search in nav bar, filter/sort menu (species, doctor, Due, sort order — same options as today), inset-grouped patient list (name, "#PID · N visits · Updated …", recheck label), tap → visits screen (pushed) → tap visit → `openChart()`. Patient row swipe/long-press: Send reminder, Clear recheck, History. Visit row swipe/long-press: Open, Delete (destructive, confirm). Rechecks: `listCharts({ dueOnly: true })`, sections Overdue (< today) / Due today, swipe Send reminder (ReminderModal as Sheet) / Clear recheck; empty state text.

- [ ] **Step 1: Failing tests:** search filters; each filter option present and applied; patient swipe actions call the existing handlers; Delete only on visit rows and asks to confirm; Rechecks groups by date correctly (fixed clock); web ChartLibrary tests unchanged.
- [ ] **Step 2: Implement.** **Step 3: Verify** + screenshots. Commit `feat(ios): Patients and Rechecks tabs`.

---

### Task 6: Settings tab and pushed settings screens

**Files:** Create `src/ios/screens/SettingsScreen.tsx` (+ test); Modify `ChartSettingsModal.tsx`, `PracticeSettingsModal.tsx`, `AccountModal.tsx`, `RemindersModal.tsx`, `WhatsNewModal.tsx`, `WalkthroughModal.tsx`, `FeedbackModal.tsx`, `OwnerReportCustomize.tsx`, `OwnerReportTemplatesModal.tsx`, `ReportTemplatesModal.tsx`, `AdminPanel.tsx` / `AdminChartViewer.tsx` (light pass) — each gains a body-only rendering used as a pushed `StackScreen` in the app; web modals unchanged.

**Interfaces:** Settings list groups per spec: Account (row with name/email) · Practice (owner rules as today) · Charting · Recheck reminders · Help (Getting started, What's new, Send feedback) · Admin panel (admins only) · Sign out (destructive, own group, uses `signOutAndSweep`). Rows push screens with Back + back-swipe.

- [ ] **Step 1: Failing tests:** each row pushes the matching screen; admin row only for admins; Sign out calls signOutAndSweep after an iOS confirm; web modals' existing tests pass.
- [ ] **Step 2: Implement** (fold the chart-settings iOS styling already in native-ios.css into the kit's List/SwitchRow). **Step 3: Verify** + screenshots. Commit `feat(ios): native Settings tab`.

---

### Task 7: Sheets and auth surfaces; full-app screenshot audit

**Files:** Modify `DocumentsModal.tsx`, `PdfPreviewModal.tsx` (chrome), `OwnerReportModal.tsx` (chrome), `ChartHistoryModal.tsx`, `ReminderModal.tsx`, `JoinPracticeModal.tsx`, `FinishSetupModal.tsx`, `PdfStylePicker.tsx` (use `Sheet`), `Login.tsx` (app mode), `BillingGate.tsx` / `InactivePlan.tsx`, `SessionExpiredOverlay.tsx`, `AppLockOverlay.tsx`, `src/native/aiConsent.tsx`; remove superseded rules from `src/styles/native-ios.css`.

- [ ] **Step 1: Failing tests:** each listed modal renders inside `Sheet` (grabber, Cancel/Done per HIG) when native and as today on web; Login app mode uses inset-grouped fields and iOS buttons; consent sheet uses `Sheet`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Audit.** Screenshot every tab, pushed screen, and sheet in preview mode: iPhone 15 + iPad Pro 11, light + dark, plus Dynamic Type xSmall and AX3 for Chart, Patients, Settings (Review Focus 3, 4). Also simulator screenshots (`npm run ios:sync`, build, launch) of Login light + dark. List every screen checked in the report; fix anything still web-looking.
- [ ] **Step 4: Commit** `feat(ios): native sheets and auth screens; full-app audit`.
