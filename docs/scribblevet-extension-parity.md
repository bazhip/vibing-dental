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
- Patient numbers have no persisted provider namespace in existing charts. New-provider numbers must not alone select a differently named chart or bypass confirmation. Appointment matching additionally checks patient and owner names.
- Failed/malformed reads return error codes or per-appointment failures, not an apparently successful empty schedule.
- API tokens remain in the PIMS page context and are not stored in ToothOps. Appointment data is returned to the user-visible extension in memory; starting a ToothOps chart uses the existing tab-bound, expiring, account-checked handover.
- Diagnostics exclude patient names, identifiers, encounter URLs and authorization material.

The ezyVet import fixes also enforce Day-view readiness before choosing a date, reject unchanged/partially stale appointment nodes after a date refresh, preserve local wall time across daylight-saving transitions, and store a handover before navigating its new ToothOps tab. A refreshed empty day is conservatively rejected because the inspected DOM exposes no independent completion signal; an already displayed empty day can still be read. The ezyVet writer rechecks the captured encounter between asynchronous stages and reentrant editor events, including before saving.

## Broader features found, not a parity claim

| Feature area | Static evidence | Boundary |
| --- | --- | --- |
| Copy plain text, HTML and PNG; copy all sections | `sidepanel.b7741352.js:202494`, `:212598` | Compare formatting and clipboard behavior separately; not proven equivalent by adapter tests. |
| Section mapping, expansion, add/copy actions and dental images | `sidepanel.b7741352.js:212973` | ToothOps has its own record-note mapping and dental images; identical output is not established. |
| Canine/feline drawing and local note formatting | `sidepanel.b7741352.js:181430`, `:181514`, `:181557`, `:192098` | Functional overlap, not pixel or behavioral equivalence. |
| Note/visit associations and archive/unarchive | `sidepanel.b7741352.js:150510`, `:157168` | Uses ScribbleVet private backend; requires a separately specified ToothOps equivalent. |
| Provider linking, sync conflict resolution and progress | `sidepanel.b7741352.js:221605`, `:224120`, `:224430`, `:224824`, `:306181` | Browser UI plus private backend operations, not standalone content-script functionality. |
| Cancelled/deleted visit reconciliation | `sidepanel.b7741352.js:306540` | Backend mutation/archive semantics; not implemented by a schedule reader. |
| Native PIMS, microphone/AI authoring, charge capture/billing | Not established by the bounded inspected entry points | Unknown, not absent. A generic browser API wrapper or generated enum is insufficient evidence. |
| Add records and radiology | `sidepanel.b7741352.js:220650`, `:213732` | Partially traced only; inventory remains open. |

## Local verification — November 16, 2026

- `npm test`: 257 test files, 2,673 tests passed.
- `npm run build`: passed (translation checks, lint, TypeScript and production bundle).
- `npm run build:extension` and a separate store build: passed. Manifest checks confirm the expected permissions and messaging origins, and both page bridges are bundled.
- Offline translation check: `todo=0 remove=0`. All five UI catalogs are updated.
- Adversarial fixture review found and closed asynchronous ezyVet patient switches, premature DaySmart save acknowledgement, incomplete Shepherd provider pagination, and malformed Pulse tooltip imports. This is local evidence, not authorized live-service validation.

## Required authorized live verification

Use a non-production/test patient in each practice's authorized environment. Never use this checklist to bypass authentication or record access controls.

1. Capture current URL shape, active patient identifier, encounter identifier, lock state and field inventory. For disabled exporters, establish a stable, independently readable encounter binding before enabling writes.
2. Compare schedule imports against the visible practice calendar: provider filters, cancelled/no-show appointments, checked-in visits, local midnight, both DST boundaries, missing patient numbers, multiple patients and malformed/inaccessible responses.
3. Select destinations explicitly. Append one distinctive test note, reload the PIMS, and verify persistence, exact field, patient and encounter. A DOM mutation alone is not save evidence.
4. Switch patient, encounter, provider/tab and lock state during each asynchronous stage. Confirm no subsequent field is written to the new target.
5. Verify image acceptance and persistence separately. Until established, keep `acceptsImage:false`.
6. Verify handover/account switching, duplicate-import behavior, failure cleanup and no identifiers in URL/diagnostic output.
7. Record sanitized fixtures and assertions for each verified behavior, then remove the relevant blocker from this ledger. Do not describe remaining disabled or private-backend functionality as complete parity.
