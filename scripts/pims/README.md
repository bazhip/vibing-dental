# PIMS foundation database checks

These tests execute all three migrations and real RPCs on PostgreSQL, including RLS,
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

All functions use the caller's authenticated JWT; do not use service-role tokens.
Do not pass an actor ID. Client RPC errors are retained as bounded internal codes,
not raw server details. The shared review screen is available in practice settings
and the extension panel; it loads only when opened and explains unavailable schema
or absent connections. Connection/link configuration still requires owner RPCs;
there is not yet a user-facing setup or automatic-sync workflow.

An owner configuration begins **unverified**. Verification records a fresh,
matching browser observation; it is not a signed vendor attestation. None of the
seven existing adapters yet supplies `syncSource`. Their display-only appointment
lists remain independent and cannot opt into sync by name/number matching.

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
cannot authorize export or replay as current approval. Attachments, automatic
transfer-attempt ledgers and verified provider adapters remain subsequent increments.

All three migrations are unshipped and must be applied in order: foundation,
reconciliation, then transfer drafts.
The reconciliation migration relies on fields added to that unshipped foundation;
this is not an upgrade path from an earlier deployed foundation schema.
Apply nothing to a hosted project until separately authorized and validated in
an isolated Supabase environment with the repository's prior migrations.
