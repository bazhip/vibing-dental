# PIMS Sync Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the first backend increment of the approved parity design without enabling unsupported provider writes.

**Architecture:** Authenticated PostgreSQL RPCs enforce current membership, owner-managed identities, serial connection locks and absolute capture leases. Browser adapters opt into an explicit capture/status contract; existing appointment-list adapters remain unchanged and cannot implicitly enable durable sync. No service-role route or legacy chart matching is used.

**Tech Stack:** Supabase/PostgreSQL, TypeScript, Vitest, isolated PostgreSQL 16 Docker tests.

**Spec:** `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`

## Global Constraints

- Work only in the existing isolated `9bb5` worktree; preserve concurrent Claude work.
- Five-minute absolute lease issued before capture; requests bind actor, connection, generation, revision, local date, timezone and window.
- Never infer cancellation from missing appointments, create clinical charts, overwrite notes, or silently restore archived visits.
- No deployment, merge, clinical writes, extra extension permissions or canceled image-upload redesign.
- This increment stores active schedules and issues; reconciliation, archive UI, drafts and upload attempts follow separately.
- Keep all seven providers blocked for durable sync until their independent tenant/identity/capture evidence is implemented. No fake verified capability.

## Review Focus

- Removed member retrying a prior successful request must fail authorization before idempotency lookup.
- Same-origin tenant switch or connection revision change must invalidate submission.
- New request IDs must not bypass stale capture/generation or extend a lease.
- Changed patient/clinician identity and stale baseline versions must produce issues, not overwrite links.
- Empty/partial captures and DST-length days must never delete or archive records.

### Task 1: Database write boundary and run engine

**Files:** `supabase/migrations/20261129_pims_sync_foundation.sql`, `scripts/pims/foundation.db.test.ts`, `scripts/pims/bootstrap.sql`.

**Interfaces:** owner RPCs configure/verify connections and confirm patient/clinician links. Member RPCs start a run, submit a bounded chunk, and finish/abandon it. Every mutation derives its actor from `auth.uid()` and locks current membership. Tables expose RLS-protected reads only. Chunk outcomes include applied/unchanged/conflict/skipped; replay returns the persisted outcome.

- [x] Write actual PostgreSQL tests for RLS, grants, cross-practice FKs, current membership, idempotency, invalid windows, connection verification, capture freshness, lease expiry, concurrent runs, versions and explicit unsupported statuses.
- [x] Run tests before migration exists; confirm missing implementation failure.
- [x] Add additive schema and transaction functions, bounded input validation and minimal audit/outcome records.
- [x] Run the isolated database tests and verify rollback on invalid batches.

### Task 2: Browser contract and orchestration

**Files:** `src/utils/pims/sync.ts`, `src/utils/pims/sync.test.ts`, `src/extension/pims/types.ts`.

**Interfaces:** explicit `SyncScope`, `SyncTicket`, `SyncCapture`, `AppointmentStatus` and `SyncSource`; `syncAppointments` starts before reading, validates target/window/freshness, submits bounded chunks and finalizes; failures attempt abandonment, never report success or retry external side effects.

- [x] Write failing tests proving start-before-capture, no legacy fallback, tenant/window mismatch rejection, partial completeness preservation and interruption handling.
- [x] Implement types and orchestration using an injected authenticated RPC boundary. Adapter methods remain optional and none of the current adapters claims support.
- [x] Verify focused tests and type checking without altering display-only appointment flows.

### Task 3: Review and verification

- [x] Run `npm test`, `npm run build`, development/store extension builds and translation backlog check.
- [x] Obtain independent security review of the transaction boundary and address important findings with regression tests.
- [x] Update parity ledger with implemented boundaries and explicitly unimplemented provider/UI flows.
- [x] Leave changes uncommitted for review; no new commit/push was requested in this turn.

## Progress

- Design approval recovered; branch clean at `d17f35d` before work.
- Pre-flight: Task 2 uses the exact run RPC contracts implemented and tested by Task 1. Task 3 verifies both; no historical source code is reimplemented.
- Database foundation: 35 real PostgreSQL tests pass against a disposable, network-isolated PostgreSQL 16 container. The migration is applied twice; grants, RLS, transaction rollback and concurrency are exercised. The fixture is not a full Supabase deployment or an application of all historical migrations.
- Browser contract: 32 coordinator tests pass. Authenticated transport pages baseline versions with keyset cursors, and count/byte-aware chunks preserve acknowledged outcomes across interruptions. No existing provider implements `syncSource` yet.
- Independent review identified five important issues, each reproduced failing and fixed with passing regressions: contradictory capture failures/items, lost distinct conflict proposals, a lifetime baseline ceiling, Unicode identifiers exceeding count-only chunk limits, and malformed acknowledgement versions. No reviewer finding was deferred.
- Two additional failing-to-passing regressions verify that a permissive legacy membership helper cannot expose PIMS rows and that lease expiry during processing rolls back the entire chunk.
- Final verification: 262 test files / 2,838 tests pass with `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`; production, development-extension and store-extension builds pass. Store permission/host/origin and bundle assertions pass; translation backlog is `todo=0 remove=0`. Existing bundle-size/dynamic-import warnings remain unrelated.
- Delivery: local, uncommitted foundation only. No hosted migration, live PIMS access, new extension permissions, reconciliation/archive screens, reviewed drafts or transfer uploads. Validate all historical migrations in an isolated Supabase environment before any hosted rollout.
