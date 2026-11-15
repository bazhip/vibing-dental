# ezyVet extension, phase 2 (side panel): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ToothOps side panel in the Chrome extension. The vet signs in, picks a chart (the one matching the open ezyVet consult is pinned at the top), and sends its record note and chart picture to ezyVet. No ToothOps tab is needed.

**Architecture:**
- The side panel is a React page in the extension (`sidepanel.html` → `src/extension/sidepanel/main.tsx`).
- It reuses the app's Supabase client. Extension pages have their own `localStorage`, so the session persists with no custom storage adapter.
- It reuses the phase 1 pieces: the mapping and send items, the patient check, the chart picture, and the dialog's mapping rows and results list, which are extracted into shared components.
- It talks to the background worker with internal `chrome.runtime.sendMessage`, handled by a new `onMessage` listener that accepts only the extension's own pages. The external listener is unchanged.
- The chart picture comes from read-only `ToothDiagram`s mounted off-screen, the way `AdminChartViewer.tsx` already renders a saved chart.

**Tech Stack:** TypeScript, React 19, Vite 8 (third entry in `scripts/build-extension.mjs`), Supabase JS, i18next, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-15-ezyvet-extension-design.md` §8 (side panel), plus everything phase 1 relies on (§2–§7, §10). Phase 1's plan, `docs/superpowers/plans/2026-11-15-ezyvet-extension-phase1.md`, shows the established names.

## Global Constraints

- **AGENTS.md applies in full.**
  - Every user-facing string goes through `t()`. Add new keys to `src/locales/en/pims.json` and write fr/de/it/es in the same change, then `npm run i18n:translate -- --rehash`.
  - Pseudo-locale test for every new screen.
  - `LocalizedError` for user-visible errors.
  - `npm test` and `npm run build` pass before every commit.
- **Manifest permissions become exactly** `["scripting", "sidePanel", "identity"]`. `host_permissions` stay `["https://*.ezyvet.com/*"]`. The store build keeps only `https://toothops.app/*` in `externally_connectable`, as in phase 1.
- **No ezyVet page text leaves the browser.** The side panel shows the patient name and field titles locally only.
- **The side panel never edits charts.** It is read-only, and the only write is `mark-pims-sent`.
- **Same safety rules as phase 1:**
  - send only to a writable consult with a readable record id;
  - re-check the consult and patient before every item (the background already does this);
  - confirm on a patient mismatch;
  - confirm before sending again.
- **Sign-in:**
  - Email and password via `supabase.auth.signInWithPassword`.
  - Google and Apple via `chrome.identity.launchWebAuthFlow`, using `signInWithOAuth({ provider, options: { redirectTo: chrome.identity.getRedirectURL('auth'), skipBrowserRedirect: true } })`, then `exchangeCodeForSession(code)` (PKCE).
  - Owner step: add `https://<extension-id>.chromiumapp.org/auth` for the dev id and the store id to Supabase Auth → URL configuration → Redirect URLs.
- **Language:** the panel uses the signed-in profile's language setting, falling back to the browser language, then `en`.

## Review Focus

1. **The vet switches ezyVet consult while the panel shows a pinned "matches this consult" chart.** The pin must update on the next inspect. Sending re-inspects, so it never sends against a stale match. Owner: Task 4 (`re-inspects on tab change and before send`).
2. **The session expires or the vet signs out in the ToothOps web app.** The extension has a separate session, so the panel must handle a refresh failure by returning to sign-in, not with a broken list. Owner: Task 2 (`expired session returns to sign-in`).
3. **The chart has no saved diagrams or no record note content.** Show the note rows that exist and omit the picture row without failing. Owner: Task 3 (`chart without diagrams sends text only`).
4. **The OAuth window is closed by the user.** `launchWebAuthFlow` rejects; show nothing alarming, stay on sign-in. Owner: Task 2 (`cancelled OAuth stays on sign-in`).
5. **A very long chart list or a slow network.** The list pages (20 at a time, plus search) and shows a loading state; search is debounced. Owner: Task 4 (`search debounced, paged`).

---

### Task 1: Shared send flow and components (refactor, no behaviour change)

**Files:**
- Create:
  - `src/components/pims/MappingRows.tsx` (the "Where it goes" rows)
  - `src/components/pims/SendResults.tsx` (the results list and diagnostic link)
  - `src/hooks/usePimsSend.ts` (the send state machine, extracted from `SendToEzyvetDialog`)
- Modify: `src/components/SendToEzyvetDialog.tsx`, so it uses them.
- Test: the existing `SendToEzyvetDialog.test.tsx` and pims i18n tests must pass unchanged. Add `src/hooks/usePimsSend.test.ts` for the transport injection.

**Interfaces:**
- `type PimsTransport = { ping(): Promise<PingResult | null>; inspect(): Promise<InspectResult>; send(req): Promise<SendResult>; diagnose(tabId?): Promise<DiagnoseResult | null> }`
- `extensionBridge` satisfies it. Export `externalTransport` from `src/utils/pims/extensionBridge.ts`.
- `usePimsSend(opts: { transport: PimsTransport; note: RecordNote; stored: StoredRecordNote | null; chartSnapshotPicture: () => Promise<string | null>; chartId: string | null; patientName: string; sentAt: string | null; onSent(at: string): void })` returns the state and actions the dialog uses today (phase, rows, edits, doSend, retry, copyDiagnostic, confirmations).
- The picture becomes a callback, so the side panel can supply its own renderer.

- [ ] **Step 1:** Add `usePimsSend.test.ts`. A fake transport is called for ping, then inspect, then send. The `chartSnapshotPicture` callback is used only when the chart row targets a field.
- [ ] **Step 2:** Run it: FAIL.
- [ ] **Step 3:** Extract the code. The dialog keeps its markup and behaviour.
- [ ] **Step 4:** Run `npx vitest run src/components/SendToEzyvetDialog.test.tsx src/components/pims.i18n.test.tsx src/hooks/usePimsSend.test.ts`: all PASS with the existing tests unmodified. Then `npm test` and `npm run build`.
- [ ] **Step 5:** Commit `refactor(pims): shared send flow and components`.

### Task 2: Side panel shell, sign-in and build

**Files:**
- Create:
  - `src/extension/sidepanel/sidepanel.html`, `src/extension/sidepanel/main.tsx` (i18n init, React root)
  - `src/extension/sidepanel/SidePanelApp.tsx` (signed-out vs signed-in)
  - `src/extension/sidepanel/SignIn.tsx`
  - `src/extension/sidepanel/oauth.ts` (`signInWithProvider(provider: 'google' | 'apple'): Promise<void>`)
  - `src/extension/sidepanel/internalTransport.ts` (`PimsTransport` over `chrome.runtime.sendMessage` without an extension id)
- Modify:
  - `src/extension/background.ts`: add `chrome.runtime.onMessage`, which accepts only `sender.id === chrome.runtime.id` with a page URL under `chrome-extension://<id>/`, routes to the same `handleExternal` logic, and calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
  - `src/extension/manifest.json`: the permissions in Global Constraints; `"side_panel": { "default_path": "sidepanel.html" }`; `"action": { "default_title": "__MSG_extName__", "default_icon": {…} }`.
  - `scripts/build-extension.mjs`: a third entry. Build the side panel as an ES module app with `sidepanel.html` and the Vite env (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from `.env`). Keep the store-build localhost stripping.
  - `src/locales/*/pims.json`: keys for `panel.*`.
- Test:
  - `src/extension/sidepanel/SignIn.test.tsx`
  - `src/extension/sidepanel/oauth.test.ts`
  - background: `internal messages accepted only from own extension pages`
  - `src/extension/sidepanel/sidepanel.i18n.test.tsx` (pseudo-locale)

**Behaviour:**
- **Sign-in form:** email, password, Sign in, plus Google and Apple buttons.
- **Links:** "Create an account" and "Forgot password?" open `https://toothops.app/` in a new tab (`chrome.tabs.create`).
- **Errors:** shown via `friendlyError`.
- **Signed in:** a header shows the account email and a Sign out button.
- **Expired session:** a `TOKEN_REFRESHED` failure or `SIGNED_OUT` event returns to sign-in.
- **No cloud configured** (no Supabase env): the panel shows "This build isn't connected to ToothOps".

- [ ] **Step 1: Write failing tests.**
  - Password sign-in calls `signInWithPassword` and shows the signed-in header.
  - A bad password shows a translated error.
  - `expired session returns to sign-in`.
  - `cancelled OAuth stays on sign-in`, with no error toast for `"The user did not approve access."` / user-cancel.
  - The OAuth success path calls `exchangeCodeForSession` with the `code` from the returned URL.
  - The internal listener rejects a sender with a different `id` or a non-extension URL.
  - Pseudo-locale: signed-out and signed-in shells have no untranslated text.
- [ ] **Step 2:** Run them: FAIL.
- [ ] **Step 3:** Implement. Add the `pims` keys in all five languages and rehash.
- [ ] **Step 4:** Run the tests: PASS. Then `npm test`, `npm run build`, and `npm run build:extension`. `build-extension/` must contain `sidepanel.html` and its assets, and the manifest must have `side_panel`, `action` and the exact permissions. Then `npm run package:extension`: the zip has no `localhost` or `key`.
- [ ] **Step 5:** Commit `feat(extension): side panel shell and sign-in`.

### Task 3: Chart loading and off-screen chart picture

**Files:**
- Create:
  - `src/utils/chartQueries.ts`: extract the list query from `useCloudSync.listCharts`, plus `loadChartSnapshot(id): Promise<{ snapshot: ChartSnapshot; pimsSentAt: string | null }>` (selects `data, pims_sent_at`). `useCloudSync` calls the extracted list function, with no behaviour change.
  - `src/extension/sidepanel/OffscreenChartPicture.tsx`: mounts two read-only `ToothDiagram`s off-screen from the snapshot (exactly the props `AdminChartViewer.tsx` uses, including its effective post-op marks). It exposes `render(): Promise<string | null>`, which collects `getSvgElement()` and `getCommentExports()` from both handles and calls `renderChartPicture`. It returns null when either SVG is missing.
- Modify: `src/hooks/useCloudSync.ts` (use `chartQueries`).
- Test: `src/utils/chartQueries.test.ts`, `src/extension/sidepanel/OffscreenChartPicture.test.tsx`. Existing `useCloudSync` tests must stay green.

- [ ] **Step 1: Write failing tests.**
  - The list query applies search over the same four columns, the order and the paging, the same as before.
  - `loadChartSnapshot` returns `data` and `pims_sent_at`.
  - `OffscreenChartPicture.render` calls `renderChartPicture` with both SVGs and comment exports. `renderChartPicture` is mocked.
  - `chart without diagrams sends text only`: render returns null, and the send flow then omits the picture row.
- [ ] **Step 2:** Run them: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, then `npm test` and `npm run build`. Everything passes.
- [ ] **Step 5:** Commit `feat(pims): chart queries and off-screen chart picture`.

### Task 4: Chart list, consult match and send in the panel

**Files:**
- Create:
  - `src/extension/sidepanel/ChartList.tsx`: search (debounced 300 ms), 20 per page with "Load more", newest first. A "Matches this consult" row is pinned when the current inspect shows a writable consult whose `patientName` `patientsMatch`es a listed chart's patient name. If more than one matches, pin the most recent one and show a count.
  - `src/extension/sidepanel/ChartSend.tsx`: the picked chart's record note, read-only. Use the stored note if present, otherwise `buildRecordNote` in the panel language. Below it, `MappingRows`, then Send, then `SendResults`, all via `usePimsSend` with `internalTransport`, `OffscreenChartPicture.render`, `chartId`, `patientName` and `sentAt = pimsSentAt`.
- Modify:
  - `SidePanelApp.tsx`: signed in shows `ChartList`, and picking a chart shows `ChartSend` with a Back button.
  - It re-inspects when the active tab changes (`chrome.tabs.onActivated`, and `onUpdated` with status `complete` for ezyVet tabs), via internal messages.
  - `src/locales/*/pims.json`.
- Test: `src/extension/sidepanel/ChartList.test.tsx`, `src/extension/sidepanel/ChartSend.test.tsx`, plus pseudo-locale cases in `sidepanel.i18n.test.tsx` (list, pinned match, chart view, results).

- [ ] **Step 1: Write failing tests.**
  - `search debounced, paged`: typing fires one query after 300 ms, and "Load more" requests offset 20.
  - The pinned match appears only for a writable consult with a matching name. No pin is shown when the patient name is null.
  - `re-inspects on tab change and before send`: a tab-activated event triggers inspect, and Send triggers the usual re-inspect inside `usePimsSend`.
  - ChartSend sends the stored note when present.
  - A mismatch confirmation names both patients.
  - The already-sent confirmation uses `pims_sent_at`.
  - Pseudo-locale: no untranslated text.
- [ ] **Step 2:** Run them: FAIL.
- [ ] **Step 3:** Implement. Add keys in all five languages and rehash.
- [ ] **Step 4:** Run the tests, then `npm test`, `npm run build`, `npm run build:extension` and `npm run package:extension` (with the zip checks).
- [ ] **Step 5:** Commit `feat(extension): side panel chart list and send`.

### Task 5: Docs and checklist

**Files:**
- Modify:
  - `src/extension/README.md`: the side panel section; the Supabase redirect URL owner step (dev and store ids); a real-ezyVet checklist for the panel covering the pinned match, sending from the panel, sign-out and an expired session.
  - `docs/chrome-web-store-listing.md`: justifications for the new `sidePanel` and `identity` permissions; an updated description and screenshot list.
  - Spec §8: note the decisions below (`localStorage` session, `identity` OAuth, internal messaging).
- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** `npm test`, `npm run build`.
- [ ] **Step 3:** Commit `docs(extension): side panel setup, permissions and checklist`.
