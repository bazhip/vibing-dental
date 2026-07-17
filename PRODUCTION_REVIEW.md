# ToothOps Charting — Production-Readiness Review

**Date:** 2026-07-17 · **Reviewed:** full repo at `f149fa4`…`02b8e22` + live app behavior (headless Chrome)
**Method:** four parallel specialist passes (architecture/performance, accessibility/WCAG 2.2 AA, security/reliability, UX/content/responsive), findings adversarially cross-checked against the code, then the Immediate tier executed (see §8 — items marked ✅ FIXED were remediated and verified in this pass).

---

## 1. Executive summary

**Overall product quality: strong for its stage.** The daily charting journey — the product's reason to exist — is genuinely well built: spreadsheet-grade keyboard behavior in the grid, bidirectional Missing-tooth sync between grid and diagrams, species-switch guards, a live patient banner, and a PDF pipeline with real polish. The weak edges were everything *around* the happy path: session expiry, save-failure visibility, shared-machine hygiene, and crash recovery.

**Overall frontend quality: above average, with two structural gaps (both now closed).** State architecture is clean (three well-factored hooks, no god components, unusually good comments). The gaps were a monolithic 1.14 MB bundle with zero code splitting, and no error boundary — both fixed in this pass. The remaining structural risks are the pinned 2022 beta of react-data-grid and the single-URL/no-router design.

**Strongest parts:** localStorage-first offline resilience with quota handling; fork-on-RLS-refusal save recovery; the PDF round-trip (charts rehydrate from their own PDFs); RLS as the real authorization layer; the charting keyboard model.

**Biggest remaining risks:** (1) session expiry still hard-ejects to the landing page mid-procedure (saves now error visibly instead of silently stopping, but the re-auth-in-place flow isn't built); (2) the chart library's 500-row ceiling with client-side-only search (now labeled, not yet paginated); (3) react-data-grid 7.0.0-beta.19 has no upgrade path without a migration.

**Most important recommendation:** build the re-auth-in-place flow (keep the chart mounted, overlay a sign-in) before the first practice hits a mid-procedure token expiry on flaky clinic Wi-Fi.

**Production-readiness: Ready with known risks** (was *Ready after critical fixes*; the critical tier is done — see §8 and the rating at the end).

---

## 2. Application map

Single-URL SPA, no router. View state is React state (not linkable, Back exits the site).

| Screen / feature | Purpose | Primary user | Main actions | Key states | Components | Risk |
|---|---|---|---|---|---|---|
| Landing | Marketing + auth entry | Prospective/returning user | Watch demo, sign in/up | animated hero (3 scenes), auth overlay | `Landing`, `Login` | Low |
| Sign in / Sign up | Account + practice profile | Practice admin | Create account (practice, doctor, logo), sign in, forgot password | error/notice/busy, confirm-email path | `Login` | Med |
| Reset password | Recovery-link landing | Any user | Set new password | recovering flag from `PASSWORD_RECOVERY` | `ResetPassword`, `App` | Low |
| Chart (main) | The working chart | Tech/DVM mid-procedure | 7 sections: Patient, Exam, Anesthesia, Charting grid, Diagnosis diagram, Procedure diagram, Treatment report; voice autofill; PDF preview | save chip (saving/saved/error), sticky topbar/headers, per-section nav | `EntryGrid`, `useChartState`, `useCloudSync`, `DentalGrid`, `DiagramView`/`ToothDiagram`, `VoiceInputButton` | **High** (core) |
| Chart library | Patient records browser | Tech/DVM | Search, open, delete | loading/empty/error, 500-row cap | `ChartLibrary` | Med |
| PDF preview | Export | Tech/DVM | Style picker, download | generating/ready/error | `PdfPreviewModal`, `pdfGenerator` | Med |
| Practice settings | Identity | Practice admin | Name/doctor, logo upload/remove, change password | busy/error/note, three commit models | `PracticeSettingsModal`, `useProfile` | Low |
| Menu | Chart/practice/app actions | All | New chart, save, load PDF, library, settings, autosave toggle, sign out | open/closed | `ChartMenu` | Low |

**Architecture:** CRA + React 18 + TS. `App` (auth gate; Supabase session or legacy flag) → `EntryGrid` composing `useChartState` (all chart state, per-slice versioned localStorage), `useCloudSync` (debounced snapshot upsert to a Supabase `charts` jsonb row, last-write-wins, RLS-scoped), `useProfile` (branding). Data flow is top-down props, no context. localStorage is the offline working copy of exactly one active chart; PDFs embed a full state stash for round-trip.

---

## 3. Top 10 issues (as found; ✅ = fixed in this pass)

1. ✅ **No error boundary** — a render crash white-screened a clinical tool mid-procedure (Critical, Reliability).
2. ✅ **Session expiry silently stopped autosave** (`upsertChart` returned void with no status when the session was gone), then hard-ejected to the landing page (Critical, UX/Reliability). *Silent half fixed; eject-to-landing remains (roadmap).*
3. ✅ **Sign-out left the previous account's patient chart in localStorage** — next sign-in on a shared clinic machine inherited it (High, Privacy).
4. ✅ **Debounced autosave dropped the last ≤1.5 s of edits** on chart switch and sign-out; failed saves never retried, even on reconnect (High, Data loss).
5. ✅ **Save failure was a dead end and invisible on phones** — chip said "Save failed" with no action; `display:none` under 600 px (High, UX).
6. ✅ **1.14 MB single bundle** — pdf-lib, Anthropic SDK, grid, and landing all shipped to every visitor (High, Performance).
7. ✅ **Tooth diagram was pointer-only** — extractions could not be recorded by keyboard at all; no SR access (Critical, WCAG 2.1.1).
8. ✅ **Malformed snapshot (crafted/corrupt PDF or old cloud row) crashed persistently** — bad data was written to localStorage before it threw, so every reload re-crashed (High, Reliability).
9. **Chart library 500-row ceiling with client-side search** — chart #501 (the *oldest* records) unfindable. ✅ *Cap now disclosed; server-side search/pagination still needed at scale* (High, UX).
10. **Session-expiry eject + no route state** — Back button exits the app, nothing is linkable, expiry unmounts the chart (Medium-High, UX/Architecture). *Not fixed; roadmap.*

---

## 4. Detailed findings

Grouped; each includes location, severity, confidence, and status. Issues sharing one root cause are merged.

### Product & UX

#### Silent save stop on session expiry, then hard eject
- Category: Reliability/UX · Severity: **Critical** · Confidence: Confirmed
- Location: `useCloudSync.ts` (upsertChart early return), `App.tsx:38-41`
- Evidence: `if (!sessionData.session) return;` — no status change; `onAuthStateChange` → `setIsAuthenticated(false)` unmounts the chart.
- Why: a tech mid-procedure loses cloud persistence with zero signal, then the whole chart vanishes to a marketing page.
- Fix: ✅ missing session now sets `status: 'error'` and throws ("Signed out — sign in again to resume cloud saving"), surfacing the retry chip. **Remaining:** re-auth overlay that keeps the chart mounted. Effort: M · Test: expire the token (revoke session server-side), keep typing, assert the error chip.

#### Unguarded chart replacement & sign-out flush
- Category: Data loss · Severity: **High** · Confidence: Confirmed
- Location: `useCloudSync.ts` openChart/signOut; `ChartMenu.tsx`
- Evidence: opening a library chart applied the snapshot unconditionally; sign-out called `supabase.auth.signOut()` with a 1.5 s debounce still pending.
- Fix: ✅ dirty tracking (`lastSavedRef`) + `flushPending()`: autosave-on → flush before open/sign-out; autosave-off → explicit confirm; flush failure → confirm with "unsaved changes will be lost." Suggested test: type, immediately open another chart, verify the first row contains the last keystroke.

#### Save-failure feedback (desktop dead end, mobile invisible)
- Category: UX · Severity: **High** · Confidence: Confirmed
- Location: `EntryGrid.tsx` chip; `EntryGrid.css` ≤600 px block
- Fix: ✅ error chip is now a **"Not saved — retry"** button wired to `saveNow()`; an `online` listener auto-retries after a connection blip; on phones the transient chips stay hidden but the error button remains, compact. A permanently-mounted visually-hidden live region announces all three states. `beforeunload` now guards tab close while saving/error.

#### New-chart confirm copy was wrong in cloud mode
- Severity: Medium · Confirmed · `ChartMenu.tsx`
- "This cannot be undone" — false with autosave on (the chart is in My charts). Wrong warnings train users to ignore dialogs. ✅ Copy is now autosave-aware.

#### Library at scale
- Severity: **High** · Confirmed · `useCloudSync.ts` `.limit(500)`, `ChartLibrary.tsx` client filter
- ✅ Cap disclosed in the UI. **Remaining (roadmap):** server-side `ilike` search, date/species filters, pagination; repeat patients render near-identically (differentiated only by "Updated" timestamp).

#### No routing/back-button/deep links
- Severity: Medium · Confirmed · single URL, view/section/modal state all in React state.
- Back from the library exits the site (worst on tablets with gesture-back). Recommend hash routes (`#/library`, `#/chart/:id`) — not done (M effort, roadmap).

#### First-use experience
- Severity: Medium · Confirmed. New accounts land on an empty Patient form with no pointer to voice autofill (which needs a BYOK key) or the Missing-tooth sync. Signup logo silently dropped on the confirm-email path (`Login.tsx` — upload only runs when a session returns). Roadmap: a three-hint first-run banner; stash the logo file for post-confirm upload or say it'll need re-upload.

### Visual design
The token system (`themes.css`: teal `#0C6B63`, ink, danger, Inter + Geist Mono) is coherent across app and PDF (live-token coupling via `readAppTokens()`); card/radius/spacing rhythm is consistent. No high-severity visual findings. Low items: three commit models coexist inside Practice settings (Save button vs instant logo vs password button — label the footer "Save name & doctor"); "Password updated." note is easy to miss.

### Accessibility (WCAG 2.2 AA)

| Finding | WCAG | Sev | Status |
|---|---|---|---|
| Tooth diagram pointer-only (extraction unrecordable by keyboard; no SR names) | 2.1.1, 4.1.2 | Critical | ✅ Each tooth: `role="button"`, `tabIndex=0`, `aria-pressed`, per-tooth `aria-label` incl. mark + locked state, Enter/Space toggles, focus-visible ring; SVG named by mode |
| Missing-row text 2.35:1 on danger tint | 1.4.3 | High | ✅ `#5d6b7a` (≥4.5:1), strike-through + tint retained |
| Save chip live region conditionally mounted; removed on mobile | 4.1.3 | Med | ✅ Permanent visually-hidden `role="status"`; mobile keeps the error button |
| Landing auth dialog unnamed | 4.1.2 | High | ✅ `aria-label` by mode |
| Placeholder-only labels @ 2.26:1 (Login/Reset/Library) | 3.3.2, 1.4.3 | High | ✅ Placeholder `#64748b` (4.76:1) + "At least 6 characters" hint. **Remaining:** visible `<label>`s (roadmap) |
| PracticeSettings modal: no focus move, no Escape | 2.4.3 | High | ✅ Focus first field on open + Escape closes. **Remaining:** shared focus trap for all 4 overlays (roadmap) |
| Missing-column selection ring removed | 2.4.7 | Med | ✅ Toned-down 1 px ring instead of none |
| Comment delete 12×14 px, resize 14×14 px | 2.5.8 | Med | ✅ 24 px hotspots (visuals unchanged) |
| Reduced-motion hero rendered as an empty box (global kill strands scenes at opacity 0) | 2.2.2-adjacent bug | Med | ✅ Scene A pinned static; B/C hidden. **Remaining:** on-page pause control for full 2.2.2 (roadmap) |
| `role="menu"`/`tablist` without arrow-key contracts | 4.1.2 | Med | Roadmap: demote to disclosure/nav semantics (simpler than implementing the patterns) |
| Small-text contrast (`code-ref__count` 4.02:1, ai-ok green 3.3:1) | 1.4.3 | Low | ✅ token muted / green-700 |
| No skip link; section titles are `<span>`s | 2.4.1, 1.3.1 | Low | Roadmap |

**Done well:** global reduced-motion kill + consistent `:focus-visible` ring; core palette passes AA everywhere else (computed); full-cell hit area + per-row `aria-label` on the Missing checkbox; correct `autocomplete` attributes throughout auth.

### Responsive
- **High (open):** the 11-column grid gets its horizontal-scroll treatment only ≤600 px; at iPad-portrait 768 px columns compress to ~44-55 px with truncating headers. Move the scroll breakpoint to ~900 px. Requires visual verification on device.
- **Medium (open):** grid row height ~35-37 px with no `pointer: coarse` adjustments — sub-44 px touch targets for gloved cell editing.
- ✅ Save-state signal on phones (see above).
- **Low (open):** desktop rail sticky offset hardcoded `top: 4.75rem` while topbar height is dynamic — use `calc(var(--topbar-height) + 0.5rem)`; verify auth overlay scrolls at 320 px with keyboard open.
- Landing mobile behavior is solid (verified in CSS); the 900/600 px rail→scroller→dropdown handoff is well done.

### Frontend architecture & code quality
- ✅ **No code splitting** → `React.lazy` at the App seam (Landing vs EntryGrid vs ResetPassword), PDF modal lazy at first preview, `pdf-lib` dynamic in `loadFromPdf`, Anthropic SDK dynamic in `aiAutofill.createClient()`. Main bundle **377.5 kB → 103.8 kB gzip**.
- ✅ **Unvalidated jsonb/PDF casts** → `isChartSnapshot()` + `normalizeSnapshot()` gate `applySnapshot`; `loadFromPdf` shape-checks before anything is persisted; `hasContent()` defensive.
- **Open (Medium):** cell editor identity churns per keystroke (`makeCodeCellEditor` keyed on `toothData`) — define at module scope with refs; `key={containerWidth}` remounts the grid per resize pixel; comment drag commits to parent state per pointermove (the `liveStroke` pattern already solves this for strokes — apply it to comments); every keystroke re-serializes the full snapshot twice (`useMemo` the serialization or move it into the debounce body).
- **Open (Medium):** `react-data-grid@7.0.0-beta.19` — 2022 beta, removed APIs, no patch path. Plan a migration (or a plain-table replacement; 42 rows need no virtualization).
- **Open (Low):** `useProfile` per-consumer fetch (fine while single-consumer), PdfPreviewModal object-URL revoke race in a narrow cancellation window, dead `updateToothData`/`resetToothData`, one `as any` in `CodeField`.
- **Strengths:** hook layering (`useChartState` ← `useCloudSync`), StrictMode-stomp guard with written rationale, quota-exhaustion alert, undo system with reference-equality snapshots, PDF stash design, pure helpers extracted for tests (15 unit tests pass).

### Performance
Measured post-fix (gzip): main 103.8 kB; chart chunk 177.9 kB (grid + diagrams + supabase); pdf chunk 38.6 kB; landing 26.9 kB; Anthropic SDK loads only when voice runs. Open items are the re-render hotspots above (measurable on tablets after heavy freehand annotation) — profile with React DevTools on an iPad before optimizing further.

### Reliability
- ✅ Error boundary (friendly "your chart is saved on this device" + reload).
- ✅ Crash-loop via bad snapshot closed (validation before persistence).
- ✅ Retry-on-reconnect + manual retry; no-session surfaces as error.
- **Open:** two tabs share localStorage keys and last-write-wins with no version column (documented choice; a `storage`-event "open in another tab" guard would be cheap). Double-submit protection verified adequate everywhere (busy flags, per-row busyId, confirms).

### Security & privacy (frontend surface — this review cannot establish overall security)
- ✅ **Shared-machine leak:** sign-out now sweeps `vibing-dental.chart.*`.
- **Open (Medium):** BYOK Anthropic/Deepgram keys persist in plaintext localStorage across sign-out (deliberate BYOK trade-off; consider prompting on sign-out). Supabase session tokens in localStorage — document explicit sign-out as clinic procedure, or move to `sessionStorage`.
- **Open (Low/accepted):** `'margles'` legacy string ships in the bundle (dead code in cloud builds; standalone mode is a client-side-only gate by design); public logos bucket (branding only, owner-scoped writes, enumeration requires UUID guessing); no CSP/`X-Frame-Options` on Pages (add a `vercel.json` headers block for the Vercel deploy).
- **Verified clean:** no `dangerouslySetInnerHTML`/`innerHTML` anywhere; PDF-stash parse has no HTML sink or exploitable prototype-pollution path; reset-password redirect not attacker-influenced; logo uploads canvas-re-encoded to PNG (strips metadata/polyglots); sourcemaps off; RLS on every table + storage folder scoping — client checks are correctly *not* the authorization layer.

### Content
✅ Fixed: "Continue"→"Sign in", "Working…"→mode-aware, "rehydrate"→plain language, preview error copy actionable, save-failure alert names the local-copy escape hatch, new-chart confirm honest, password rule stated at signup.
Open (Low): "No patient — add one in section 01" (section numbers don't exist in the phone dropdown); footer feedback email is personal gmail (fine for now, notes to a support alias later). Domain language (Triadan, furcation, PD state) is correct and rightly not dumbed down.

### Testing
Current: 3 unit suites (PDF parser, aiAutofill actions, comment layout), 15 tests, all passing; E2E is ad-hoc headless-Chrome scripts (the verify recipe). Recommended priorities: (1) Playwright specs for the five core journeys (signin, chart+autosave lifecycle, library open/delete with dirty guard, PDF round-trip, sign-out sweep) — the smoke scripts from this review are 80 % of the work; (2) unit tests for `hasContent`/`isChartSnapshot`/dirty-flush logic; (3) axe-core pass in CI; (4) a 375 px and 768 px visual smoke.

### Analytics & observability
None exists (no error tracking, no events). Recommended minimal taxonomy: `signup_completed`, `chart_saved` (auto|manual), `save_failed` (reason), `chart_opened_from_library`, `pdf_downloaded` (style), `voice_autofill_used`, plus Sentry (or similar) wired to the new ErrorBoundary. Keep patient fields out of event payloads (PII hygiene: patient/owner names never leave the practice's own Supabase project today — preserve that).

---

## 5. User-journey reviews

**Sign up.** Landing → overlay → 4 fields → account. Friction fixed: submit label, password rule, dialog name, placeholder contrast. Remaining: visible labels, confirm-email logo drop, no show-password toggle. Verdict: good after one more polish pass.

**Daily charting (the money journey).** Strongest in the product: numbered rail, spreadsheet keys, Missing sync, species guard, sticky context. Now also: crash-safe (boundary), save failures visible + retryable + auto-retried on reconnect, no silent expiry, keyboard-complete diagrams. Remaining friction: tablet grid density (768 px), re-auth eject.

**Retrieve an old chart.** Search autofocuses, rows open fast, delete confirms by name, dirty working chart is now guarded. Remaining: 500-cap (disclosed, not solved), recency-only sort, Back exits the app.

**PDF export.** Was already the most polished flow (style picker, generating state, disabled download, smart filename); now lazy-loaded with an actionable failure message. Round-trip (load chart PDF) validates before persisting.

**Settings.** Escape + focus now correct. Remaining: three commit models in one modal, unconfirmed Remove logo (recoverable; low).

---

## 6. Design-system recommendations

Tokens (already largely in place — codify, don't rebuild): keep `--primary #0C6B63 / --ink #1B2733 / --danger #B23C2A / --text-muted #55677A` + surface/tint pairs; document the two type families (Inter; Geist Mono for codes only) and a 4-step radius scale (4/8/10/999). Add the missing tokens instead of literals: `--focus-ring`, `--touch-target: 44px`, breakpoint variables (600/768/900/1100), and a motion pair (`--ease-quick 0.15s`, `--ease-reveal 0.25s`) so reduced-motion overrides stay one selector. Standard component states to define once: button (primary/quiet/danger × hover/focus/disabled/busy), chip (info/success/danger — the save chip is the reference), modal (one shared shell: overlay, Escape, focus trap, `aria-labelledby`), menu (disclosure semantics, not ARIA menu). Accessibility floor per component: named, keyboard-operable, 24 px minimum target, AA contrast in every state.

## 7. Architecture recommendations

Keep the hook layering — it's right. Changes worth making, in order: (1) **hash router** for `#/chart`, `#/library`, `#/chart/:id` — fixes Back, deep links, and refresh-in-library in one move; (2) **session/profile context** provider under `App` (single `getSession()` subscription; unblocks re-auth-in-place); (3) **module-scope grid editor** + drop the `key={containerWidth}` remount; (4) **RDG migration plan** (stable v7 or plain table); (5) a `version` field in `ChartSnapshot` now, so the next schema change has something to key on; (6) testing boundary: pure logic in `utils/` + hook-level tests, Playwright for journeys — the codebase already leans this way.

---

## 8. Prioritized remediation roadmap

### Immediate — before production  ✅ ALL EXECUTED THIS PASS
Error boundary · session-expiry save errors surfaced · sign-out flush + storage sweep · dirty-guard on open/sign-out · retry UX + reconnect retry + beforeunload guard · snapshot validation (crash-loop) · tooth-diagram keyboard/SR access · contrast fixes · live-region fix · modal Escape/focus · code splitting · copy fixes · cap disclosure · reduced-motion hero · favicon/PWA icons de-React'd.
*Validation: `CI=true` build clean; 15/15 unit tests; E2E smoke (signin → edit → Saved chip lifecycle → library delete → sign-out sweep → PDF preview) all green.*

### Near term — next 1-2 sprints
| Item | Owner | Depends on | Effort | Impact | Validate |
|---|---|---|---|---|---|
| Re-auth in place (keep chart mounted on expiry) | FE | session context | M | Highest remaining UX risk | expire token mid-edit |
| Grid tablet pass: scroll breakpoint →900 px, `pointer: coarse` row height | FE+design | — | S | Core persona | iPad portrait manual |
| Server-side library search + date filter + pagination | FE+SQL | — | M | Scale correctness | seed 600 rows |
| Hash routing | FE | — | S/M | Back/deep links | gesture-back on tablet |
| Shared modal shell w/ focus trap | FE | — | S | Closes a11y High #2 | axe + keyboard walk |
| Visible form labels in auth | FE | — | S | WCAG 3.3.2 | SR pass |

### Medium term
RDG migration (or plain table) · module-scope editor + remount fix · comment-drag local buffering · serialization memoization · Sentry + minimal event taxonomy · Playwright journey suite in CI · `vercel.json` security headers · snapshot `version` field · session/profile context · two-tab guard.

### Later
Skip link · heading semantics · menu/tab role simplification · hero pause control · BYOK key sign-out prompt · Practice-settings commit-model cleanup · repo-private/hosting move · Stripe (deferred by owner) · custom SMTP.

## 9. Quick wins already banked
Everything in the Immediate tier was ≤1 day each; the remaining <1-day items are: visible auth labels, `vercel.json` headers, skip link, `top: calc(var(--topbar-height))` for the rail, two-tab `storage` guard, "No patient" copy.

## 10. Manual test checklist
- [ ] Sign in on a phone (≤600 px): kill Wi-Fi, type — "Not saved — retry" button appears; restore Wi-Fi — chip resolves without tapping
- [ ] Type a patient name, within 1 s open a library chart — reopen the first chart, last keystroke present
- [ ] Autosave OFF → edit → open library chart → confirm dialog appears; cancel keeps your chart
- [ ] Sign out mid-edit → chart saved; sign in as another account → no residue of previous patient anywhere
- [ ] Keyboard only: Tab to Procedure diagram, Enter on a tooth → red X; Enter again → cleared; grid Tab/Enter walk still works
- [ ] Load a chart PDF from an older version → opens or fails with the "damaged" message; never a white screen (also try a random PDF)
- [ ] OS reduced-motion on → landing hero shows the static grid scene, not an empty box
- [ ] iPad portrait: edit every grid column with touch; check header truncation (known open item)
- [ ] Preview PDF on first click after hard reload (lazy chunk) — modal + document render
- [ ] Force a render crash (dev): boundary screen appears, reload restores the chart
- [ ] Tab icon shows the teal tooth (no white box, no React logo) in light and dark browser themes

---

## Rating: **Ready with known risks**

The critical tier — crash recovery, data-loss windows, silent save failures, shared-machine privacy, keyboard access to extractions, and the bundle — was fixed and verified in this pass, so nothing remaining blocks a small-practice production rollout. The known risks are bounded and characterized: mid-procedure session expiry still ejects to the landing page (visible now, but disruptive), the chart library will degrade past 500 charts (disclosed in-UI), and tablet grid ergonomics need a device pass. The dependency risk (react-data-grid beta) is real but stable in current behavior. Ship, monitor the error boundary, and take the Near-term table in order.
