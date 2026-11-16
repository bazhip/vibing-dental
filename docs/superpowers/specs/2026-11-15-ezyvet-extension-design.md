# ToothOps Chrome extension: send the record note to ezyVet

## Why

The record-note project (2026-11-14) gave vets a note they can copy and paste into their practice management system (PIMS). That spec listed "browser-extension write-back to a PIMS" as a later project. This is that project.

ScribbleVet's Chrome extension writes notes straight into ezyVet. We studied its shipped code (v1.31.3) to learn how. This design copies the **approach** and targets **the same ezyVet fields**. It shares no code with it: everything here is written from scratch.

Success means: a vet finishes a chart in ToothOps, presses **Send to ezyVet**, and the note and chart picture land in the right fields of the open ezyVet consult, without copying and pasting.

## How ScribbleVet does it (reference)

There is no ezyVet API involved. The extension runs code inside the vet's own logged-in ezyVet tab (`chrome.scripting.executeScript` with `world: "MAIN"`, so it can reach the page's own JavaScript objects) and fills the page the way a person would.

- **Writable check.** It only writes when the right pane's active record is a **Consult** with a real id and the **Medical** sub-tab is open:
  - `#rightpane .rtabdetails.active[id^="rtab"]` gives the view id;
  - `#rform<id>` has a class like `Consult123Form`;
  - the active sub-tab is `subTab<id>-Medical`.

  Locked consults (`.theTabsToolbar div[title="Locked"]`) and the Combined view (`[data-testid="GotoStandardView"]`) are detected separately. Other record types (Patient, etc.) are never written to.
- **Fields it finds** on the active consult's Medical tab:

  | Kind | Fields | How it writes | Image? |
  |---|---|---|---|
  | Note sections | History, Physical Exam, Assessment, Plan (any `.sectionContent` with an `h2` and a Lexical editor or an "Add Note" button) | Uses an empty editor or clicks **Add Note**, then inserts a paragraph through the element's `__lexicalEditor`. It then dispatches a `pointerdown` outside the editor, because ezyVet saves Lexical notes on click-outside. | No |
  | Popup sections | Vet Communication, Client Communication (`.inputSectionTitle` with `.addButton.clickable`; `data-testid` `AddVetCommunication` / `AddClientCommunication`) | Opens the popup, fills the `textarea`, clicks `[id^="saveRecord"]`, and waits for `[id^="formbox"]` to hide | No |
  | Client Communication → Email | The Email contact method in that popup | Picks the client's `.preferredMethod` only (never another address) and status Pending, then writes the HugeRTE editor (`window.hugerte.activeEditor`, `setContent`, then `fire('input')`, `fire('change')`, `save()`, `setDirty(true)`) and saves | Yes |
  | Client Communication → In Person | The In Person contact method | `textarea[name="communicationdata_content"]`, then `[data-testid="Add"]` | No |
  | Discharge Summary | `[data-testid="AddDischargeSummary"]` | Opens it, cancels any template chooser (`[data-testid="Cancel"]`), writes HugeRTE, then clicks `[data-testid^="Save&Close"]` and waits for it to hide | Yes |

- **Name matching.** A requested section name matches a page field in this order: exact match, then synonym (Subjective↔History; Objective↔Physical Exam↔Exam), then singular/plural; the same again on the last part of compound names ("A > B"); and finally the parent part, only when exactly one field matches.
- **Template guard.** While writing, it wraps ezyVet's `jaxmanager.request` and answers `templateFillData.php` itself, so the practice's template doesn't fill in over the text it just wrote. We copy this idea, more tightly scoped (§2a).
- **Extras we are not copying:**
  - Session recording (rrweb) and Sentry logging on the ezyVet page.
  - The `debugger` permission, which isn't used for ezyVet.

## Goals

1. **Send to ezyVet** from the web app's Documents → Record note tab (phase 1).
2. **Sensible default mapping** from ToothOps note sections to ezyVet fields, which the vet can change. Their mapping is remembered.
3. **The chart picture** can be sent to an ezyVet field that accepts images.
4. **A ToothOps side panel** in the extension that does the same without the ToothOps tab open, and suggests the chart that matches the open consult (phase 2).
5. **Never write to the wrong record.** Only an open, unlocked Consult on the Medical tab, with a patient check.

## Non-goals

- Other PIMS (Vetspire, Cornerstone, etc.). The writer is structured so one can be added later, but only ezyVet is built.
- An ezyVet API / partner integration.
- Pulling ezyVet appointments into ToothOps to create charts.
- Sending the owner report PDF through ezyVet. ToothOps already emails it.
- Firefox and Safari. The iOS app has no extensions; the button is simply absent there.

## Anti-goals (a failure even if it works)

- **Writing into the wrong patient's record or the wrong record type.**
- **Overwriting or deleting anything already in ezyVet.** We only add a new note entry or document.
- **Reading or sending ezyVet page data anywhere.** Phase 1 sends nothing to any server. Phase 2 talks only to the ToothOps Supabase project, and never sends ezyVet page content there. No session recording, no page logging.
- **Interfering with ezyVet's requests beyond the one template reply** described in §2a, or leaving that change in place after a write finishes.
- **Sending something that isn't the note the vet sees.** The text sent is exactly what the Record note tab shows: the stored edited note, or the generated one.

## Constraints

- **AGENTS.md applies in full.**
  - Every string goes through `t()`, with fr/de/it/es written in the same change.
  - Pseudo-locale tests for every new screen.
  - Errors are `LocalizedError` or mapped codes.
  - `npm test` and `npm run build` must pass.
- **Extension code lives under `src/extension/`**, so the existing lint scope, i18n checks and pseudo-coverage test cover it with no new tooling.
- **ezyVet's page structure changes without notice.** All selectors live in one module with a comment per selector, and every failure returns a specific code naming the step that failed, so breakage is quick to diagnose.
- **Chrome Manifest V3.**

## Approaches considered

- **A. Side panel that signs in to ToothOps** (ScribbleVet's model). It works without a ToothOps tab, but needs login, chart loading, note building and picture rendering inside the extension.
- **B. Send from the ToothOps web app.** The web app passes the note to the extension, and the extension writes it into ezyVet. The extension stays small with no login; the cost is that both tabs must be open.
- **C. Embed the web app in the side panel.** Rejected: Chrome isolates storage in extension pages, which fights the app's login.

**Chosen by the owner: both A and B, B first.** The ezyVet writer is shared. Phase 1 is B. Phase 2 adds A on top of the same writer, importing the existing note builder, translations and Supabase client from this repo, so it isn't a rebuild.

## Design

### 1. Repository layout and build

- `src/extension/`
  - `manifest.json` (template)
  - `background.ts`: service worker
  - `ezyvet/page.ts`: the script injected into ezyVet, which defines the page functions
  - `ezyvet/selectors.ts`
  - `ezyvet/matchField.ts`
  - `protocol.ts`: message types shared with the web app
  - `sidepanel/`: phase 2
- `vite.extension.config.ts` builds to `build-extension/`. Script: `npm run build:extension`. It is not part of `npm run build` or the Vercel deploy, but `npm test` covers its code.
- **Fixed extension id.** The manifest carries a `key` so the id is the same in development and the Web Store; the web app needs to know it (`VITE_EXTENSION_ID`, defaulting to the store id).
- **Manifest:**
  - `permissions: ["scripting"]`, plus `"sidePanel"` in phase 2. *(`storage` dropped: nothing uses it.)*
  - `host_permissions: ["https://*.ezyvet.com/*"]`. In phase 2, add the Supabase project URL if needed.
  - `externally_connectable.matches: ["https://toothops.app/*", "http://localhost:5173/*"]` in the dev build. The store build (`npm run package:extension`, `VITE_PIMS_STORE_BUILD=1`) ships `https://toothops.app/*` only, in the manifest and in the background's allowed origins.
  - No `debugger`, `cookies`, `tabs` or `nativeMessaging`. `scripting` with host permissions is enough to find and inject into ezyVet tabs via `chrome.tabs.query({ url })`.
- **Manifest name and description** come from Chrome's `_locales/<lng>/messages.json`, generated at extension build from `src/locales/<lng>/pims.json` (`extension.name`, `extension.description`). *(Builder call.)*

### 2. The ezyVet page script (`ezyvet/page.ts`)

Injected with `executeScript({ world: "MAIN", files })`. It installs `window.__toothopsEzyvet = { version, status, listFields, write }` once, and re-injection with the same version is a no-op.

- **`status()`** returns `{ state, patientName }`:
  - `state` is `writable`, `notConsult`, `notMedicalTab`, `locked` or `combined`.
  - `patientName` is read from the consult header. The selector is unknown: the builder finds it on a real page. If it isn't found, `patientName` is `null`.
- **`listFields()`** returns `{ title, kind: 'note' | 'popup' | 'email' | 'inPerson' | 'dischargeSummary', acceptsImage }[]` for the active consult only. It uses the same field discovery as the reference table above, de-duplicated by title (the visible one wins). "Client Communication → Email" and "Client Communication → In Person" are listed as their own entries.
- **`write({ fieldTitle, text?, html?, pngDataUrl? })`** writes one item and returns `{ ok: true }` or `{ ok: false, code }`. It re-checks `status()` first and refuses unless `writable`.
  - **`note` fields:**
    - Add a new entry: use an empty editor if there is one, otherwise click **Add Note** and wait for a new empty editor.
    - Insert through the Lexical editor instance, one paragraph per line.
    - Then trigger ezyVet's save the way the reference does: `pointerdown` inside, then `pointerdown` outside.
    - Never clear existing entries.
    - If the editor instance isn't reachable, fail with `editor_not_found`. Don't fall back to setting `innerHTML`, which ezyVet may not save. *(Builder call; the reference does fall back.)*
  - **`popup` / `inPerson`:** fill the textarea, dispatch `input` and `change`, save, and wait for the popup to close.
  - **`email`:** the client's preferred email only. If there is none, close the popup and fail with `no_preferred_email`. Status Pending, then HugeRTE `html` or the image.
  - **`dischargeSummary`:** a new document via its add button. Cancel any template chooser. Write HugeRTE with `html` or the image, then Save & Close and confirm it closed.
  - **Images:** only PNG data URLs (validate the prefix and base64), and only into fields with `acceptsImage`.
- **Failure codes:**
  - `not_writable`, `field_not_found`, `editor_not_found`, `popup_not_found`, `popup_not_closed`
  - `save_button_not_found`, `save_not_confirmed`
  - `no_preferred_email`, `image_not_accepted`, `invalid_image`

  Each maps to a `pims:errors.<code>` key.

### 2a. Template guard

ezyVet can fill a practice template into a section or document when it opens, replacing what we just wrote. ScribbleVet prevents this by intercepting the template request; the owner chose to do the same rather than ask vets to use blank templates.

- `write()` installs the guard at the start and removes it in a `finally`. Outside a write, ezyVet's `jaxmanager.request` is untouched.
- While installed, only calls whose URL contains `get/templateFillData.php` are intercepted. They get the same empty success ezyVet's own code expects: call the page's `response()` handler and the `callback`, hide `#coverblock`, and clear the `serverRendering` flag, as the reference does. Every other call goes to the original function unchanged.
- If `jaxmanager` doesn't exist (ezyVet changed), the write continues without the guard and the result says so (`guardSkipped: true`), so the diagnostic report (§10) shows it.
- The exact reply shape is copied from the reference and **unverified**. It is first on the real-ezyVet checklist.

### 3. Field matching (`ezyvet/matchField.ts`)

A saved mapping stores ezyVet field titles as text. At send time, each title is resolved against `listFields()`. The matching order and synonym groups follow the reference behaviour described above, written fresh. It is a pure function with unit tests. An unresolved title is reported as `field_not_found` with the title, and the rest of the send continues.

### 4. Background worker and protocol (`background.ts`, `protocol.ts`)

`chrome.runtime.onMessageExternal` handles these messages. It rejects any sender whose `origin` isn't in the allow-list.

- **`ping`** → `{ version }`. The web app uses it to detect the extension.
- **`inspect`**: find the ezyVet tab, inject, and return `{ tab: { id, title } | null, status, fields }`.
  - **Which tab:** among `https://*.ezyvet.com/*` tabs, prefer the active tab of the last-focused window; otherwise the most recently accessed (`lastAccessed`).
  - **No tab:** `tab: null`.
  - **More than one candidate:** the response says so, and the web app shows which tab (by title) it will use. *(Builder call.)*
- **`send`** `{ tabId, expectedPatient, confirmedEzyvetPatient, expectedConsult, items[] }`: re-inspect the tab, then compare the consult and patient (§6). Then write the items **one at a time in order**, focusing the ezyVet tab first (ezyVet's save hooks need a real page). Returns per-item results.

`protocol.ts` exports the message and result types. The web app imports them, so both sides stay in step.

### 5. Default mapping and the mapping editor

ToothOps sources: the eight note sections, by stable key, plus `chart` (the picture). This needs a small change: `RecordNoteSection` gains `key: keyof typeof HEADING_KEYS`, which the builder already has, so mapping doesn't depend on translated headings.

Defaults:

| ToothOps | ezyVet field |
|---|---|
| Header | Don't send (ezyVet's consult already shows patient, date and vet) |
| Anesthesia | Plan |
| Oral exam | Physical Exam |
| Findings by tooth | Physical Exam |
| Procedures | Plan |
| Radiographic findings | Physical Exam |
| Treatment report | Plan |
| Recheck | Plan |
| Chart picture | Discharge Summary |

History and Assessment get nothing by default. The header default and sending the chart to Discharge Summary are *my calls*: Discharge Summary is the only consult field that takes an image.

- **Targets offered:** every field `listFields()` finds **except Client Communication → Email**, which would put the vet-language clinical note in front of the owner (ToothOps already emails the owner report). Vet Communication and Client Communication → In Person are offered, but nothing maps to them by default. *(My call.)*
- **Combining sections.** Sections mapped to the same field are combined into one write, in note order, each under its heading (plain text: heading line, then lines; HTML: as `recordNoteHtml`).
- **Text and picture together.** If the picture maps to the same field as some text, it is one write (one document), with the image after the text. `write()` therefore takes `{ fieldTitle, text?, html?, pngDataUrl? }`, with at least one present. *(My call.)*
- **Storage.** The vet's mapping is saved to their account as `profiles.pims_field_map jsonb` (migration, nullable): `{ ezyvet: { [sourceKey]: string | null } }`, where `null` means "Don't send". A missing key falls back to the default. *(My call: per vet, not per practice, so each vet can arrange it their own way. It follows them across computers.)*
- **Editor.** Inside the Send dialog (§7), a "Where it goes" list: one row per source that has content, each with a dropdown.
  - Options are the fields `inspect` found, plus "Don't send". The picture row only offers fields that accept images.
  - A saved title that isn't on this page shows as "Not on this page", and the row isn't sent.
  - Changes save to the profile when Send is pressed.
  - "Reset to defaults" restores the table above.

### 6. Patient check

The dialog compares the chart's `patientName` with the ezyVet `patientName`. Both are normalised: case-folded, accents removed, punctuation and whitespace collapsed. They match when every word of the shorter name is a whole word of the longer one, because ezyVet may add the owner surname ("Bella" matches "Bella Smith"; "Max" does not match "Maxine").

Before each item, the background re-checks against what inspect saw: the consult id (`status().consult`: view id from `rtab<N>details` and record id from `Consult<N>Form` or `data-record-id`; a consult with neither is not writable) must be the same, and when both the confirmed and the current ezyVet names are known they must be equal once normalised. Otherwise the rest is refused with `patient_changed`. The consult id carries the check when the patient name can't be read.

- On a mismatch, or when the ezyVet name can't be read, the web app shows a confirmation naming both ("ToothOps chart: Bella · ezyVet consult: Max"). Sending needs an explicit **Send anyway**.
- A chart with no patient name always asks.
- *(As built, phase 2.)* The side panel uses a stricter rule for its pin and its confirmation, because it proposes the chart itself: the names must be equal once normalised, or the chart's patient name plus the owner's surname must have exactly the ezyVet name's words (`patientsMatchStrict`). The web dialog keeps the whole-word rule above.

### 7. Phase 1: web app

`RecordNotePanel` gets a **Send to ezyVet** button next to Copy. It is shown only in a desktop Chromium browser (`window.chrome?.runtime`) and never in the iOS app (`Capacitor.isNativePlatform()`).

- **Not installed** (ping times out after ~500 ms): the button opens a short explainer with an install link (the Web Store URL, to be filled in once published).
- **Installed:** opens the **Send to ezyVet** dialog, which calls `inspect`:
  - **No ezyVet tab:** "Open the consult in ezyVet, then try again", with a Retry button.
  - **Not writable:** say why ("Open the Medical tab of the consult", "This consult is locked", "Switch to Standard view").
  - **Writable:** show the target ("ezyVet: Max — <tab title>"), the mapping editor and a **Send** button.
- **What is sent:**
  - **No stored note:** the generated sections, mapped by key.
  - **Stored (edited) note:** split it back into sections on lines that exactly equal a generated heading in capitals (in `stored.lng`), and map by the heading's key.
    - If the split doesn't recover every heading still present in the generated note, don't guess. The dialog says the note was edited, and offers one row: "Edited note → [field]" (default Plan).
    - *(Builder call.)*
  - **The chart picture:** the pre-op and post-op diagrams rendered with `diagramSvgToPng` and stacked into one PNG, with comment cards as in the chart PDF. *(Builder call: one stacked image, because ezyVet image fields take one.)*
  - The SVGs are not stored on the chart: they come from the mounted diagrams' `getSvgElement()` handles, the same ones the chart PDF uses (`EntryGrid.tsx` ~l.899). The builder threads these (or a "render chart picture" callback) into the dialog.
  - The image logic lives in one shared function, `renderChartPicture(preSvg, postSvg, snapshot)`, used by both phases.
- **Results:** a list with ✓ or the failure message for each field.
  - If any write succeeded and the chart is saved to the cloud, record it in `charts.pims_sent_at` (migration, nullable timestamptz). The dialog then shows "Sent to ezyVet on …".
  - **Recording must not look like a chart edit.** `charts_touch_updated_at` bumps `updated_at` on every update, and `useCloudSync` compares `updated_at` to detect someone else's change. So:
    - Use a small edge function, `mark-pims-sent { chartId }`. It allows the chart's creator or a member of its practice (the same check as `send-owner-report`; practice-chart access is enforced in edge functions, not row-level security), sets `pims_sent_at = now()` with the service role, and nothing else.
    - Change `touch_updated_at` for `charts` so an update that changes only `pims_sent_at` (or `owner_report_sent_at`) keeps `updated_at`.
    - *(My call. It also fixes the same latent issue for `owner_report_sent_at`.)*
  - Sending again asks for confirmation, because it adds a second copy.
- **Locked ToothOps charts** can be sent (it's read-only output, like Copy).
- **New component:** `src/components/SendToEzyvetDialog.tsx`, with a `*.i18n.test.tsx`.

### 8. Phase 2: side panel

- **Opening.** `chrome.sidePanel` opens from the toolbar icon. The side panel is a small React app (`src/extension/sidepanel/`) using the repo's i18n setup, in the language from the vet's profile.
- **Login.** *(As built.)* The session lives in the extension page's own `localStorage` through a PKCE-configured Supabase client, so there is no `chrome.storage` adapter and no `storage` permission. Sign-in methods: password, Google and Apple. OAuth uses `chrome.identity.launchWebAuthFlow` with `chrome.identity.getRedirectURL('auth')` (permission `identity`), so the owner adds the dev and store `https://<id>.chromiumapp.org/auth` URLs to Supabase Redirect URLs. The Apple button follows the same flag as the website, `VITE_APPLE_SIGNIN_WEB` (the web app's native-app case doesn't apply in the extension). Sign-out is local to the panel: it clears the panel's session, open chart and sent-date memory in this browser, does not revoke the refresh token on the server, and is disabled while a send runs.
- **Internal messaging.** The panel talks to the background worker over `chrome.runtime.onMessage`, which accepts only the extension's own id and its own `chrome-extension://` pages; external messages stay limited to `externally_connectable`.
- **Re-inspect before send.** `usePimsSend` re-inspects the consult when Send starts, in both the web dialog and the panel. If the target changed, it shows the new target with a "consult changed" notice and stops. The panel also re-inspects on focus, visibility, active-tab changes and when the last inspected ezyVet tab (or a tab reported as an ezyVet page) finishes loading, debounced 300 ms, without discarding mapping choices; only the newest refresh counts, and one that shows the consult seen at load again clears the notice. A link opens toothops.app for sign-up and password reset.
- **Charts list.** The vet's recent charts (owned and practice charts, newest first, about 20) with search by patient name. When the active ezyVet tab is a writable consult, the chart whose patient matches by the panel's strict rule (§6, as built) is pinned at the top as "Matches this consult". A chart that matches only by the whole-word rule is shown as a possible match beside the ezyVet name, not pinned, and its Send asks first. Both are chosen among the loaded charts only, not the whole account.
- **Sending.** Picking a chart shows its record note (the stored note, or `buildRecordNote` for the profile language). Then the same mapping editor, patient check and send flow as phase 1, calling the writer directly instead of through external messaging. It also records `pims_sent_at` through the same edge function.
  - *(As built.)* **Practice flag.** Send follows the web app's rule (`FREE_BETA || practices.pims_send_enabled` for the signed-in user's practice, `src/utils/pims/sendFlag.ts`). When off, the chart view says sending isn't turned on for the practice and has no Send; when the flag can't be read, sending stays off with a Retry.
  - *(As built.)* **Sent-date memory.** The panel keeps, per `${userId}:${chartId}`, when it sent or may have sent a chart this session (mirrored to `sessionStorage`), and seeds the chart view with the later of that and `pims_sent_at`, so a maybe-sent or unstamped send still asks first after Back.
  - *(As built.)* **Stale note.** A stored note edited before the chart last changed shows the Record note panel's stale notice; the stored note is still what is sent.
- **The chart picture.** Mount the two diagrams off-screen, read-only, from the saved chart data, exactly as `AdminChartViewer.tsx` already does (`ToothDiagram` with the snapshot's marks, comments and strokes, `readOnly`, no-op handlers, and the same effective post-op marks). Take their `getSvgElement()` and call the shared `renderChartPicture`. The diagram is pure vector SVG with no image assets, so this costs one React component tree.
- **Read-only.** No editing in the side panel. Edit in ToothOps.
- **Reuse.** Phase 2 reuses phase 1's dialog pieces (mapping editor, results list) as shared components.

### 9. Translations

- A new namespace, `pims`, holds the dialog, side panel, mapping labels, ezyVet field states and the `errors.*` codes, for en, fr, de, it and es. Register it in `NAMESPACES` and `i18next.d.ts`.
- **ezyVet field names stay as ezyVet shows them.** They come from the page, in the practice's ezyVet language.
- **Synonym matching.** The synonym groups are English (as ezyVet's default layout is). The builder adds fr/de/it/es synonyms only if a localized ezyVet is confirmed.

### Tests

- **`matchField.test.ts`:** match order, synonyms, plurals, compound names, ambiguous parent matches returning nothing.
- **`page.test.ts` (jsdom) against the ezyVet DOM fixtures** (synthetic for now, §10):
  - `status` states, `listFields` output, refusal when not writable.
  - Popup textarea writes.
  - Lexical and HugeRTE writes run against small fakes of their editor objects.
  - The template guard: only `templateFillData.php` is intercepted, other calls pass through, and the original is restored after a write, including when the write throws.
  - The diagnostic report contains no text from the page other than field titles.
- **Splitting an edited note back into sections:** round trip, renamed heading falls back.
- **The default mapping and combining sections into one write.**
- **The patient-name comparison.**
- **`SendToEzyvetDialog` tests** with a mocked extension: not installed, no tab, not writable, mismatch confirmation, per-field results.
- **Pseudo-locale tests** for the dialog and the side panel.
- **A manual checklist** in `src/extension/README.md` for real ezyVet: each field kind, a locked consult, the Combined view, a wrong patient, and sending twice. jsdom can't prove that ezyVet saved.

### 10. Building without ezyVet access

The owner has no ezyVet consult available now. So:

- **Phase 1 is built from the reference selectors** in this document. The fixtures in `src/extension/ezyvet/__fixtures__/` are hand-built HTML that copies the structure those selectors expect, each marked `<!-- synthetic: from reference selectors, unverified -->`. When real anonymised pages become available, they replace these.
- **Diagnostic report.** The Send dialog has **Copy diagnostic report** (and the side panel too). It collects from the ezyVet page, as JSON, only structure and never content:
  - which selectors matched and how many times;
  - `status().state`, field titles and kinds, and whether `jaxmanager`, `hugerte` and a Lexical editor instance were found;
  - the extension version and the failure codes from the last send.

  It holds no patient, client or note text; titles of ezyVet fields are the only page strings. A vet at a pilot practice can paste it into a support message, and that is enough to fix a broken selector.
- **Release gate.** The extension is published **unlisted**. The **Send to ezyVet** button follows a per-practice flag (`practices.pims_send_enabled`, default false, set by an admin), except that **during the free beta it is on for everyone** (`FREE_BETA || pims_send_enabled`, like the owner report). *(Owner decision, 2026-11-15; this replaces "off until the real-ezyVet checklist passes".)* The writable-consult check, the patient check and the diagnostic report are what protect vets while the selectors are unverified.

## Left to the builder

- Every ezyVet selector, confirmed on a real page (the reference ones above are a starting point, not a guarantee), including the consult patient-name selector.
- Exact wording, following `glossary.json`.
- Styling consistent with the Documents tabs.
- Extension icons from the existing logo assets.
- Publishing to the Chrome Web Store (owner's task), then filling in the install URL.

## Decided by the owner (2026-11-15)

- No real ezyVet consult is available now: build from the reference selectors, gated as in §10.
- Template overwrite: use the template guard (§2a) rather than asking vets for blank templates.
- The side panel sends the chart picture too; the approach was left to me (§8).

## Calls I made (check these)

- Header not sent by default; chart picture to Discharge Summary.
- Mapping saved per vet, not per practice.
- Client Communication → Email not offered as a target.
- Text and picture to the same field become one document, image last.
- `pims_sent_at` recorded through an edge function without bumping `updated_at`.
- No `innerHTML` fallback for note fields.
- Edited notes that can't be split back go as one block (default Plan).
- One stacked pre/post image.
- Unlisted extension; per-practice flag, on for everyone during the free beta (owner decision).
- PR previews can't reach the extension (Chrome's `externally_connectable` needs exact hosts). Test on localhost and production. Until the Web Store item exists, a locally generated `key` fixes the id; the owner creates the item and the builder swaps in its key.
