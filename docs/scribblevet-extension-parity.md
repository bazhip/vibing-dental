# ScribbleVet browser-extension parity ledger

## Current local implementation — November 18

The four remaining bounded feature gaps now have local implementations:

| Feature | Local behavior | Verification boundary |
| --- | --- | --- |
| Pulse note export | Explicitly reviewed open-editor autofill using TinyMCE where available, or the modern/sidebar contenteditable writer. | Fill only; the clinician opens the field and verifies/saves in Pulse. Strict encounter-bound Send remains unavailable. |
| Rhapsody note export | Selected Medical/Discharge tab and ready CKEditor model insertion through an expiring ticket. | Requires an unambiguous already-open editor; no saved acknowledgement or independently observed encounter identity. |
| Vetspire note export | Selected open Quill section receives escaped note text through the captured contenteditable event flow. | No Add Note creation or save claim; clinician checks patient/encounter and verifies/saves. |
| Instinct durable sync | Configured-practice confirmation, raw patient/clinician IDs, namespaced calendar/visit source IDs, actual visit encounter IDs and guarded active-row capture. | User-confirmed practice binding; unknown/partial completeness prevents absence-based archival. |

The note-autofill operation is separate from strict Send, so this work does not manufacture encounter IDs, saved receipts or Sent stamps. Completed source code is distinct from deployment/live verification: the new `20261208_pims_instinct_configured_sync.sql` migration and earlier pending migrations/functions are not deployed here; actual provider sessions, installed-extension interoperability and private competitor output/template equivalence remain unverified. Global rollout and browser permissions are unchanged.

## Clinical-day workspace and mapping convenience — November 18

Merged current main (`9ef7eb8`) into the parity branch as `179d9c5`. Saved per-template/provider/site section mappings and reviewed grouped Paste All now cover the convenience gap for Pulse, Rhapsody and Vetspire. Sections sharing a field append together once; blocked/unknown results stop the batch and preserve a warning plus each field result. The clinician still opens the intended editor, checks patient/visit and saves. Mapping persistence requires the new local `20261209_pims_note_mappings.sql` migration; it is not deployed here.

Consultation and Discharge tabs now share the existing visit snapshot, clinical record and owner-report pipeline. Radiology uses the current clinical UI with linked helper text and consultation context. Optional source fields and a declarative `consultation-v1`/`discharge-v1` registry provide a foundation for future GP templates without changing current voice extraction. Vendor public pages/screenshots informed workflow; private vendor schema and generated-output equivalence remain unverified.

Validation: `npm test -- --maxWorkers=4` with the disposable PIMS database passed all 4,600 tests across 345 files; `npm run build` and the extension store package passed; scoped visual coverage includes desktop1440 and phones390/320 in light/dark, source states, saved visits, menus and mapped-paste partial outcomes. See [the implementation plan and coverage matrix](superpowers/plans/2026-11-18-clinical-day-workspace.md). Live provider sessions and native runtime remain unverified. No deployment, rollout or feature-branch merge into main was performed.

## Radiology free-text refinement — November 18

Radiology now has one always-visible report editor with the former field prompts as placeholder guidance. Refine with AI replaces the text in place with Undo; stopping a dictation that added radiology findings requests refinement in the captured dictation language. Explicit edits and clears are authoritative for clinical notes/PIMS, client-report AI facts, chart PDFs, admin viewing and autosave. Legacy source fields remain readable when no report value exists. English voice prompt/request snapshots are unchanged. Final validation: 4,611 tests across 346 files, production build, extension store package and translation checks pass; independent scoped review passed. See [the radiology refinement plan and visual matrix](superpowers/plans/2026-11-18-radiology-free-text.md) for 108 captures and runtime limits.

## Independent CT reporting — November 18

Imaging includes a separate CT report using the shared free-text editor, CT guidance, AI refinement/Undo and reviewed copy/PDF export. CT text and review metadata persist independently and feed autosave, clinical/PIMS sections (default mapping unset), client-report AI facts, chart PDF/code legend and admin viewing. CT requests never fall back to x-ray source fields. Dictation routing remains unchanged. Validation: 4,623 tests /346 files, production build, extension package and translations pass; independent scoped review passed. See [the CT report plan and visual matrix](superpowers/plans/2026-11-18-ct-report.md) for coverage and live/native limits.

## Scope and evidence

This is a bounded, static audit of ScribbleVet Chrome extension **1.31.3**, performed on November 16, 2026. It is not a claim of live interoperability, exhaustive product parity, or supported access to ScribbleVet's private services.

- Extension ID: `gbcmfinnjfigkegmhplcpfflfkkjpgbm`.
- CRX SHA-256: `5ffc76af2cfe317aac28ec2229011fb9f989c6ce6ad47cf4ea641c1f1e6bab01`.
- ZIP payload SHA-256: `69c6d169fb5d91df99999e6c8a0ad175ca48e3899ccb7da5ca247d9ce2c891b6`.
- REA archive inspection: `ev_68e94cf61b1a945778a3576c2edc294898214ae26eb6a9cf79dc8cd3ad756957`.
- Parent inventory: `ev_26b124f00dfdfd559e16db5b41522dc6c37510e61b96aef0a9986c0f7e1d764b` (916 files, 917 occurrences, no reported integrity contradictions).
- Local evidence export: `/private/tmp/scribblevet-parity-evidence-2026-11-16.json`. This is a local recovery artifact, not a committed dependency.

The package was inventoried/extracted and selected JavaScript source ranges were read as data. Target scripts were not executed. No authenticated PIMS or ScribbleVet account was contacted. Source line numbers below refer to the extracted, readable bundle, not recovered original source. The package and its proprietary code are not vendored into this repository.

## Actual browser providers

The website dispatcher and concrete handlers establish these seven browser integrations. Generated enum values alone do **not** establish an integration: AVImark, Cornerstone, ImproMed and Provet must not be advertised based on enum strings.

| Provider | Concrete bundle | Import contract observed | Write evidence and limits |
| --- | --- | --- | --- |
| DaySmart Vet | `daysmart.f0973135.js` | Same-origin `/barramundi` schedule, patient/client/provider resources; token from browser storage | SOAP section/form textareas; SOAP route provides encounter identity. No image support. |
| ezyVet | `ezyvet.21fe171a.js` | Calendar/appointment data and patient details | Existing ToothOps Medical-tab writer retained, including image-capable fields and patient/consult checks. |
| Instinct | `instinct.9eb2d42a.js` | GraphQL provider schedules and current visits; session bearer authorization | Contenteditable fields; patient and `visitId` route identity. Text insertion is guarded, but returns `save_not_confirmed`: no persistence acknowledgement is established. Credential destinations are allowlisted. No image support advertised by ToothOps. |
| Covetrus Pulse | `pulse.b8ec9667.js`, `oldPulse.0d5ec2ea.js` | Calendar POST and tooltip POST, CSRF token, explicit cancellation state | New record/sidebar editors and legacy TinyMCE flows observed. **ToothOps export disabled:** active patient plus encounter binding has not been established. Legacy persistence also involves browser-debugger interaction. |
| Rhapsody | `rhapsody.76fff428.js` | Same-origin schedules API, business ID and JWT cookie, appointments/persons | Medical/discharge CKEditor fields and image upload flow observed. **ToothOps export disabled:** editor presence alone does not identify an encounter. |
| Shepherd | `shepherd.a98412a5.js`, `shepherd.64827ad4.js` | Appointment search and SOAP dashboard, Baasic session authorization | SOAP UUID route; section-specific ProseMirror and objective textareas. Explicit template opening is implemented with the already selected supervising doctor; it is not a saved-exam acknowledgement. No image support. |
| Vetspire | `vetspire.da474192.js` | GraphQL appointments and location providers, browser token and location | Quill sections/Add Note controls observed. **ToothOps export disabled:** current patient plus encounter binding has not been established. |

Selected source anchors retained from the investigation:

- `sidepanel.b7741352.js:180879`: website identification/dispatch.
- `daysmart.f0973135.js:137`: field writes; `:297`: authorization; `:465`: appointment imports.
- `rhapsody.76fff428.js:201`: editor discovery; `:701`: appointment import.
- Other adapter tests encode the selected request/response and editor fixtures; they do not substitute for a live capture.

## ToothOps implementation boundary

The provider-neutral registry, injected page bridge, host routing, appointment importer interfaces and send protocol live in `src/extension/pims/`. Existing ezyVet entry points remain for compatibility.

- Only HTTPS exact/subdomain matches receive provider routing. Similar-looking hosts, credentials in URLs and unrelated origins are rejected.
- Additional PIMS host permissions permit the selected integrations; they do not expand external messaging origins or add browser-debugger/native-host permissions.
- Before each write, the page bridge checks provider, writable state, encounter identity and the confirmed patient. Adapters must recheck the destination across asynchronous editor transitions.
- Non-ezyVet field mappings start empty. Saved choices are isolated per provider, while old flat ezyVet maps retain their behavior. Unsaved choices are cleared on provider switches.
- Patient numbers have no persisted provider namespace in existing charts. No provider, including ezyVet and legacy untagged destinations, may use equal numbers alone to select a differently named chart or bypass confirmation. Appointment matching additionally checks patient and owner names; missing owner identity fails closed rather than opening an unverified existing chart.
- Failed/malformed reads return error codes or per-appointment failures, not an apparently successful empty schedule.
- API tokens remain in the PIMS page context and are not stored in ToothOps. Appointment data is returned to the user-visible extension in memory; starting a ToothOps chart uses the existing tab-bound, expiring, account-checked handover.
- Diagnostics exclude patient names, identifiers, encounter URLs and authorization material.

The ezyVet import fixes also enforce Day-view readiness before choosing a date, reject unchanged/partially stale appointment nodes after a date refresh, preserve local wall time across daylight-saving transitions, and store a handover before navigating its new ToothOps tab. A refreshed empty day is conservatively rejected because the inspected DOM exposes no independent completion signal; an already displayed empty day can still be read. The ezyVet writer rechecks the captured encounter between asynchronous stages and reentrant editor events, including before saving.

## Broader features found, not a parity claim

| Feature area | Static evidence | Boundary |
| --- | --- | --- |
| Copy plain text, HTML and PNG; copy all sections | `sidepanel.b7741352.js:202494`, `:212598` | Manual copy controls now exist in the web send dialog and extension chart view: individual sections, all text, and a separate PNG. ToothOps formatting is retained; live paste/persistence in each PIMS is not established. |
| Section mapping, expansion, add/copy actions and dental images | `sidepanel.b7741352.js:212973` | ToothOps has its own record-note mapping and dental images; identical output is not established. |
| Canine/feline drawing and local note formatting | `sidepanel.b7741352.js:181430`, `:181514`, `:181557`, `:192098` | Functional overlap, not pixel or behavioral equivalence. |
| Note/visit associations and archive/unarchive | `sidepanel.b7741352.js:150510`, `:157168` | Uses ScribbleVet private backend; requires a separately specified ToothOps equivalent. |
| Provider linking, sync conflict resolution and progress | `sidepanel.b7741352.js:221605`, `:224120`, `:224430`, `:224824`, `:306181` | Browser UI plus private backend operations, not standalone content-script functionality. |
| Cancelled/deleted visit reconciliation | `sidepanel.b7741352.js:306540` | Backend mutation/archive semantics; not implemented by a schedule reader. |
| Native PIMS, microphone/AI authoring, charge capture/billing | Not established by the bounded inspected entry points | Unknown, not absent. A generic browser API wrapper or generated enum is insufficient evidence. |
| Add records / history PDF export | `sidepanel.b7741352.js:220690`; `instinct.9eb2d42a.js:25119`, `:25224` | Outbound history-review PDF upload into Instinct patient documents, not a general records importer. The shipped location/sharing assumptions and weak identity/success checks are not safe implementation defaults. Not yet implemented in ToothOps. |
| Radiology-note generation and transfer | `sidepanel.b7741352.js:213732`, `:213810`, `:213839` | Private backend generates text; browser helpers autofill Radimal/Vetology using debugger commands. No image-diagnosis implementation is established. Automatic transfer requires permissions and identity evidence not currently present in ToothOps. |

## Local verification — November 16, 2026

- `npm test`: 257 test files, 2,673 tests passed.
- `npm run build`: passed (translation checks, lint, TypeScript and production bundle).
- `npm run build:extension` and a separate store build: passed. Manifest checks confirm the expected permissions and messaging origins, and both page bridges are bundled.
- Offline translation check: `todo=0 remove=0`. All five UI catalogs are updated.
- Adversarial fixture review found and closed asynchronous ezyVet patient switches, premature DaySmart save acknowledgement, incomplete Shepherd provider pagination, and malformed Pulse tooltip imports. This is local evidence, not authorized live-service validation.

## Final-review corrections — November 16, 2026

- Removed number-only identity shortcuts for ezyVet and legacy destinations as well as new providers. Equal numbers now require the relevant name checks, and automatic appointment-to-chart matching requires owner identity too. Persistent provider/practice provenance is still absent; these conservative checks are not a substitute for it.
- Instinct excludes inert, disabled and ARIA-locked editors and ancestors from field discovery and rechecks writability before mutation and subsequent events.
- DaySmart reports malformed rows and patient/client relations as `invalid_appointment` failures rather than silently treating them as an empty schedule.
- Regression-first verification reproduced the defects before implementation. After correction: 257 test files / 2,694 tests pass; production, development-extension and store-extension builds pass. Store permissions and messaging-origin assertions pass.
- Independent re-review reproduced all three original counterexamples safely and passed 158 focused plus 80 integration tests. This approval is limited to these fixes, not live interoperability or complete parity.

## Shipped-artifact continuation — manual transfer and legacy Pulse

- The three disabled export paths were traced again. Vetspire's `addSection` accepts no patient/encounter identity (`vetspire.da474192.js:176`), performs Quill-classed DOM insertion and returns success without a save acknowledgement (`:190,197`). Its appointment IDs are not demonstrated encounter IDs (`:641`). Its field discovery advertises images (`:460`) while the writer rejects them (`:177`); ToothOps does not copy that contradiction.
- Pulse's modern writer appends content (`pulse.b8ec9667.js:313`); TinyMCE insertion marks the editor dirty (`:333`). Its sidepanel wrapper also reacquires the current tab and attaches the debugger for a trusted blur click (`sidepanel.b7741352.js:197519–197530`); `clickScreen` sends mousePressed at `(75,0)` and catches errors (`:197397–197409`). This is not just a legacy dependency, and a click is not a persisted-save acknowledgement. Legacy Pulse clicks Save and immediately returns success (`oldPulse.0d5ec2ea.js:177`). Neither establishes independently readable active clinical identity or persisted-save acknowledgement. Exports remain disabled.
- Rhapsody selects a tab, acquires CKEditor, inserts content and waits (`rhapsody.76fff428.js:201`). Its writable-page banner does not establish identity (`sidepanel.b7741352.js:214588`). No guessed route or editor-instance ID is used to unlock writes. A new bounded REA parse retained parent evidence `ev_7e7c46773435c1abcb4cc97ee8f0f3c555d863307737fd70024b15841b598da7`; unselected sources and truncated semantic relationships remain unknown.
- Source-backed Pulse discovery now covers normalized sidebar headings, Medical Notes, Patient Documents and legacy fieldset destinations. It stays read-only: no Expand clicks, no editor mutation, no save or identity claims, and no image advertisement.
- The manual-transfer component offers section/all text plus HTML and a separate PNG copy. It preserves stored edits (including an empty note), suppresses section actions when edits cannot be split safely, and never stamps a chart as sent. It remains usable when automatic destination verification fails; the extension's practice send flag still applies.
- Text uses existing plain-text/manual-dialog fallbacks. PNG requests are initiated before asynchronous rendering completes, reject malformed/non-PNG data without fetching URLs, and report success only after clipboard completion. Failure and manual-dialog results are not shown as copied. All new UI strings have hand-written en/fr/de/it/es coverage.
- This implements the shared manual-transfer flow, not the providers' unsafe unverified writers. Backend linking, sync/reconciliation, add-record/radiology flows and live paste/save verification remain outstanding.
- Increment verification: 260 test files / 2,771 tests pass; production, development-extension and store-extension builds pass; translation backlog is zero. Store output checks retain the same permissions/hosts and production messaging origins. Independent review passes (162 focused tests). The image-upload UI was not changed.

## Backend foundation — implemented locally, not deployed

The user approved the ToothOps-native backend with browser-assisted synchronization on 2026-11-16. The detailed design is in `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`; the first-increment implementation and verification record is in `docs/superpowers/plans/2026-11-16-pims-sync-foundation.md`. These changes are included in the PR #104 update, not deployed or enabled.

- Implemented authenticated, practice-scoped connections and patient/clinician links, owner-managed configuration, five-minute exclusive sync leases, version baselines, idempotent chunks, persisted outcomes/conflicts and audit records. Database mutations use constrained RPCs; tables expose member-scoped reads only.
- Added an opt-in browser capture contract and coordinator with tenant/revision/freshness checks, keyset-paginated baseline reads, count/byte-aware batches, partial-capture handling and explicit uncertain outcomes. At this increment all seven adapters lacked `syncSource`; the provider-execution continuation below implements it for Rhapsody and Vetspire. Display-only imports remain unchanged.
- Cancellation, deletion, unknown status and identity changes become review issues. The foundation alone does not archive visits; the following reconciliation increment adds explicit status-based archiving. Neither creates charts, overwrites clinical notes or silently relinks patients.
- Subsequent increments: provider-specific verified captures/status adapters, automatic outbound Instinct history PDFs, automatic image/document transfers and upload-attempt reconciliation. Owner setup, historical chart association and manual saved-image export are implemented in the continuation below. Manual radiology transfer remains distinct from debugger-assisted autofill parity.
- Verification: 262 test files / 2,838 tests pass, including 35 real PostgreSQL and 32 coordinator tests. Production and development/store extension builds pass, translation backlog is zero, and store permissions/hosts/origins remain unchanged. Independent review findings have regression coverage. The PostgreSQL fixture exercises real transactions/RLS, but full historical migration integration and Supabase Auth/PostgREST/storage validation remain outstanding before hosted rollout.

The continuation traced the outbound Instinct `uploadChartFile` flow and confirmed reconciliation distinguishes explicit cancelled/deleted status from unknown absence. Bounded Instinct REA parent evidence is `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810`, with partial/truncated semantic coverage. The local recovery bundle is `/private/tmp/scribblevet-parity-backend-design-evidence-2026-11-16.json`. No live authenticated PIMS or ScribbleVet service was contacted.

## Reconciliation and review — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-reconciliation.md`. This continues the approved design in the same isolated worktree and is included in the PR #104 update.

- Seals capture completeness and pages reconciliation candidates. Missing appointments require fresh independent status; unknown/partial absence never implies deletion. Active appointments can reschedule outside the original day without changing identity.
- Adds versioned manual archive/restore with actor/reason receipts, plus explicit source cancellation/deletion archiving. Archived visits are not silently restored by subsequent sync; clinical records are not deleted or rewritten.
- Adds shared review UI in practice settings and the extension panel: active/archived/issues filters, pagination, current/proposed comparisons, retain-current and identity-preserving schedule acceptance. Includes five languages and pseudo-locale coverage. Schema-unavailable and unconfigured connections are explicit states, not fabricated success.
- Independent review found cancellation races against manual restore and retain-current decisions. Four real PostgreSQL regressions reproduced them; fixes preserve the capture baseline version and recheck unresolved proposal authorization under the connection lock. Additional regressions cover wrong patient/clinician/encounter/appointment, link versions, stale evidence, uncertain writes and stale-practice UI responses.
- Verification: **265 test files / 2,893 tests pass**, including **61 real PostgreSQL tests**, **41 coordinator tests**, **13 review transport tests** and **7 review UI/pseudo-locale tests**. Production and development/store extension builds pass; translation backlog is zero; store permissions/hosts are unchanged, messaging remains production-only, and debugger permission is absent. Existing chunk-size/dynamic-import warnings remain.
- This is shared engine/review implementation, **not enabled end-to-end provider synchronization**: none of the seven provider adapters supplies `syncSource` yet. Owner configuration/link setup UI is added in the continuation below. Supabase full-migration integration, rendered-device review and authorized live PIMS verification remain unverified. Persisted manual drafts are implemented in the following increment; automatic attachment/document transfer remains separate.

## Persisted clinical drafts — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-drafts.md`.

- History and radiology notes persist per saved practice chart, with source fingerprints, optimistic versions, actor-bound idempotency receipts and explicit version-specific review. Source changes and edits invalidate approval. Private charts and removed members cannot use these practice-scoped RPCs.
- Shared web/extension editor supports deterministic composition from the explicitly opened saved chart, manual edits, approval and reauthorized text/PDF export. Radiology composition restates recorded findings; it does not interpret images or call a vendor service.
- Unknown write outcomes retain typed text but require reload before further changes. Access revocation clears cached content; chart/auth changes discard stale results. PDF output rejects unsupported font characters instead of silently altering clinical text; lossless text copy remains available.
- This implements persisted manual preparation, not automatic Instinct upload. Existing saved-chart selection does not aggregate historical records by patient name or imply a verified external link. No PIMS sent-history stamp is written by manual export.
- Synthetic editor screenshots cover five states at 1440/390/320px with no measured overflow or page errors; selected reviewed/unknown/empty/multiple states were visually inspected. Actual modal/panel-parent and live-device coverage is separate; see the implementation ledger.
- Verification after main's UI merge: **286 test files / 3,199 tests pass**, including **77 real PostgreSQL cases**. Production and development/store extension builds pass; translation backlog is zero. Final review was an author self-review, not an independently routed agent review. The drafts are included in the PR #104 update; the following rollout checks supersede these historical totals.

## Owner setup and saved-image export — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-setup-continuation.md`.

- Primary owners can configure unverified connections, confirm external patient links and link external clinicians to current members. Setup loads only when opened and requires explicit confirmation; uncertain writes require successful reload before another mutation. Manual input never verifies a PIMS session.
- Historical practice charts can be explicitly associated/relinked to confirmed external patients with source-hash/version checks, a reason, actor-bound replay receipts and audit. Clinical chart data/grouping is unchanged. Unshared/private charts and former members lose access; receipt connection/practice consistency is database-enforced.
- Both web and sidepanel surfaces offer saved photo/x-ray selection, full stored-byte preview and reauthorized download for **manual transfer only**. PNG/JPEG/WebP MIME, signatures, dimensions, decode and size are checked; chart/attachment metadata and content hashes are checked again at export. Changed, deleted, relinked or inaccessible captures are rejected. No external URL fetch, conversion or PIMS write is performed.
- DICOM-derived previews are labelled as previews; original DICOM and diagnostic-quality export are not claimed. Download initiation is not presented as a confirmed PIMS save or upload.
- Automatic saved-image transfer and duplicate-upload reconciliation are still unimplemented. The existing inspect protocol does not establish an immutable connection/tenant identity; this increment does not relax that prerequisite or unlock disabled writers. No additional browser permissions were added.
- Validation totals for this continuation are recorded in its implementation ledger. Review is an author self-review; no independently routed reviewer or live PIMS test was run.

## Release isolation — implemented locally, off by default

The new review/archive and history/radiology draft UI, Send eligibility and web patient-handover
consumption require an explicit `VITE_PIMS_ROLLOUT_ENABLED=true` build. Free beta does not bypass
this boundary. Web Send additionally requires a compatible handshake from the configured extension,
not merely Chrome messaging availability. Legacy, absent and incompatible extensions leave Send hidden.
After rollout opt-in, backend review/manual preparation do not themselves require extension installation.
See `src/extension/README.md` for backend → extension → web release sequencing and
`docs/superpowers/plans/2026-11-16-pims-rollout.md` for verification. Nothing was deployed or enabled.

## Provider execution — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-provider-execution.md`.

- Rhapsody and Vetspire now provide authenticated, explicitly selected-tab sync through the extension bridge, owner setup controls and durable backend coordinator. Tokens stay in the provider page; URLs, tenant/location and sessions are rechecked around asynchronous reads. Rhapsody also supplies independent appointment status reads. Verification receipts must match the provider, origin and tenant, not merely connection ID/revision.
- The recovered feeds do not establish appointment end times. Explicit nulls now survive capture, storage, reconciliation and conflict review. No duration units or default appointment lengths are invented. Invalid identity rows produce partial captures; valid feeds remain completeness-unknown, not falsely complete. Missing optional Rhapsody person metadata does not discard an otherwise usable feed.
- Instinct's multipart PDF mutation is implemented with explicit patient/location, private sharing, fixed source attribution and independently checked file receipts. Durable upload claims consume dispatch before writing and block concurrent or cross-request duplicates. Lost dispatch/confirmation acknowledgements stay unknown. `uploadReviewedDraft` uses persisted reviewed content and revalidates after PDF rendering; arbitrary caller-rendered content is not the application entry point.
- **Automatic Instinct uploads are not exposed or enabled.** The recovered code hardcodes location `"1"`; its session API URL can be generic and its response contains no location. Independent clinic/location and saved-file/content observers remain unavailable. The adapter makes zero requests without them. Copying that constant or echoing the expected target would violate the approved design. Saved-image uploads and provider-backed resolution of unknown attempts remain unavailable; manual observations are implemented in the continuation below, not treated as verified resolution. No full seven-provider parity claim is made.
- Source evidence remains static and partially covered: REA parents `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810` and `ev_7e7c46773435c1abcb4cc97ee8f0f3c555d863307737fd70024b15841b598da7`, artifact SHA-256 `51eab8d0307b6acec82701ca2313536f41066361c5b4a10c6fdb82485ac92524`. Relevant recovered files/line anchors are in the execution plan. Tests use synthetic fixtures, not authenticated vendor writes.
- UI coverage: unverified, empty capture, populated capture with long identifiers, and interrupted capture at 1440/390/320px (12 mocked Chrome cases). Screenshots inspected; no horizontal overflow, controls at least 44px, no browser exceptions. This covers the new sync controls, not a full-app design review. Auth changes invalidate pending operations; changing connection/date clears stale summaries.
- Rollout remains default-off; no hosted migrations, extension release or production enablement occurred. No new browser permissions or debugger access were added. The six unshipped migrations (including the observation continuation below) still require full historical-schema/Supabase validation before deployment. Review was performed locally, not by an independent model reviewer.
- Final verification on November 17, 2026: **301 test files / 3,333 tests passed**, including real PostgreSQL checks. Production, development-extension and rollout-enabled store-extension builds passed; translation backlog is zero and diff checks passed. Existing test-environment and bundle warnings remain. No commit or push was made in this continuation.

## Uncertain-upload observations — November 17 continuation

- Adds append-only manual observations (`present`, `not_found`, `uncertain`) with server actor/time, a required short note, optimistic review versions and actor-bound idempotency. The original attempt stays `unknown`; manual reports never stamp sent history, confirm provider persistence or authorize automatic retry.
- Both existing transfer surfaces expose a chart-scoped review disclosure behind the default-off rollout flag. Original destination, patient, draft/version and file fingerprint remain visible; explicit acknowledgement is required. Uncertain writes force reload, stale chart/auth results are discarded, and revoked access clears sensitive details.
- Review pages are bounded to 50 unknown attempts and the chart's current practice. Regression tests cover removed members, private/moved charts, replay, simultaneous reviews, relinking/disabled connections and continued duplicate blocking. Manual copy/download still needs caution because an uncertain upload may already exist.
- Rendered component checks cover empty, single/multiple, previously reviewed and interrupted states at desktop and 320/390px phones. No live vendor calls, automatic upload enablement or hosted deployment is implied.
- Verification: **304 test files / 3,399 tests passed**, including real PostgreSQL regression tests. Production and both extension build modes passed; translation backlog is zero and diff checks passed. Changes remain uncommitted and unpushed.

## Saved-image send path — November 17 continuation, not release-ready

- Adds an explicit preview → include → destination → Send path to the existing web dialog and extension chart view. The attachment has its own mapping row and does not replace the chart diagram. Only ezyVet image-capable, non-email destinations are offered; other providers keep manual download.
- Revalidates saved chart identity, membership, attachment metadata and content before and after PNG conversion. PNG is preserved; JPEG/WebP are converted at the original dimensions with the existing 2 MiB/2000-pixel limits. DICOM-derived previews remain explicitly labelled; originals are never transferred.
- Removal, reload, chart/store changes, sign-out and capability loss invalidate the selected transfer. Failed revalidation clears the stale preview. Late send failures and stamp responses cannot update another chart or an unmounted screen. Duplicate clicks are blocked; uncertain sends reuse the existing explicit resend warning.
- This is **not completion of the approved durable image-transfer contract**: the existing ezyVet inspect/send protocol lacks persisted connection/tenant provenance and image-specific durable outcome/readback reconciliation. Its resend warning is not the stronger duplicate lock implemented for reviewed PDF uploads. Conversion preview currently displays the original decoded image, not a separately reviewed converted artifact. Those release gates remain unresolved; the global rollout stays disabled, and no production enablement is authorized by these tests.
- Validation: **312 files / 3,521 tests passed**, including the disposable PostgreSQL suite. Production, development-extension and rollout-enabled store-extension builds passed. Translation backlog is `todo=0 remove=0`. Nine mocked Chrome cases exercise included/stale/empty states at 1440/390/320px, including the actual web dialog and successful/blocked transport requests. Screenshots were inspected; no horizontal document overflow, image controls meet 44px targets, and no browser exceptions occurred. This is not live vendor persistence or full sidepanel visual verification.
- Author review only; no independent model review, commit, push, hosted migration or release. The canceled close-without-saving modal task was not changed.

## Durable images and explicit Shepherd setup — November 17 retry

This section supersedes the earlier saved-image continuation's raw-send path and conversion-preview limitation. These changes remain local and unreleased.

- Saved attachments no longer enter ordinary `transport.send`. They require a separate durable dispatcher; a legacy render callback alone does not expose a transfer row. Blocked, duplicate and unknown outcomes stop before ordinary note writes and never stamp sent history.
- Conversion now happens before review. Preview and send use the same immutable PNG blob, hash and original dimensions. Source chart, attachment metadata and original bytes are revalidated; sending does not re-encode the reviewed image. Manual download retains the original stored format.
- `20261205_pims_image_attempts.sql` adds authenticated, actor-bound prepare/dispatch/confirm claims. Dispatch consumes its authorization by recording `unknown` before remote work. Deduplication survives new request IDs, browser generations and chart changes. Client confirmation requires an independent saved-content read matching the immutable target and hash. No manual observation clears this lock.
- Replay checks current chart access before returning a historical attempt. Expired, never-dispatched preparations can be replaced atomically by a new attempt ID; old IDs remain expired and cannot execute. Unknown or confirmed outcomes never renew. The coordinator revalidates source bytes and metadata after its final asynchronous target check, then requires a synchronous current-target observation immediately before synchronous dispatch (only receipt settlement is asynchronous). A provider that cannot implement that boundary is ineligible. Confirmed image success remains visible and stamped if a subsequent note write fails.
- Automatic saved-image UI requires a concrete target/provider/readback binding, not merely an ezyVet image-capable editor. No such independently observed ezyVet clinic binding is available in the recovered artifact, so the application keeps saved-image transfer manual. The older chart-diagram writer is separate and is not claimed to have this durable ledger protection.
- Shepherd setup is a separate explicit action in both existing transfer surfaces, shown only after passive extension-capability confirmation: choose a recovered template and use the already selected supervising doctor. The page bridge uses expiring, document-bound, single-use preparation tickets invalidated by observed navigation/session/provider changes. An opaque extension-local claim is persisted and read back before opening; unknown, lost and opened outcomes stay blocked across document, tab, worker and browser restart. Only definite pre-activation failures release the claim. This is browser-profile protection, not cross-device reconciliation. There is no random doctor selection, no creation as a side effect of Send, and no saved/sent claim when an exam opens.
- Registry regressions constrain durable sync to Rhapsody and Vetspire. ezyVet, DaySmart, Pulse, Instinct and Shepherd retain their existing appointment readers but gain no invented clinic identity. Pulse/Rhapsody/Vetspire exporter regressions preserve disabled writes where encounter/persistence proof is absent. Unsupported-only dummy sync factories were removed rather than counted as implementation.
- Remaining evidence boundaries are unchanged: independent clinic/session discrimination for the other durable sync adapters; independent encounter and saved-note observation for the disabled writers; Instinct clinic/location and saved-file/content observation; and debugger-free, patient-bound Radimal/Vetology access. No provider credentials, browser permissions or production rollout settings were changed.

Fresh verification for this retry is recorded in `docs/superpowers/plans/2026-11-16-pims-provider-execution.md`; historical totals above are not this retry's results.

## November 17 evidence completion — unknown image review and session continuity

Implementation and verification: `docs/superpowers/plans/2026-11-17-pims-evidence-completion.md`. Work continues from `1379a5c` in the isolated parity worktree; this section does not supersede the live-verification requirements.

- Unknown saved-image attempts now have the same manual-observation workflow as PDF uploads, in both existing transfer surfaces. Explicit opening loads metadata only. Review records present/not-found/uncertain, note, authenticated actor and version; it never confirms persistence, marks a chart sent or unlocks automatic redispatch. Historical review survives source deletion or connection relinking while current chart/practice authorization remains mandatory.
- `20261206_pims_image_observations.sql` supplies append-only observations, bounded keyset pagination and current authorization before idempotent replay. Per-request advisory locking serializes the same request ID even across different connections. No attachment snapshot, storage path or image bytes appear in the review response. Client validation rejects wrong-mode/provider/identity receipts; auth, chart, mode and disabled transitions suppress stale results. Rollout remains default-off; the migration is not deployed.
- DaySmart, Shepherd and Pulse appointment display readers now compare session material around asynchronous fetch/body reads and stop subsequent work on observed discontinuity. DaySmart uses the already evidenced `Vetter-Token` (`daysmart.f0973135.js:297–315`); Shepherd uses its token and optional independent user ID (`shepherd.64827ad4.js:4599–4603,14151–14158`); Pulse compares the antiforgery input (`pulse.b8ec9667.js:526–534`). Malformed Shepherd session data fails closed. These values remain in page memory. Session continuity does not prove clinic identity and does not enable durable sync.

The parallel static trace narrowed the remaining evidence requirements rather than supplying safe production bindings:

| Remaining automatic behavior | Exact recovered boundary | Evidence still required |
| --- | --- | --- |
| ezyVet/DaySmart/Pulse/Shepherd durable sync | Visible-calendar/cookie reads, token reads, or embedded location requests do not independently establish the active clinic. Shepherd's SOAP dashboard and appointment IDs are distinct entity classes (`sidepanel.b7741352.js:308176–308250`). | Authorized active-clinic/session observations, actual embedded response shapes, and evidence of feed completeness/status behavior; never infer absence from a short or filtered feed. |
| Instinct PDF upload | `instinct.9eb2d42a.js:25224–25255` supplies constant `locationId:"1"`, checks mutation errors and navigates away. `chartFileInfo` selects metadata, not location/downloadable bytes/hash (`:25144–25206`). | Independent active clinic/location and independently readable saved-file bytes/content identity. ScribbleVet's private visit metadata is not an Instinct session witness. |
| Saved-image automatic transfer | ezyVet insertion marks the editor dirty (`ezyvet.2faddd27.js:178–228`); save helpers wait for popups to disappear (`:327–336,445–459`). | Independent current clinic/encounter binding and saved-resource/content readback. Popup disappearance cannot confirm matching bytes. |
| Pulse/Rhapsody/Vetspire saved notes | Dirty state, trusted click, CKEditor insert/wait (`rhapsody.76fff428.js:201–228`) and Quill input/change (`vetspire.da474192.js:164–197`) supply no independent saved-note acknowledgement. | Actual editor-to-patient/encounter binding and a provider persistence observation, not echoed requested IDs or local editor content. |
| Radimal/Vetology autofill | Debugger DOM focus/key events target `textarea[name="notes"]` / `textarea[name="history"]` (`sidepanel.b7741352.js:213844–214021`), with no patient/encounter or save check. | Separately approved host access plus authorized debugger-free editor and clinical-identity evidence. No new permissions or order submission are implemented. |

These are observations from the existing extracted ScribbleVet 1.31.3 artifact, not live-provider tests. The bounded traces did not recover those contracts; they do not prove no such contracts exist. No guessed endpoint, cached expected target or hardcoded clinic value is substituted for missing evidence.

## November 17 continuation — provider import behavior

This continuation reuses the retained shipped-artifact analysis `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810` and bounded reads of the same extracted 1.31.3 files. The source-tree digest remains `51eab8d0307b6acec82701ca2313536f41066361c5b4a10c6fdb82485ac92524`. It improves the existing import path, not unbound durable synchronization.

- **DaySmart:** detail responses now recheck both cancellation labels, and a successful absent detail alone permits the history lookup. Only the newest history title can confirm cancellation; malformed arrays, failed fetches and inconclusive history become per-row failures. Verified detail time controls display and day membership. Explicit returned appointment/patient mismatches are rejected; optional absent IDs are not fabricated. The old best-effort import on a failed detail fetch is deliberately tightened to avoid showing a potentially canceled patient as verified. Evidence: `daysmart.f0973135.js:318–405,484–488,572–614`.
- **Pulse:** add the observed `GetVisit` JSON/antiforgery-header request after tooltip reading. Removed/canceled visits are excluded, unrecognized or malformed forms remain row failures, and strictly parsed live local form dates replace stale feed times. Reject numeric visit IDs whose coercion could check a different record. Resolve assigned calendar resources through the observed resource endpoint and DOM-provider choices, caching the lookup within one import. The existing result still carries one display clinician, not a multi-provider durable mapping. Evidence: `pulse.b8ec9667.js:582–594,625–720,754–765,822–840,893–936`.
- **Shepherd:** preserve SOAP and appointment source kinds alongside their original IDs, including identical IDs across the two sources. Read the actual custom patient `identifier`, dashboard owner from `patient.clients[0]`, and supervising-doctor first/last names. Keep ToothOps' existing patient-name representation and separate owner column rather than adopting ScribbleVet's surname suffix, which broke existing-chart matching during review. No SOAP-to-appointment link is inferred. Evidence: `sidepanel.b7741352.js:308176–308250`.
- **Patient list:** React keys include provider, source kind and raw record ID. A narrow border-box correction prevents appointment rows from overflowing the panel; no new action or label is introduced.

Pulse live assignment controls also take precedence over stale feed/tooltip clinicians; explicit removal cannot restore the previous assignment. Missing controls retain the legacy fallback without inventing a new assignment. Final independent reviews pass for all three provider changes. The final full suite passes **317 files / 3,998 tests**, with production/extension/store-package builds and translation checks passing; detailed commands, scoped visual coverage and review corrections are in `docs/superpowers/plans/2026-11-17-pims-evidence-completion.md`.

These are static-contract and synthetic-fixture checks, not claims of live provider interoperability. Rollout remains off by default; no extension host/debugger grant, remote deployment or automatic upload enablement is introduced.

## Saved-file verification follow-up — November 17

The image-transfer confirmation boundary now requires the exact write resource ID and actual returned file bytes, not just a claimed matching hash. It checks the reviewed byte length, hashes a copy locally, pins the resource ID across asynchronous work, and rechecks the target/liveness/expiry before confirmation. Seven previously false confirmations and a mutable-receipt-ID regression were reproduced and fixed; all 35 image-transfer tests pass under independent review. This strengthens the existing adapter contract; it does **not** supply the missing production ezyVet saved-resource reader or active-clinic witness.

Instinct's `readFile` boundary likewise requires returned PDF bytes and verifies their length/header and locally calculated SHA-256. It pins the requested hash and mutation file ID, rechecks destination/session/expiry after hashing, and excludes bytes and arbitrary observer metadata from its returned receipt. Twenty-five regression failures before this change became 36 passing focused tests afterward. The mutation alone, a supplied matching hash or an editor save event cannot confirm the transfer. These synthetic checks do not replace the missing production location and file-read observers.

The additional Instinct trace checked `instinct.9eb2d42a.js:355–365` (session envelope), `:281–304,424–447,20959–21003` (active users/calendar/board reads), and `sidepanel.b7741352.js:225078–225110` (ScribbleVet membership practice ID). None of those selected fields establishes the active Instinct upload location or a saved-file byte download. The ezyVet HugeRTE insertion and `patchJaxmanager.1f805b1c.js:116–141` template interception likewise do not provide saved-image readback. No authenticated provider session or matching sanitized runtime capture has been supplied to this task. Those missing inputs still prevent automatic enablement.

## Required authorized live verification

Use a non-production/test patient in each practice's authorized environment. Never use this checklist to bypass authentication or record access controls.

1. Capture current URL shape, active patient identifier, encounter identifier, lock state and field inventory. For disabled exporters, establish a stable, independently readable encounter binding before enabling writes.
2. Compare schedule imports against the visible practice calendar: provider filters, cancelled/no-show appointments, checked-in visits, local midnight, both DST boundaries, missing patient numbers, multiple patients and malformed/inaccessible responses.
3. Select destinations explicitly. Append one distinctive test note, reload the PIMS, and verify persistence, exact field, patient and encounter. A DOM mutation alone is not save evidence.
4. Switch patient, encounter, provider/tab and lock state during each asynchronous stage. Confirm no subsequent field is written to the new target.
5. Verify image acceptance and persistence separately. Until established, keep `acceptsImage:false`.
6. Verify handover/account switching, duplicate-import behavior, failure cleanup and no identifiers in URL/diagnostic output.
7. Record sanitized fixtures and assertions for each verified behavior, then remove the relevant blocker from this ledger. Do not describe remaining disabled or private-backend functionality as complete parity.

## Observed compatibility submissions — November 17 resumed work

The later scope decision in `docs/superpowers/plans/2026-11-17-pims-observed-upload-parity.md` permits the shipped Instinct PDF and ezyVet editor/save compatibility workflows without claiming independently verified saved bytes. This changes the compatibility UI gate; the strict durable verification utilities and their missing-evidence ledger remain applicable to verified automatic transfers.

Instinct now prepares an expiring page/session-bound ticket, displays patient/origin and explicit compatibility location `1`, revalidates a reviewed private PDF and dispatches the recovered authenticated multipart mutation. The extension persists a browser-profile source/destination duplicate claim before remote dispatch. Missing acknowledgments, exceptions and mismatched receipts remain unknown, with no automatic replay. Independently verified persistence is not claimed.

ezyVet saved-image selection now reaches the existing guarded PNG editor/save writer through explicit compatibility inclusion on both transfer surfaces. Render rechecks source metadata/bytes after asynchronous decoding and hashing. Editor acknowledgments are labeled Submitted, excluded from verified saved counts, and image-only results do not persist a chart sent stamp. Strict adapter-backed image dispatch remains separate. Rollout stays default-off; no remote migration, deployment or new permission is introduced.

Independent scoped review and targeted 1440/390/320px screenshots are recorded in the implementation plan. Synthetic fixtures establish local contracts, not live provider behavior.

## Radimal and Vetology compatibility autofill — November 17

This supersedes the earlier statement that radiology autofill is unimplemented. The user's explicit request adds this compatibility workflow and the two narrowly scoped HTTPS host grants; previous restrictions on additional permissions applied to the earlier upload pass. External messaging origins and the existing non-debugger permission list remain unchanged.

Observed ScribbleVet 1.31.3 behavior: `sidepanel.b7741352.js:180883,180891,213732–214021` identifies Radimal's `/request-consult` flow and Vetology, targets `textarea[name="notes"]` and `textarea[name="history"]`, and inserts report text without submitting the order. The source was read as inert data from the previously inventoried artifact; no vendor code or authenticated provider session was executed during analysis. The native textarea setter and bubbling input/change events are ToothOps implementation choices replacing browser-debugger keyboard commands. They need live acceptance testing.

ToothOps now exposes autofill for approved radiology drafts in both existing transfer surfaces. The user explicitly selects an open destination tab, reviews provider/origin/title and confirms the patient/request. Export is reauthorized and checked again before dispatch. Preparation pins an expiring one-use ticket to the document, full URL, unique visible writable textarea and original content. Field/content/navigation changes block execution; changes during event handling produce unknown. Text is appended to existing content without clicking submit/save. Filled acknowledges only form mutation, never saved content, clinical identity or a submitted order. An unknown result is not retried automatically.

The selector evidence does not establish independently readable patient/request identity. Same-URL reuse of the same textarea for a different request remains a manual confirmation limitation. Rollout stays disabled by default, and actual provider behavior and installed-extension interoperability remain unverified. No new backend or private ScribbleVet generation service is claimed: this sends the existing reviewed radiology draft.

Implementation, independent review, synthetic browser checks and rendered coverage: `docs/superpowers/plans/2026-11-17-radiology-autofill.md`.

## Durable clinic binding follow-up — November 17

The explicit request to finish ezyVet, DaySmart, Pulse and Shepherd sync does not supply their missing provider-side clinic contracts. A fresh bounded trace of the same artifact again found session signals and schedule fields, with no independently observed active-clinic discriminator. These four remain unexposed as durable `syncSource` implementations; expected owner configuration is not read back as provider evidence.

| Provider | Recovered usable signals | Runtime input still needed |
| --- | --- | --- |
| ezyVet | Calendar `data-appointment`, `data-animal`, tooltip record IDs; visible calendar providers yield names only (`ezyvet.21fe171a.js:5637–5755`). | A provider-side active clinic/location and authenticated session witness, its clinic/account-switch behavior, and stable clinician IDs independent of display names/column positions. |
| DaySmart | `Vetter-Token` (`daysmart.f0973135.js:297–315`); raw appointment/patient/provider IDs and status reads (`:318–377,464–549,592–614`). `location=true` requests data but the recovered consumer never reads an active location identifier. | Sanitized active-clinic/location response or storage envelope before/after a clinic switch; demonstrate whether switching changes the token. `/actor/staff/business/providers` names an endpoint, not the active business identity. |
| Pulse | Antiforgery input (`pulse.b8ec9667.js:526–534`), raw appointment/patient/resource IDs (`:535–567`), live visit/status controls (`:625–719,893–936`). | Sanitized current-clinic response/DOM/storage field and clinic/account-switch behavior. Antiforgery tokens and provider filters do not identify clinics. |
| Shepherd | Baasic token and optional user ID (`shepherd.64827ad4.js:4599–4603,14151–14158`); SOAP/appointment raw identifiers and status (`sidepanel.b7741352.js:308175–308234,308496–308518`). Embedded location and clinicUser requests do not establish current clinic selection. | Sanitized active-clinic selection/response envelope before/after switching; distinguish selected clinic from encounter location and authenticated user. Preserve distinct SOAP/appointment namespaces. |

These are bounded static findings, not proof the providers lack such contracts. No raw tokens, cookies or credentials should be persisted in fixture/code/server data; authenticated material stays in the provider page. To resume the four adapters, first obtain an authorized test-session CDP endpoint or local sanitized capture showing the missing field and its switch behavior. Repeating the same artifact-only searches without new evidence is not expected to resolve these boundaries. No live provider session or capture was supplied in this turn.

### Necessary shared routing correction

The existing `dispatchShared` handled `providerSync`, but `SHARED_TYPES` omitted it. Real `onMessage` / `onMessageExternal` listeners therefore ignored durable-sync requests even for the already-supported Rhapsody/Vetspire adapters. Two parameterized real-listener regressions reproduced rejection before the fix; adding the missing message name routes both authorized surfaces to the existing provider/tab/origin checks. Untrusted senders remain ignored, and the four unbound provider capabilities remain disabled. This fixes shared infrastructure; it is not completion of the requested four clinic adapters.

Focused verification: 5 files / 119 tests pass in `/private/tmp/pims-clinic-sync-listener-green.log`. Independent scoped review and full-suite/build results are recorded after completion. No UI, translations, backend schema, host permission, deployment or rollout setting is changed by this follow-up.

Independent listener-fix review: PASS; independently reran 4 focused suites / 148 tests and confirmed both trusted surfaces dispatch while unsupported providers and untrusted senders remain blocked.

Final follow-up validation: `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test` exits zero, **320 files / 4,206 tests pass**, including PostgreSQL tests. App, development-extension and store-package builds pass; `git diff --check` passes. Logs `/private/tmp/pims-clinic-binding-{full-tests,build,extension,package}.log`. No commit/push/deployment or rollout change. The four requested clinic bindings remain unresolved pending the specific runtime input above; this pass does not count the routing fix as their implementation.

## Configured-practice sync compatibility — November 17

This supersedes the preceding clinic-witness gate for ezyVet, DaySmart, Pulse and Shepherd. The user explicitly requested ScribbleVet's behavior after the stronger independent-clinic requirement was explained. The recovered browser flow uses the selected tab, configured integration/provider links and authenticated backend scope (`sidepanel.b7741352.js:224867–224998`); no independent active-clinic witness is established by those paths. ToothOps now implements this configured-practice flow with its own practice-scoped sync backend, rather than echoing configuration as a provider observation.

- Owners configure an origin and clinic label. A distinct audited owner-confirmation RPC activates `binding_mode=user_confirmed`, leaves `verified_at` null, and increments the connection revision. Changes reset confirmation; previous runs are interrupted. Setup describes this as user-confirmed and never as automatically detected clinic identity.
- Before activation and every sync, the user reviews an inspected PIMS tab title, then confirms it belongs to the configured practice. That exact tab ID is pinned through dispatch; a later most-recent tab is not substituted. Date, connection, auth, refresh and operation transitions clear the checkbox/review.
- `configuredSync.ts` binds the source to confirmed configuration, provider/origin/document and available page/session signals. DaySmart pins Vetter-Token; Shepherd pins Baasic material; Pulse pins the antiforgery input. ezyVet pins page/calendar continuity and observable cookies, without claiming access to its HttpOnly login identity. Credentials remain in page memory. Sources remove their listeners when replaced.
- Dedicated captures preserve recovered identifiers and status/date checks while retaining the existing display reader results. ezyVet uses raw `data-animal` patient IDs and explicit `name:<provider name>` clinician-link keys. DaySmart/Pulse use raw IDs; Shepherd namespaces SOAP/appointment source IDs separately and retains only evidenced SOAP encounter IDs. Unknown/partial captures never authorize absence-based archiving; explicit cancellations use the existing reconciliation ledger.
- Existing membership, confirmed patient/clinician links, run generations/leases, idempotency, versions and conflict checks remain in force. Rhapsody/Vetspire retain their observed-identity flow; Instinct is not newly enabled for durable sync.

Implementation plan and final checks: `docs/superpowers/plans/2026-11-17-configured-practice-sync.md`. New migration: `20261207_pims_configured_sync.sql`; it is included locally and not deployed. No rollout, host permission or external messaging-origin change occurs in this pass.

Independent provider and DB/UI reviews pass. Review reproduced a tab-reselection race and it was fixed with reviewed-tab pinning and regressions. Synthetic fixtures establish local capture and ledger behavior, not live provider interoperability. Same-tab clinic changes invisible to the available signals remain governed by user confirmation. Actual provider sessions remain untested; absence of an independent clinic witness is now an accurately labeled compatibility limitation, not a gate preventing these four sync adapters.

Final configured-practice integration passes **323 files / 4,286 tests**, including166 PostgreSQL cases. Production, development-extension and store-package builds, translation validation/backlog and diff checks pass. The four configured sources are now implemented locally; the new confirmation migration remains undeployed and rollout is unchanged. ezyVet reads the selected calendar Day view/date and uses explicit clinician-name keys; these are documented compatibility semantics rather than independently observed clinic identity.

## Native radiology report generation and section completion — November 17

This supersedes the report-generation feature gap. The recovered extension calls a private `noteGenerateRadiographReport(input:{id})` mutation and receives report text (`sidepanel.b7741352.js:162801–162811,213732–213822`); its backend prompt/model remain unavailable. ToothOps now supplies its own clinical text-generation equivalent through its existing authenticated AI proxy. Exact private-backend output equivalence is not claimed.

- The Images section preserves clinician-entered radiographic findings and adds separate study history, technique/coverage and clinical-question context plus a persisted report draft. Eight optional PatientInfo fields use the existing snapshot/local/cloud/PDF-data storage; older charts work, malformed fields are normalized, and new visits do not carry old study/report/review data.
- AI receives selected documented chart text, excluding generated reports and structured owner contact/attachment data. Six tool-validated sections cover history, technique, findings, recorded impression, recorded recommendations and clinical question. Missing data stays unrecorded; prompts prohibit fabricated normal findings, diagnoses, image interpretation, procedures or plans. No image pixels are analyzed. Output remains subject to clinician review, not a guarantee of model factuality.
- Generated text first appears as an editable proposal. Use draft is explicit, original findings remain unchanged, and undo/discard preserve prior report data. Current chart/source/body/language/auth/permission checks suppress stale operations. Changing language or source invalidates review; copy and standalone multipage PDF require current review. The fixed chart-PDF treatment card continues to print the original findings; the separate report PDF paginates rather than clipping long text.
- PIMS radiology drafts use the same generator with fresh authorized source checks before and after AI. Saved current reviewed chart reports can be reused in their matching language; AI proposals still require explicit application, save and separate PIMS draft review before existing autofill.
- A new radiology_report model/usage feature uses server-selected configuration and the existing authentication, usage reservation/rate limits and AI consent. Admin model selection is localized. Existing English voice prompt/request snapshots and routing behavior remain intact.

No hosted deployment or live AI/provider request was made. The updated ai-autofill and admin-api functions require deployment for the new model feature/configuration to be active in the hosted environment. There is no new database migration for these optional chart-data fields. Implementation, independent reviews and rendered coverage are recorded in `docs/superpowers/plans/2026-11-17-radiology-report-generation.md`.

Final native report-generation validation passes **331 files / 4,364 tests**, including166 PostgreSQL cases; app and development/store extension builds, translation consistency/stamps and diff checks pass. Exact canonical review bases retain approval across JSONB object-key reordering while clinical changes invalidate it. Report/PIMS42 and admin6 targeted visual cases pass. Live model factuality, hosted function deployment and provider interoperability remain unverified; no exact private-backend prompt/output claim is made.

## Findings-first radiology authoring — November 18

Refined the Images report section to mirror ScribbleVet’s publicly documented describe-findings → formatted-report interaction: one primary CodeField for natural-language radiographic findings, optional collapsed history/technique/question, editable generation proposal and explicit apply/review/export. The empty manual editor is collapsed but available without AI. Both UI and shared request builder now require actual radiographic findings; history or a referral question alone cannot generate an interpretation. Validated output omits undocumented optional sections and rejects findings-less responses. Existing saved reports are preserved. No new image interpretation or inferred diagnoses were added.

CoVet’s public catalog lists distinct General Practice, Specialty and Consultation Request radiograph templates, but their exact built-in contents were not accessed. This refinement does not establish exact ScribbleVet private-model output or CoVet template parity. Public references: https://www.scribblevet.com/whats-new and https://help.co.vet/en/articles/14183490-what-templates-are-currently-available-in-covet .

Plan, verification and synthetic visual coverage: `docs/superpowers/plans/2026-11-18-radiology-findings-first.md`. Local preview remains http://127.0.0.1:5205/ . No hosted deployment or live AI/provider call was performed.

## Remaining observed features implementation — November 18

Added the distinct noteAutofill protocol, selected-tab routing, page helper and shared transport. Both app and side-panel send screens now offer source/section review, destination/open-field selection, one-use preparation and explicit patient/encounter confirmation. Edited notes that cannot be split are transferred whole. Auth/source/target changes invalidate preparations; pending operations lock navigation and sibling actions. Unknown outcomes never trigger automatic retry.

Tickets pin document/root/full URL/provider/session/editor/API/title/original content and expiry. CKEditor uses its captured model conversion/insertion; TinyMCE uses its captured focus/selection/insertContent/setDirty API; modern Pulse emits the captured Space/Backspace notifications with guards after every event. Vetspire appends escaped text with input/change notifications. Explicit reinspection creates a fresh source after session changes while old tickets remain unusable. These are local safeguards and compatibility contracts, not evidence that a vendor saved the note.

Instinct capture checks its in-memory bearer/practice/API witness before and after every request and JSON body parse, including rejection paths. It preserves raw IDs and namespaces appointment/visit source IDs; it never substitutes patient numbers or names. Unknown cancellation enums and checked-out/missing rows do not become deletion/cancellation assertions. The confirmation migration retains owner/auth/acknowledgement/revision/audit/run-interruption controls and was applied twice in the disposable DB test.

Evidence: selected inert source ranges in `pulse.b8ec9667.js:139–240,313–347,434–495`, `oldPulse.0d5ec2ea.js:133–201`, `rhapsody.76fff428.js:181–228,471–492`, `vetspire.da474192.js:136–197,443–460`; fresh REA bounded parent `ev_98fb210e2c2f7e1ad69354394d46752df41c2128d8f83f8caacbfa093e1ca550`. Private backend calls were not reproduced as vendor services.

Independent reviews passed for helper/transport, configured Instinct sync and UI. Review reproduced and fixed stale-helper recovery, rejected-request session invalidation, and selected-section removal after manual edits. Final integration checks and exact visual coverage are recorded in `docs/superpowers/plans/2026-11-18-remaining-extension-parity.md`.
