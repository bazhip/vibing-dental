# PIMS reconciliation and review implementation

Approved design: `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`.

Continue in the existing isolated worktree. No deployment, commit, push, debugger permission, live PIMS writes, or uploader redesign.

## Evidence

REA extraction `ev_8b2dc29897a09d2cd4e61ce7506bd4642d45111be04795bcfac6de307fd4d4cb` binds the 1.31.3 archive digest `69c6d169fb5d91df99999e6c8a0ad175ca48e3899ccb7da5ca247d9ce2c891b6`. Readable `sidepanel.b7741352.js:306540` distinguishes explicit cancellations from missing appointments. `:306548` maps independently observed cancelled/deleted to archive, active to resync, unknown to skip. `:157169` provides reversible archive/unarchive. These are client contracts, not recovered private server implementations.

## Tasks

- [x] Implement versioned, audited archive/restore and conflict review RPCs with PostgreSQL regressions.
- [x] Implement complete-capture sealing, bounded missing-visit candidates and identity-bound status reconciliation; never infer deletion from absence.
- [x] Wire optional status lookup into the coordinator, preserving unknown/interrupted outcomes and archived visibility.
- [x] Add shared practice-scoped review/archive UI accessible in web and extension, translations and pseudo-locale tests.
- [x] Run independent review, regression fixes, full tests/builds and update the parity ledger.

## Constraints and decisions

All reconciliation writes are integration metadata only. Manual archiving wins over sync. Restores are explicit. Review can retain a proposal or accept schedule metadata only when patient/clinician/encounter links still match; identity relinking remains separately gated. New migration integration is exercised on disposable PostgreSQL, not a hosted project. Provider capture/status adapters remain disabled until their independent clinic and patient evidence is implemented; the shared engine does not claim those capabilities.

## Verification ledger

- Database RPC tests: initial RED 14 failures, then 49 passing after implementation and explicit-column fixture correction.
- Safety regressions: RED 6 failures covering pre-seal status, mismatched cancellation identities/link versions and durable restore reasons; GREEN 55 tests.
- Appointment identity review: RED proved a different-appointment proposal could bypass the schedule-only review; fixed both server and client identity guards.
- Coordinator and UI tests: initial RED missing status orchestration/component; focused GREEN 59 tests including review transport and pseudo-locales, before the additional uncertain-write regression.
- Production build found JSX identifier arrays triggering translation lint and two test-only type errors; fixed without lint exemptions.
- Independent review found two important cancellation races: a captured V1 cancellation could override a V3 manual restore, and retain-current did not invalidate that run's cancellation. Four DB regressions failed RED; an unchanged explicit cancellation stayed green. The fix requires unresolved proposals with their original expected version at candidate selection and again at mutation. A client RED regression also now preserves original baseline/link versions rather than upgrading to current candidate versions.
- Review fix pass: 109 targeted tests pass (61 PostgreSQL, 41 coordinator and 7 translation checks). No further reviewer loop; remaining minor documentation finding addressed here and in the parity ledger.
- Final full verification: `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test` passes **2,893 tests / 265 files**. `npm run build`, development extension build and store build pass. `i18n:translate -- --check` reports `todo=0 remove=0`; diff whitespace check passes. Existing build chunk-size/dynamic-import warnings remain.
- Store manifest assertions: permissions and hosts equal source; no debugger permission; externally connectable origin is only `https://toothops.app/*`.
- No commits, pushes, hosted migrations, live vendor writes or uploader redesign. Provider capture/status adapters, setup UI, relinking, drafts and transfers remain outside this increment. Full Supabase migration integration and rendered-device/live-provider validation are not established by the fixture tests.

Ruling: keep both migrations as a paired, unshipped schema — neither has been deployed, so editing the foundation does not claim compatibility with an installed older schema — deployment must apply both in order and separately validate all preceding Supabase migrations.

Ruling: manual review remains available when automatic capture is disabled — it only changes integration schedule/visibility metadata and is gated by current practice membership — this does not authorize provider writes or chart mutation.
