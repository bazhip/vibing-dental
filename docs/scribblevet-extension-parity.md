# ScribbleVet browser-extension parity ledger

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
| Shepherd | `shepherd.a98412a5.js` | Appointment search and SOAP dashboard, Baasic session authorization | SOAP UUID route; section-specific ProseMirror and objective textareas. Creation of a missing physical exam is not established. No image support. |
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
- Pulse's modern writer appends content (`pulse.b8ec9667.js:313`); TinyMCE insertion marks the editor dirty (`:333`). Legacy Pulse clicks Save and immediately returns success (`oldPulse.0d5ec2ea.js:177`). Neither establishes independently readable active clinical identity or persisted-save acknowledgement. Exports remain disabled.
- Rhapsody selects a tab, acquires CKEditor, inserts content and waits (`rhapsody.76fff428.js:201`). Its writable-page banner does not establish identity (`sidepanel.b7741352.js:214588`). No guessed route or editor-instance ID is used to unlock writes. A new bounded REA parse retained parent evidence `ev_7e7c46773435c1abcb4cc97ee8f0f3c555d863307737fd70024b15841b598da7`; unselected sources and truncated semantic relationships remain unknown.
- Source-backed Pulse discovery now covers normalized sidebar headings, Medical Notes, Patient Documents and legacy fieldset destinations. It stays read-only: no Expand clicks, no editor mutation, no save or identity claims, and no image advertisement.
- The manual-transfer component offers section/all text plus HTML and a separate PNG copy. It preserves stored edits (including an empty note), suppresses section actions when edits cannot be split safely, and never stamps a chart as sent. It remains usable when automatic destination verification fails; the extension's practice send flag still applies.
- Text uses existing plain-text/manual-dialog fallbacks. PNG requests are initiated before asynchronous rendering completes, reject malformed/non-PNG data without fetching URLs, and report success only after clipboard completion. Failure and manual-dialog results are not shown as copied. All new UI strings have hand-written en/fr/de/it/es coverage.
- This implements the shared manual-transfer flow, not the providers' unsafe unverified writers. Backend linking, sync/reconciliation, add-record/radiology flows and live paste/save verification remain outstanding.
- Increment verification: 260 test files / 2,771 tests pass; production, development-extension and store-extension builds pass; translation backlog is zero. Store output checks retain the same permissions/hosts and production messaging origins. Independent review passes (162 focused tests). The image-upload UI was not changed.

## Backend foundation — implemented locally, not deployed

The user approved the ToothOps-native backend with browser-assisted synchronization on 2026-11-16. The detailed design is in `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`; the first-increment implementation and verification record is in `docs/superpowers/plans/2026-11-16-pims-sync-foundation.md`. These changes are included in the PR #104 update, not deployed or enabled.

- Implemented authenticated, practice-scoped connections and patient/clinician links, owner-managed configuration, five-minute exclusive sync leases, version baselines, idempotent chunks, persisted outcomes/conflicts and audit records. Database mutations use constrained RPCs; tables expose member-scoped reads only.
- Added an opt-in browser capture contract and coordinator with tenant/revision/freshness checks, keyset-paginated baseline reads, count/byte-aware batches, partial-capture handling and explicit uncertain outcomes. All seven existing adapters still lack the verified `syncSource` implementation required to enable durable sync; display-only imports remain unchanged.
- Cancellation, deletion, unknown status and identity changes become review issues. The foundation alone does not archive visits; the following reconciliation increment adds explicit status-based archiving. Neither creates charts, overwrites clinical notes or silently relinks patients.
- Subsequent increments: provider-specific verified captures/status adapters, connection/link setup screens, historical relinking, automatic outbound Instinct history PDFs, image/document transfers and upload-attempt reconciliation. Persisted history/radiology drafts with manual PDF/copy preparation are implemented below. Manual radiology transfer remains distinct from debugger-assisted autofill parity.
- Verification: 262 test files / 2,838 tests pass, including 35 real PostgreSQL and 32 coordinator tests. Production and development/store extension builds pass, translation backlog is zero, and store permissions/hosts/origins remain unchanged. Independent review findings have regression coverage. The PostgreSQL fixture exercises real transactions/RLS, but full historical migration integration and Supabase Auth/PostgREST/storage validation remain outstanding before hosted rollout.

The continuation traced the outbound Instinct `uploadChartFile` flow and confirmed reconciliation distinguishes explicit cancelled/deleted status from unknown absence. Bounded Instinct REA parent evidence is `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810`, with partial/truncated semantic coverage. The local recovery bundle is `/private/tmp/scribblevet-parity-backend-design-evidence-2026-11-16.json`. No live authenticated PIMS or ScribbleVet service was contacted.

## Reconciliation and review — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-reconciliation.md`. This continues the approved design in the same isolated worktree and is included in the PR #104 update.

- Seals capture completeness and pages reconciliation candidates. Missing appointments require fresh independent status; unknown/partial absence never implies deletion. Active appointments can reschedule outside the original day without changing identity.
- Adds versioned manual archive/restore with actor/reason receipts, plus explicit source cancellation/deletion archiving. Archived visits are not silently restored by subsequent sync; clinical records are not deleted or rewritten.
- Adds shared review UI in practice settings and the extension panel: active/archived/issues filters, pagination, current/proposed comparisons, retain-current and identity-preserving schedule acceptance. Includes five languages and pseudo-locale coverage. Schema-unavailable and unconfigured connections are explicit states, not fabricated success.
- Independent review found cancellation races against manual restore and retain-current decisions. Four real PostgreSQL regressions reproduced them; fixes preserve the capture baseline version and recheck unresolved proposal authorization under the connection lock. Additional regressions cover wrong patient/clinician/encounter/appointment, link versions, stale evidence, uncertain writes and stale-practice UI responses.
- Verification: **265 test files / 2,893 tests pass**, including **61 real PostgreSQL tests**, **41 coordinator tests**, **13 review transport tests** and **7 review UI/pseudo-locale tests**. Production and development/store extension builds pass; translation backlog is zero; store permissions/hosts are unchanged, messaging remains production-only, and debugger permission is absent. Existing chunk-size/dynamic-import warnings remain.
- This is shared engine/review implementation, **not enabled end-to-end provider synchronization**: none of the seven provider adapters supplies `syncSource` yet. Owner configuration/link RPCs have no setup UI. Supabase full-migration integration, rendered-device review and authorized live PIMS verification remain unverified. Persisted manual drafts are implemented in the following increment; automatic attachment/document transfer remains separate.

## Persisted clinical drafts — implemented locally, not deployed

Implementation record: `docs/superpowers/plans/2026-11-16-pims-drafts.md`.

- History and radiology notes persist per saved practice chart, with source fingerprints, optimistic versions, actor-bound idempotency receipts and explicit version-specific review. Source changes and edits invalidate approval. Private charts and removed members cannot use these practice-scoped RPCs.
- Shared web/extension editor supports deterministic composition from the explicitly opened saved chart, manual edits, approval and reauthorized text/PDF export. Radiology composition restates recorded findings; it does not interpret images or call a vendor service.
- Unknown write outcomes retain typed text but require reload before further changes. Access revocation clears cached content; chart/auth changes discard stale results. PDF output rejects unsupported font characters instead of silently altering clinical text; lossless text copy remains available.
- This implements persisted manual preparation, not automatic Instinct upload. Existing saved-chart selection does not aggregate historical records by patient name or imply a verified external link. No PIMS sent-history stamp is written by manual export.
- Synthetic editor screenshots cover five states at 1440/390/320px with no measured overflow or page errors; selected reviewed/unknown/empty/multiple states were visually inspected. Actual modal/panel-parent and live-device coverage is separate; see the implementation ledger.
- Verification after main's UI merge: **286 test files / 3,199 tests pass**, including **77 real PostgreSQL cases**. Production and development/store extension builds pass; translation backlog is zero. Final review was an author self-review, not an independently routed agent review. The drafts are included in the PR #104 update; the following rollout checks supersede these historical totals.

## Release isolation — implemented locally, off by default

The new review/archive and history/radiology draft UI, Send eligibility and web patient-handover
consumption require an explicit `VITE_PIMS_ROLLOUT_ENABLED=true` build. Free beta does not bypass
this boundary. Web Send additionally requires a compatible handshake from the configured extension,
not merely Chrome messaging availability. Legacy, absent and incompatible extensions leave Send hidden.
After rollout opt-in, backend review/manual preparation do not themselves require extension installation.
See `src/extension/README.md` for backend → extension → web release sequencing and
`docs/superpowers/plans/2026-11-16-pims-rollout.md` for verification. Nothing was deployed or enabled.

## Required authorized live verification

Use a non-production/test patient in each practice's authorized environment. Never use this checklist to bypass authentication or record access controls.

1. Capture current URL shape, active patient identifier, encounter identifier, lock state and field inventory. For disabled exporters, establish a stable, independently readable encounter binding before enabling writes.
2. Compare schedule imports against the visible practice calendar: provider filters, cancelled/no-show appointments, checked-in visits, local midnight, both DST boundaries, missing patient numbers, multiple patients and malformed/inaccessible responses.
3. Select destinations explicitly. Append one distinctive test note, reload the PIMS, and verify persistence, exact field, patient and encounter. A DOM mutation alone is not save evidence.
4. Switch patient, encounter, provider/tab and lock state during each asynchronous stage. Confirm no subsequent field is written to the new target.
5. Verify image acceptance and persistence separately. Until established, keep `acceptsImage:false`.
6. Verify handover/account switching, duplicate-import behavior, failure cleanup and no identifiers in URL/diagnostic output.
7. Record sanitized fixtures and assertions for each verified behavior, then remove the relevant blocker from this ledger. Do not describe remaining disabled or private-backend functionality as complete parity.
