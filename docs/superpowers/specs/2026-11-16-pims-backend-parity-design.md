# PIMS backend, record transfer, radiology and image parity

## Status and intent

The user approved a ToothOps-native backend with browser-assisted PIMS synchronization, rather than server-to-server vendor integrations. This document specifies that approach for implementation review; the detailed design is not yet approved and no product implementation is claimed by this document.

Work stays on `feat/pims-extension-parity` in the isolated `9bb5` worktree and draft PR #104. The original checkout belongs to concurrent work. The image-upload UI redesign remains canceled.

The goal is usable, evidence-backed equivalents of the extension's synchronization, reconciliation, archive/restore, record-review export, radiology-note transfer and image transfer. These are several dependent increments, not a single adapter patch. Each increment must have its own passing tests and an honest capability boundary.

## Approaches

1. **Chosen: ToothOps backend plus browser-assisted adapters.** Supabase stores integration links, sync runs, conflicts and clinical drafts. The extension reads/writes the PIMS using the user's existing authenticated browser session. Works with the current architecture; synchronization requires an authorized browser session and cannot promise unattended operation.
2. **Not chosen: server-to-server vendor APIs.** Better for unattended synchronization, but requires separately authorized vendor credentials and documented access. Reverse engineering the browser extension does not supply those credentials or its server implementation.
3. **Not a complete solution: client-only local bookkeeping.** Avoids migrations but cannot provide practice-wide conflict resolution, durable idempotency or consistent archive state across users.

Reconstruct behavior, not ScribbleVet's private service. Do not vendor the proprietary bundle, execute its bootstrap, contact its backend, reproduce its branding, or mistake its generated API definitions for working integrations.

## Evidence and important corrections

Artifact: ScribbleVet extension 1.31.3. Identity and original inventory are recorded in `docs/scribblevet-extension-parity.md`. Source locations below are the extracted readable bundles, not original source files.

| Behavior | Observed evidence | Consequence |
| --- | --- | --- |
| Provider/user linking | `sidepanel.b7741352.js:221605` | External clinician-to-membership mapping is distinct from patient/visit linking. Suggestions must be reviewed, not silently matched by name. |
| Sync phases | `sidepanel.b7741352.js:306181` | Distinguish pulling, saving and reconciling; retain results and reviewable issues. |
| Cancellation/deletion | `sidepanel.b7741352.js:306540` and `:306610` | Explicit cancellations can archive a linked visit. Missing appointments require a status lookup; active appointments resync, unknown ones are skipped. Absence is not deletion. |
| Archive/restore | `sidepanel.b7741352.js:157169` | Reversible visit visibility, not deletion of clinical data. |
| **Add records is outbound** | `sidepanel.b7741352.js:220690`; `instinct.9eb2d42a.js:25119` and `:25224` | Generates a history-review PDF and uploads it to the active Instinct patient's documents. It is not evidence of a general PIMS-history importer. This corrects the initial conversational description. |
| Unsafe details not copied | Same Instinct path | The shipped code hardcodes a location, sets sharing, does not independently compare the selected patient's identity, and its caller has inconsistent success matching. ToothOps must not inherit these behaviors. |
| Radiology | `sidepanel.b7741352.js:213732`, `:213810`, `:213839` | A private mutation generates report notes; Radimal/Vetology helpers transfer them using debugger commands. No image-diagnosis algorithm or private backend implementation is established. |
| Rhapsody images | `rhapsody.76fff428.js:147` | CKEditor FileRepository loader uploads an image and inserts its returned URL. This does not establish patient binding or persistence of the edited note. |

A new bounded REA analysis selected only `instinct.9eb2d42a.js`: parent `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810`, summary `ev_7656a9454b6dcf7eb94d4d244953733518abc551c2392220be41b99a3a696810`. The artifact digest is `51eab8d0307b6acec82701ca2313536f41066361c5b4a10c6fdb82485ac92524`. Semantic coverage is partial/truncated; unselected files and unresolved relationships remain unknown. Exact source inspection supplies the narrowly stated contracts above, not a claim of complete backend recovery.

## Existing application constraints

- `src/extension/pims/types.ts` has seven provider adapters, but no persisted connection identity, appointment-status API or document-transfer contract.
- `Appointment` currently contains an appointment ID, display demographics and clinician name. It does not establish a patient-record ID, encounter ID, provider-user ID or clinic identity. An appointment ID must never become an encounter ID by assumption.
- `src/extension/sidepanel/useTodaysAppointments.ts` reads appointments into memory and suggests charts through `appointmentAction`. Name/number suggestions are not durable, authoritative patient links.
- `src/utils/chartQueries.ts` lists charts without integration identity or archive metadata. Existing charts must remain accessible and unchanged by migration.
- `src/hooks/useAttachments.ts` already provides private chart photos/x-rays, signed URLs and optional original DICOM files. Reuse this storage and UI; do not recreate the canceled uploader or publicly expose originals.
- Chart revisions already protect clinical edits. Integration metadata belongs in separate tables and must not manufacture chart edits or overwrite saved record notes.
- The migration `20261128_access_follows_membership.sql` requires current practice membership for shared records. The existing edge helper `canAccessChart` still has an unconditional creator branch; new integration endpoints must enforce the newer policy rather than rely on that shortcut.
- The manifest has no debugger permission or Radimal/Vetology hosts. This design does not silently add them. Existing text/PNG clipboard controls are the fallback, not a claim of automatic integration.

## Goals, non-goals and safety invariants

### Goals

- Durable practice-scoped sync with retry-safe writes and explicit conflict resolution.
- Confirmed external patient, appointment and clinician links with provenance.
- Reversible archive/restore preserving charts, revisions, attachments and drafts.
- Reviewable history PDFs and radiology-note drafts, with saved versions and explicit export outcomes.
- Selection and transfer of existing chart images to destinations whose capabilities and identity are verified.
- Consistent web/extension UI, formal en/fr/de/it/es translations, pseudo-locale coverage and permission tests.

### Non-goals and anti-goals

- No unattended server-side PIMS polling, credentials copied to Supabase, automatic patient merges, guessed private APIs, automatic radiographic diagnosis, or cloud deployment in this change.
- No automatic chart deletion, clinical-note replacement, public attachment links, or unrequested document sharing.
- No success message based only on a click, HTTP 200, elapsed delay, editor presence or uploaded-but-unattached file.
- No blanket image-support toggle for all providers; DaySmart/Shepherd and other unsupported paths stay unsupported until evidence establishes otherwise.
- No blanket browser-debugger permission. Debugger-based radiology autofill requires separate explicit authorization and a reviewed security design, or a verified lower-permission alternative.

## Backend model and access control

Use additive migrations ordered after the repository's existing migrations (their filenames already extend beyond the working date). Do not rename historical migrations or assume they are deployed. Keep migrations and edge functions deployable independently from UI capability checks.

Proposed entities:

- `pims_connections`: practice, provider, approved tenant/clinic discriminator, canonical allowed origin, optional provider location, lifecycle state and revision. Owners configure connections; members can use active connections. Reusing a host alone is insufficient for multi-tenant systems. Without an independently readable clinic discriminator, owner confirmation creates only an unverified configuration: browser display/manual preparation remains available, but persisted source sync, cancellation archiving and automatic clinical transfer remain disabled. Confirmation cannot substitute for detecting a same-origin tenant switch.
- `pims_clinician_links`: connection + stable external clinician ID to a current practice member; versioned and owner-managed. Unmapped clinicians create reviewable issues; do not attribute a clinical record to the importing user as if they authored it.
- `pims_patient_links`: connection + external patient-record ID, confirmed internal patient key, match evidence, actor and version. Treat internal patient keys as an integration grouping, not a migration of legacy chart grouping. Legacy name/number matches remain candidates requiring confirmation. No opaque ID means no automatic link.
- `pims_visits`: connection + external appointment ID, patient link, optional independently observed encounter ID, source schedule metadata, source fingerprint, version, last-seen run and archive metadata. Optional chart association uses a chart in the same practice and confirmed patient group. Importing a schedule does not create blank clinical charts automatically.
- `pims_sync_runs` and per-item outcomes: request UUID, canonical payload hash, actor, connection, requested local date, explicit timezone, window instants, capture status, phases, counts and terminal result. Do not retain authentication headers, raw HTML or unrelated patient payloads.
- `pims_sync_issues`: stable deduplication key, involved entity versions, minimal proposed/current values, reason, resolution and actor. Only permitted members can resolve chart/visit issues; owner-only clinician/connection changes remain owner-only.
- `pims_transfer_drafts`: chart/patient link, kind (`history_review` or `radiology_notes`), language, source references and source revisions/hashes, clinician-edited content, generation/review state and optimistic revision. Drafts do not mutate the chart automatically.
- `pims_transfer_attempts`: immutable target descriptor, draft/image version, operation UUID, content hash, phase, outcome and acknowledgement metadata. Record only bounded codes/IDs; no signed URLs or bearer credentials.

All connection-related rows carry a practice ID with database-enforced consistency across foreign keys. Enable RLS and reject cross-practice references even for otherwise valid UUIDs. Direct authenticated mutations are restricted to approved RPCs/edge routes; service-role paths must recheck current membership and role inside the transaction. Security-definer functions have fixed search paths, minimal grants and no caller-selected actor IDs. Removed members cannot read or act on former practice integration rows. Private charts are not automatically published into practice sync: sharing remains a separate explicit existing action.

Audit actor, timestamp, reason and before/after versions for link, archive and resolution mutations. Attribution never grants access. Recheck chart and attachment access on signed-file retrieval and before a transfer starts.

## Synchronization and reconciliation contract

### Capture boundary

Extend the browser protocol with a versioned sync capture distinct from the existing display-only appointment response. Include provider, connection identity evidence, requested window, observed timezone, capture timestamp, completeness (`complete`, `partial`, `unknown`), stable appointment/patient/clinician IDs when evidenced, active entries, explicitly cancelled IDs, and per-item failures. Never infer completeness from `failures.length === 0` or a short/empty page.

Adapters may separately expose bounded status lookup returning `active` with current schedule, `cancelled`, `deleted`, or `unknown`. A 404, auth error, timeout or missing GraphQL edge is unknown unless a source-backed contract distinguishes deletion. Preserve current appointment-list behavior for providers without the richer contract; do not fabricate IDs to unlock sync.

### Transaction and concurrency

1. An authorized member starts a run for one verified active connection and bounded date/window **before** the browser reads the PIMS. Validate payload size/count and timestamps before database work. Recheck source origin/tenant in the extension at capture and submission.
2. The server binds the start-request UUID to a canonical scope hash, actor and connection. Each submitted chunk/status batch has its own idempotency key and normalized payload hash. Identical retries return the existing result; key reuse with different content is rejected.
3. Serialize commits for the same connection using a database lock. Starting a run obtains an exclusive, server-issued capture generation and five-minute absolute lease; another run cannot start until completion, expiry or explicit abandonment. Reads must happen after that generation is issued, not use cached captures. Late/expired/superseded submissions are rejected and require fresh capture; an interrupted run cannot resume after another generation commits. Bind status responses and chunk writes to their baseline item/link versions. Prefer vendor revisions when observed; without them, freshness means an authorized fresh browser observation, not proof of the vendor's global latest state. Partial capture results may update individually valid, non-conflicting items but cannot authorize absence reconciliation.
4. Upsert by connection + appointment ID, not patient name or number. Patient/clinician changes involving established links become conflicts. Keep source schedule metadata separate from user-authored clinical content. Compare stored revisions before applying any resolution.
5. Explicit cancellations archive the integration visit, with reason and audit. Absent IDs are candidates only after a complete, matching-scope capture and independent status lookup. Unknown statuses leave data unchanged and appear as skipped issues. Active rescheduled entries update schedule metadata after their patient/connection is validated; window movement is not deletion.
6. Return per-item applied/unchanged/conflict/skipped/failed results and a terminal run state. Support resumable bounded chunks with persisted cursor and idempotent item keys; never imply a multi-request run is one global atomic transaction. A browser disconnect leaves a resumable or interrupted run, not an invented success.

Browser observations are not signed vendor attestations. Store their provenance honestly, enforce user authorization, and limit their effects to integration metadata. Automated archive affects schedule visibility only, never destroys or suppresses the underlying chart in the clinical library.

### Conflict and archive behavior

Conflicts present current and proposed identity/schedule/link values and explain why they differ. Actions are retain current, accept safe source metadata, or explicitly relink after selecting a verified patient/chart. Resolution requires expected versions; concurrent edits return a conflict instead of last-write-wins. Dismissal does not silently approve future identity changes.

Manual archive is reversible and records actor/reason. Sync cannot silently restore a manually archived visit. Explicitly reactivated source visits previously archived by reconciliation can be offered for restore; default to review, preserving authored work. Archived integration visits appear in an archive filter; original charts/revisions/attachments remain in their existing access-controlled library. This distinction must be visible in UI wording.

Patient-link corrections are versioned and prospective, never cascading updates of clinical history. Existing visits/chart associations/drafts retain the version of the link under which they were confirmed and are flagged for review if that link is superseded. Moving an existing association requires an explicit per-visit/chart review and invalidates dependent draft approvals; it never rewrites the chart's clinical content. Owners may explicitly assign external patient records to an existing internal group only after reviewing each identity; name similarity cannot merge groups. Ordinary users may propose such corrections but cannot override an owner-managed identity mapping.

## Record-review and radiology workflows

### History review / Add records

Build a review draft from clinician-entered text and explicitly selected, authorized ToothOps chart notes belonging to the confirmed patient link. Show each source, date and revision; never sweep up all name-matching charts. Support manual source references as user-provided attribution, without fetching arbitrary URLs. The private ScribbleVet document-ingestion/summarization backend is not recovered; general document ingestion is not advertised as implemented by this workflow.

The clinician edits and approves the draft, then downloads a ToothOps-labelled PDF or requests an available automatic document export. Generated output preserves literal clinical values, dates and source attribution; render escaped content with existing PDF utilities, not foreign HTML. Source changes invalidate review and require reconfirmation. Saving a draft does not stamp PIMS sent history.

Instinct is the first evidenced document target. Its observed multipart `uploadChartFile` contract is a candidate, not a guarantee. Independently confirm active patient, clinic/location, endpoint allowlist and chosen sharing policy. Do not copy the shipped `locationId: "1"`, `isShared: true`, or ScribbleVet source label. An unknown location or sharing contract keeps automatic upload unavailable; PDF download remains available. Validate GraphQL errors and returned document/patient identity, and preserve an ambiguous timeout as unknown rather than retrying an upload blindly.

Document export is patient-level (`visitId: null` in the observed flow); it must not stamp an unrelated encounter as sent. If future visit-linked document export is offered, require a separately observed encounter binding and explicit selection.

### Radiology-note drafts

Create a clinician-reviewable report-note draft from selected chart history and existing radiographic findings, not image interpretation. First provide a deterministic, editable, source-labelled report-note composition; private AI generation is not reproducible from the client bundle. Optional text-only AI rewriting is a later gated enhancement using ToothOps' existing authenticated, metered AI boundary, explicit opt-in and server-selected models. No new external AI provider or unrequested image upload.

Store the draft language and source revisions. Require explicit review before transfer and invalidate review on relevant source changes. Offer copy/download in both supported surfaces. Radimal/Vetology automatic autofill remains a separate capability: their observed debugger implementation and domains are not in current permissions. Do not enable or claim it until identity, supported frame/editor access and permission requirements are resolved. Autofill must never submit a radiology order or request a paid interpretation.

## Broader image and transfer contract

Extend the transfer model to distinguish note text, chart PNG, existing attachment image and history PDF. Build immutable transfer targets that include connection, patient, optional required encounter, field/document destination and document generation. Keep document upload acknowledgement distinct from note persistence acknowledgement.

For images, let users select existing authorized photo/x-ray attachments or the existing chart rendering. Retrieve private bytes through the existing storage/auth boundary, validate MIME/signature, impose byte/dimension limits and explicitly preview any conversion. Never fetch caller-provided arbitrary URLs, send original DICOM by default, expose signed URLs to PIMS fields or treat a thumbnail as the original diagnostic image. DICOM-derived previews must be labelled previews; original DICOM export remains unsupported unless separately specified.

Use explicit phases: prepared, uploading, inserted, save-confirmed, failed, outcome-unknown. Only verified final acknowledgements can mark an automatic transfer successful. Recheck target identity after every asynchronous step and before upload/insertion/save. If context changes after a remote upload, stop without insertion; retain a cleanup-needed/unknown outcome rather than deleting an unfamiliar remote asset. Never automatically repeat a possibly completed upload or append operation.

An unresolved unknown outcome blocks a new automatic attempt for the same connection, patient/encounter, destination and content hash, even under a new operation UUID. A supported readback can resolve it as confirmed-present or confirmed-absent; only confirmed absence unlocks an automatic retry. A clinician may record a manual observation with actor/time and mark the issue reviewed, but that is not a verified-save acknowledgement and must not stamp automatic sent history or unlock a duplicate automatic upload. Where readback is unavailable, leave the automatic operation blocked and offer explicitly manual copy/download with a duplicate warning. A changed payload does not silently resolve the old unknown attempt.

Initial automatic-image work extends verified ezyVet image-capable fields. Rhapsody's CKEditor loader is an evidenced implementation candidate, but remains gated until independent patient/encounter binding and note persistence are established. No automatic images for providers that only support text or whose writers contradict their advertised capabilities. Clipboard/download fallbacks are separately labelled manual actions.

## Screens and user-visible flow

Reuse the existing application styling and shared components; do not redesign image upload.

```text
Connections (owner): provider + clinic -> verify -> map clinicians
Today's patients: Pull -> Save links/visits -> Reconcile -> Results
Results: Updated / Unchanged / Needs review / Skipped -> Review issues
Visit: Open chart | Archive -> Archived filter -> Restore
Chart transfer: Note | History review | Radiology notes | Existing images
Draft: Select sources -> Edit -> Review -> Copy / Download / verified Send
```

The web app can inspect runs, resolve issues, archive/restore and prepare drafts without a PIMS tab. Browser capture and automatic transfer require the extension and an authenticated supported target. Show capability absence, partial sync and unknown outcomes explicitly. Unsupported schemas/deployments disable new actions with a translated explanation; do not fall back to unsafe local writes. Preserve the existing practice send gate; connection creation/changes require owner authority. All strings and plural forms follow repository translation rules.

## Delivery order and verification

1. **Foundation:** connection/identity schema, membership-safe RPC boundary, adapter capture/status contracts, idempotent sync engine and results. Do not attach later flows to legacy name matching.
2. **Reconciliation and archive:** conflict resolution, audit, archive/restore and filters in web/extension. Preserve charts and revisions.
3. **History records:** persisted reviewed drafts, source selection, PDF download and guarded Instinct document capability when evidence prerequisites are satisfied.
4. **Radiology notes:** persisted deterministic editable drafts, review/invalidation and manual transfer. Explicitly report automatic Radimal/Vetology permission/identity limitations.
5. **Images:** existing attachment selection, validated bytes, ezyVet transfer and evidence-gated additional adapters. No unsupported provider advertised as complete.

The backend model, transaction/RLS behavior and usable review/archive/draft screens are required implementations, not optional scaffolding. Provider acceptance is tracked separately:

| Capability | Required delivery boundary |
| --- | --- |
| Rich sync for the seven named PIMS | Investigate and implement each provider's evidenced identity/capture contract. A provider with unresolved clinic/patient identity or completeness stays explicitly blocked; the shared engine passing tests does not complete that provider. Existing display-only appointment imports remain available. |
| Reconciliation status lookups | Required before absence-based reconciliation is enabled for a provider. Missing status support permits only individually confirmed events, not inferred deletion; mark that provider's absence-reconciliation capability incomplete. |
| Instinct history PDF upload | Required for **automatic Add records parity**. Until location, sharing, identity and response/readback contracts are established, the PDF preparation/download increment can ship separately, but automatic Add records remains blocked, not complete. |
| Existing attachment export to ezyVet | Required automatic-image implementation using the existing guarded writer and supported image fields; validate target changes, insertion/save acknowledgement and existing attachment retrieval. If save proof is insufficient, retain a non-success outcome and report that gap. |
| Rhapsody image export | Required investigation and implementation when its identity/persistence prerequisites are available; a disabled candidate is not automatic-image parity. |
| Radimal/Vetology autofill | Deferred permission/identity boundary under this design. Editable radiology notes and manual transfer do not count as automatic autofill parity. |

Do not declare the overall requested parity project complete until the provider requirements above are resolved or the user explicitly accepts a narrower scope. A blocked provider does not prevent committing and testing independently useful, accurately labelled increments.

Each increment requires tests before implementation, focused regressions, shared/UI integration tests, new-screen pseudo-locale tests, and a security review of its write boundary. Required regression cases include cross-practice references, removed membership, private-to-practice leakage, duplicate requests, reused request IDs with changed payloads, concurrent/out-of-order runs, partial/empty feeds, pagination/DST/window mismatch, unknown deletions, patient collisions, source revision changes, restore races, GraphQL 200 errors, target changes during upload and ambiguous network outcomes.

Validate migrations/RLS/transactions against an isolated local Supabase/Postgres instance when available; string assertions and mock tests are not sufficient evidence of database isolation. If no local database is available, report database integration validation as outstanding and keep deployment gated. Do not use production data as a test fixture.

Before each commit: `npm test` and `npm run build`. Before a feature increment is ready: development and store extension builds, translation backlog check, manifest/bundle assertions, independent review and updated parity ledger. Keep PR #104 draft. No deployment, merge or live clinical write is authorized by approving this design. Live verification requires an authorized non-production patient/account and confirms import, write, reload/persistence, archive/restore and permissions per provider.

## Decisions left to implementation

The builder review raised clinic-confirmation authority, provider completion boundaries, capture freshness, historical relinking and unknown-upload recovery. The conservative rules in this document resolve those as proposed engineering choices; they are not claims that the user independently specified those details. No additional browser permission or relaxation of data safety is proposed.

The builder may choose bounded batch sizes, internal module names, pagination helpers and accessible component layout consistent with existing patterns. They may not relax membership, tenant/identity, manual-review, persistence or permission gates. If further artifact tracing changes a feature's meaning, record the evidence and adjust the design before implementing that changed behavior. Report completed capabilities and remaining blockers separately rather than treating fallback-only paths as full automatic parity.
