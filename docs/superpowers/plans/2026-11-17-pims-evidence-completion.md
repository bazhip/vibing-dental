# PIMS evidence completion — November 17

Continue the approved backend-parity design on `feat/pims-extension-parity`, from `1379a5c`. Do not modify the other checkout, enable rollout, deploy migrations, add debugger permissions or claim provider persistence from editor mutation.

## Work allocation

- Main: saved-image evidence and unknown-image review SQL, database regression tests, integration and verification.
- Boole: read-only shipped-artifact trace for missing durable-sync clinic/session identities.
- Lovelace: read-only Instinct location/readback and radiology transport trace.
- Bacon: read-only Pulse/Rhapsody/Vetspire encounter and persistence trace.
- Rawls: image-mode client validation and reuse of the existing manual upload review UI, translations and focused tests.
- Popper: implement the evidence-backed DaySmart/Shepherd/Pulse display-reader session guards and regression tests.
- Locke/Poincare: independent SQL/client/UI and provider-guard reviews; no provider access or enablement.

## Implementation contract

Unknown image attempts need the same manual observation workflow already supplied for history PDFs. Reuse the existing review layout: disclosure, destination/source, prior observation, observation selector, reason, acknowledgement and one save action. The image variant displays the encounter and field instead of a PDF location/draft. It is available only under the existing rollout gate, reads lazily and resets across chart/auth/mode changes.

Add `pims_image_review_page` and `pims_record_image_observation`, with the same request and observation-response shapes as the PDF equivalents. Image rows carry `kind: image`, the durable attempt identity, encounter, destination, document generation and image ID. Authorize current chart/practice access before replay, serialize updates, paginate by attempt UUID and retain observations as append-only records with actor, timestamp, request digest and expected review version. Manual present/not-found/uncertain observations never change transfer state, confirm persistence, mark sent, or unlock another dispatch.

## Completion checks

- [x] Trace each remaining provider gap to exact shipped-artifact evidence; implement only supported deltas.
- [x] Reproduce unknown-image review gaps with failing database and client/UI tests.
- [x] Implement and independently review image review authorization, concurrency and mode isolation.
- [x] Run full tests with disposable PostgreSQL, app/extension builds and translation checks.
- [x] Inspect actual review UI at desktop and 320/390px phone widths.
- [x] Record exact remaining evidence requirements without representing static tests as live interoperability.

## Verification — November 17, 2026

- Initial image review database tests: 17 failures for missing RPCs before implementation, then 17 pass. Added pagination, privilege, historical source deletion and cross-connection request reuse coverage: 22 pass. Migrations apply twice in the fixture.
- Independent SQL review found a cross-connection same-request race. A delayed-insert concurrent test reproduced a raw unique-key error before the fix. The RPC now locks the request ID after authorization and before receipt lookup; the loser receives `pims_idempotency`, with one observation/audit event. The test uses an insert delay rather than a deterministic scheduling barrier, so overlap is encouraged, not guaranteed in every future run; the failing pre-fix run was observed.
- Final independent SQL re-review: PASS after independently running all 22 image-observation DB cases, including migration replay, and inspecting the reproduced RED. No blocking defect remains in that scoped review; hosted Supabase remains unverified.
- UI/client worker verification: 150 focused tests pass; independent UI/client review ran 156 tests including rollout tests, plus translation/type/lint checks, and found no actionable defect.
- Provider guard TDD: 31 failing regressions before changes; 151 tests pass afterward. Independent review reproduced 151 tests and all 330 provider tests. Guard code adds no clinic identity, capabilities, permissions or credential-bearing result fields.
- Combined final `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **317 files, 3,847 tests pass**, including **153** PostgreSQL tests. Log: `/private/tmp/pims-evidence-full-tests.log`.
- `npm run build`, `npm run build:extension`, `npm run package:extension`: pass. Production build includes translation validation, ESLint and TypeScript. Store packaging checks pass without new hosts/debugger permission. Existing chunk-size/dynamic-import and test-environment canvas/localStorage warnings remain non-fatal.
- All 12 new non-English strings are hand translated/stamped; translation backlog check reports `todo=0 remove=0`.

### Rendered review scope

The existing PDF review interaction is reused, not redesigned: explicit disclosure, read-only target metadata, observation/note/acknowledgement, and a single record-observation action. The UI uses the existing teal/neutral clinical controls and focus styles.

| Surface | Widths | Synthetic states exercised and captured |
| --- | --- | --- |
| Web Send dialog | 1440, 390, 320 | One attempt with prior observation/long identifiers, multiple attempts, empty page, successfully recorded observation |
| Extension ChartSend layout | 1440, 390, 320 | Same four states |

Chrome exercised 18 initial-state cases plus 6 save continuations, generating 24 screenshots with no page errors or horizontal overflow. Review controls meet the existing 44px minimum; opening is lazy, saving issues one observation RPC, and no retry/confirm button or sent stamp is introduced. Representative screenshots were visually inspected for both surfaces at all three widths, covering populated/multiple/empty/saved states and keyboard focus. This is a targeted component review, not a full-app UI review or live-extension/provider session.

Harness: `/private/tmp/pims-image-review-visual.cjs` (run with and without `--panel` against opt-in local Vite port 5198). Screenshots: `/private/tmp/pims-image-review-{panel-}{width}-{image,image-many,image-empty,saved}.png`. Auth, extension transport, source images and review RPCs are synthetic local fixtures; external requests are blocked. Browser errors during harness setup came from a label selector, corrected against the actual accessibility tree to use the existing combobox role.

## Continued implementation — provider import normalization

Continue the approved backend parity design without expanding extension permissions or rollout. Preserve all preceding uncommitted work.

- DaySmart worker: reconcile cancellation in the detail response and successful-absence history lookup; failed reads never imply absence.
- Pulse worker: match the shipped visit-read request/response contract, keeping bounded concurrency and sticky session invalidation.
- Main session: preserve distinct Shepherd SOAP/appointment source identity, recover custom patient identifiers, owner names and supervising-doctor names from the observed fields, and avoid row-key collisions.
- Independent verifier: review actual changes against artifact evidence and exercise regression tests.
- Integration: full test suite with the disposable database, production/extension builds, translation/package checks; record actual results.

Review focus: canceled rows after a stale feed; malformed or failed detail responses; token changes during fallback reads; identical SOAP/appointment IDs; missing owner/provider/custom-identifier fields without invented linkage.

### Review corrections

- Shepherd: the first implementation copied ScribbleVet's owner-surname suffix into patient names. Independent review reproduced loss of existing-chart matching. Keep ToothOps' existing patient name unchanged, retain owner name separately, and test both Open chart and New visit against existing records.
- Pulse: independent review rejected numeric coercion, acceptance of unrecognized visit HTML, and stale calendar timestamps after a live reschedule. These require strict identity/date validation, not a passing synthetic happy-path fixture.
- Pulse live assignments: selected resource/employee controls override stale feed/tooltip assignments. Explicit removal does not restore the old clinician; only entirely absent assignment controls retain the legacy fallback. Nine observed regression failures became 157 passing focused tests after this correction.
- Patient-list rendering: the actual appointment-row padding/border exceeded its 100% content width by 22px, causing 6px viewport overflow inside the panel container. Apply border-box to the owning `.sp-appt` rule. No label or action redesign.

### Continuation verification — November 17, 2026

- Final full suite after the live-assignment correction: `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test` exits zero, **317 files / 3,998 tests pass**, including the disposable PostgreSQL suite. Log: `/private/tmp/pims-import-full-tests.log`.
- Final `npm run build`, `npm run build:extension`, `npm run package:extension` and `git diff --check` chain exits zero. Logs: `/private/tmp/pims-import-build.log`, `/private/tmp/pims-import-extension-build.log`, `/private/tmp/pims-import-package.log`. Existing non-fatal chunk-size/dynamic-import and test-environment canvas/localStorage warnings remain.
- Translation backlog: `todo=0 remove=0`, recorded in `/private/tmp/pims-import-i18n.log`.
- DaySmart independent review: PASS, with 82 tests rerun. Shepherd independent review: PASS, with 93 tests including existing-chart matching rerun.
- Pulse final independent review: PASS; reviewer separately ran all 157 focused tests both in the default timezone and with `TZ=America/New_York`. No blocking issue found in the scoped review; live Pulse behavior remains unverified.
- Actual `TodaysPatients` rendering with mocked transport/chart data: nine captured states (single, multiple and empty at 1440/390/320px), all without horizontal overflow. Inspected 320px multiple/empty, 390px single and 1440px multiple screenshots. Harness: `/private/tmp/pims-patient-import-visual.cjs`; result log: `/private/tmp/pims-patient-import-visual.log`. This is scoped rendering verification, not live-provider interoperability or a full-app UX review. Existing action heights are unchanged; development HMR websocket warnings are excluded from the harness console check.

## Remaining runtime boundary

### Saved-file verification follow-up

The requested Instinct/ezyVet upload follow-up continues the approved verified-target and saved-content design. Split ownership: main session owns image-transfer confirmation and integration; Carson traces Instinct session/file operations; Archimedes owns its upload verification/tests; Kant independently reviews each changed boundary. Do not substitute a caller-supplied hash or editor state for saved bytes.

- Image readback now requires the exact resource ID returned by the write and a byte buffer matching the reviewed PNG's length and locally computed SHA-256. Capture the write resource ID before asynchronous checks; mutable receipts cannot redirect confirmation to another resource. Recheck destination, expiry and caller liveness after hashing. Bytes are not included in the confirmation RPC.
- TDD evidence: seven false-confirmation regressions fail before byte/resource checks and pass afterward; a separate mutable-receipt regression fails before pinning the resource ID. All 35 image-transfer tests pass, including destination/liveness/expiry changes during hashing.
- Instinct's bounded follow-up trace checked upload imports, session parsing, active-user/calendar/board queries and the sidepanel membership-based practice ID. It recovered no usable active-location or independently downloadable saved-file contract. `readFile` now requires actual returned PDF bytes, exact length/header and local SHA-256 verification. It snapshots the requested hash and returned file ID, rechecks target/session/expiry after hashing, and returns only receipt identity/hash fields. It does not expose file bytes or arbitrary observer metadata. This is not a production observer.
- Instinct TDD: 25 failures before the readback changes, then all 36 tests pass. Includes malformed/missing/forged bytes, mutable request/readback/file IDs and identity/session/expiry changes during hashing. Logs: `/private/tmp/instinct-upload-red.log`, `/private/tmp/instinct-upload-green.log`. TypeScript exits zero; focused production-file lint has no errors (test file ignored by the lint configuration).
- Independent final reviews: PASS for both scopes, separately rerunning 35 image-transfer and 36 Instinct-upload tests. Five-file UI/upload integration run passes 110 tests (`/private/tmp/pims-readback-integration.log`). App, extension and store-package builds exit zero (`/private/tmp/pims-readback-build.log`, `/private/tmp/pims-readback-extension.log`, `/private/tmp/pims-readback-package.log`), retaining existing non-fatal chunk/dynamic-import warnings. No UI behavior or translations changed in this follow-up.
- Final full suite: `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test` exits zero, **317 files / 4,038 tests pass**, including PostgreSQL tests. Log: `/private/tmp/pims-readback-full-tests.log`. Changes remain local/uncommitted; rollout and provider enablement remain unchanged.
- ezyVet's inspected HugeRTE path inserts a PNG data URL and sets dirty state; the companion Jaxmanager patch intercepts requests but does not establish a saved-image read operation. There is still no recovered clinic/encounter-bound saved-resource fetch to wire into `readSaved`. No authenticated provider session or matching sanitized runtime capture has been supplied to this task, and connector discovery returned no ezyVet/Instinct plugin.

The static investigations and supported implementation deltas are completed for this pass. **Full automatic provider parity is not established.** Exact artifact paths and missing contracts are recorded in `docs/scribblevet-extension-parity.md` under the November 17 section. Authorized test-provider sessions or sanitized runtime captures are required for the missing clinic/encounter witnesses and saved-note/file readback; Radimal/Vetology also need separately approved access. No guessed production binding, new permission, schema deployment or rollout change is made, and no commit/push is performed in this pass.
