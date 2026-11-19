# PIMS foundation database checks

These tests execute the PIMS backend migrations and real RPCs on PostgreSQL, including RLS,
grants, cross-practice foreign keys, member removal, idempotency, capture leases,
concurrent starts and stale/version-conflicting schedules. No vendor service,
production database or clinical record is used.

Use a **disposable** container whose name starts with `toothops-pims-` and a database
named `pims_test`. The bootstrap **drops and recreates the public and auth schemas**
in that database. Never point this at a retained development database. The fixture
supplies the preexisting `auth.uid()`, practices, memberships, a minimal charts table and membership helper;
it does not simulate the complete Supabase Auth/PostgREST/storage deployment.

```sh
docker run -d --name toothops-pims-foundation --network none --memory 256m \
  -e POSTGRES_PASSWORD=local-test-only postgres:16-alpine
docker exec toothops-pims-foundation pg_isready -U postgres
docker exec toothops-pims-foundation createdb -U postgres pims_test
PIMS_TEST_CONTAINER=toothops-pims-foundation npm test -- scripts/pims/foundation.db.test.ts
docker stop toothops-pims-foundation
docker rm toothops-pims-foundation
```

Wait for `pg_isready` to succeed before creating the database. The test bootstrap
is repeatable, and each migration is applied twice to check replay safety. Without
`PIMS_TEST_CONTAINER`, the database suite is explicitly skipped, not mocked or
reported as passed. The normal unit tests still run.

## Delivery boundary

The migration exposes authenticated RPCs with one `payload` JSON argument:

- Owners: `pims_configure_connection`, `pims_verify_connection`,
  `pims_confirm_patient`, `pims_link_clinician`.
- Members: `pims_start_sync`, `pims_sync_baseline`, `pims_submit_sync`,
  `pims_seal_capture`, `pims_reconcile_candidates`, `pims_reconcile_status`,
  `pims_finish_sync`. Run data belongs to the initiating member; another member
  cannot submit or finish it. Reads remain practice-scoped.
- Review: `pims_review_connections`, `pims_review_page`, `pims_review_visit`,
  `pims_resolve_issue`. Current members can archive/restore with a reason, retain
  proposals or accept schedule-only changes without changing patient identity.
- Drafts: `pims_draft_context`, `pims_draft_write`, `pims_draft_export`. Current
  practice members can save history/radiology notes from an explicitly selected
  saved practice chart, review its exact version, and authorize manual export.
  Source changes invalidate approval; private charts and removed members are denied.
- Owner setup: `pims_setup_context`, `pims_setup_page`, `pims_link_chart`.
  Configuration is lazy and primary-owner-only in practice settings. Link inventory
  uses 50-row keyset pages. Explicit historical chart association/relink requires
  current chart source hash, link version, confirmed external patient ID and reason;
  it does not regroup charts, rewrite clinical data or resolve schedule identity conflicts.
- Uploads: `pims_prepare_upload`, `pims_dispatch_upload`, `pims_confirm_upload`.
  Dispatch is consumed before a provider write; unknown outcomes remain blocked.
- Upload review: `pims_upload_review_page`, `pims_record_upload_observation`.
  Current members can append manual observations, never overwrite history or
  authorize a duplicate retry through a manual observation.
- Saved images: `pims_prepare_image_transfer`, `pims_dispatch_image_transfer`,
  `pims_confirm_image_transfer`. Exact reviewed content is bound to the source chart,
  attachment snapshot, connection, encounter and destination. Unknown outcomes block
  duplicates; only expired preparations that never dispatched can obtain a new attempt
  ID. Replays reauthorize current chart access. Automatic UI remains gated on an
  independent provider target and saved-content observer.

All functions use the caller's authenticated JWT; do not use service-role tokens.

An automatic saved-image provider must independently implement `readTarget`,
`readTargetNow`, `write` and `readSaved`. `readTargetNow` reads the live binding
synchronously, never echoes the expected input or returns a cached asynchronous
observation. `write` dispatches synchronously against that binding and returns
`{ receipt: Promise<...> }`; it must not defer the target-affecting mutation or
initiation behind another await. Only acknowledgement/readback may settle later.
Adapters that need asynchronous preparation must finish it before the coordinator's
final source and target checks, not inside `write`. No current production binding
implements this contract, so automatic saved-image UI is not enabled.

Do not pass an actor ID. Client RPC errors are retained as bounded internal codes,
not raw server details. The shared review screen is available in practice settings
and the extension panel; it loads only when opened and explains unavailable schema
or absent connections. Owner setup now exposes connection configuration and
patient/clinician links, with explicit confirmation and reload after uncertain writes.
For Rhapsody and Vetspire, owners can explicitly verify the selected browser tab
and synchronize a device-timezone calendar day. This requires the matching updated
extension and the rollout flag; there is no background polling.

An owner configuration begins **unverified**. Verification records a fresh,
matching browser observation; it is not a signed vendor attestation. Rhapsody and
Vetspire supply session-pinned `syncSource` implementations. The other five adapters
remain display-only and cannot opt into sync by name/number matching. Unknown feed
completeness never authorizes absence-based archiving. Missing end times remain
explicitly null; missing or malformed fields are not silently treated as null.

The coordinator starts before reading, snapshots baseline versions, verifies
identity around capture and before each chunk, and writes up to 100 items per
transaction and a conservative 192 KiB serialized-byte budget. It never retries uncertain network outcomes automatically. Read
`pims_sync_runs` and `pims_sync_chunks` to reconcile acknowledged transactions;
do not restart a capture under an old generation. Partial commits survive an
interruption. A completed run means accepted capture chunks, **not** all items
applied, completed absence reconciliation, or completed provider parity.

Bounds: 256 KiB per RPC, 100 items per chunk, 5,000 observations per coordinator
capture, 1,000 rows per baseline page, a five-minute absolute lease and
an exact timezone-local day (including 23/25-hour DST days). Baselines use keyset
pagination without a lifetime record-count ceiling. Expiry during pagination
fails closed before capture rather than using incomplete versions.

The foundation creates integration schedules only, never charts. The reconciliation
migration seals capture completeness, then offers bounded candidates. A missing
appointment needs independent post-seal status evidence; unknown status never
archives it. Explicit feed cancellations must match existing patient, clinician,
encounter and link versions, remain unresolved, and retain their original visit
version; intervening manual restore or retain-current decisions invalidate them.
Archive/restore changes integration visibility only,
not clinical notes, with version guards and durable actor/reason receipts.
Identity changes require future explicit relinking; existing links cannot be
reassigned, and an established connection cannot be repointed to another clinic.
Reviewed history/radiology drafts now persist with actor-bound replay receipts,
source fingerprints and optimistic versions. Edits clear review; stale reviews
cannot authorize export or replay as current approval. Saved photo/x-ray images can
be previewed and downloaded for manual PIMS transfer in the web dialog and extension
panel. Retrieval uses authenticated storage download, never a supplied URL. PNG,
JPEG and WebP bytes are signature-, decode-, size- and dimension-checked (2 MiB,
2000 pixels per edge); export rechecks chart access, metadata and content hash.
DICOM-derived previews are explicitly labelled; originals are not exported.
This does not confirm a PIMS upload/save. The Instinct PDF upload foundation uses
`pims_prepare_upload`, `pims_dispatch_upload` and `pims_confirm_upload`. Dispatch is
consumed once under a connection lock, before any provider write; ambiguous outcomes
remain unknown and cannot be retried automatically. Semantic artifact and byte-hash
keys also block duplicates under different request IDs. `uploadReviewedDraft`
renders a persisted approved draft and rechecks its source/version after rendering.
The recovered multipart adapter requires independent target and saved-file readers.
These readers are not established by the recovered artifact, so it has no enabled UI
action and makes no requests when they are absent. The artifact's hardcoded location
and generic API endpoint are not clinic identity evidence. `pims_upload_review_page`
returns at most 50 unknown attempts for the chart's current practice, with a UUID
cursor. `pims_record_upload_observation` appends an actor/time receipt using a
request ID and expected review version. Observations require a short note and
never change upload state, confirm a saved file or release duplicate protection.
Historical reviews remain possible after connection expiry/relink/disable, while
current chart access is always required. The web dialog and sidepanel expose this
manual review behind the rollout flag; uncertain saves require reload. Saved-image
uploads, independent provider-backed reconciliation and live verification remain open.

All six backend migrations are unshipped and must be applied in order: foundation,
reconciliation, transfer drafts, `20261202_pims_setup.sql`, then
`20261203_pims_upload_attempts.sql`, then `20261204_pims_upload_observations.sql`.
The reconciliation migration relies on fields added to that unshipped foundation;
this is not an upgrade path from an earlier deployed foundation schema.
Apply nothing to a hosted project until separately authorized and validated in
an isolated Supabase environment with the repository's prior migrations.
