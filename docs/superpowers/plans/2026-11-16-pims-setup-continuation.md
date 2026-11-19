# PIMS setup continuation implementation plan

**Goal:** Make the approved integration foundation usable through owner-managed connection, clinician and explicit chart/patient linking; continue evidenced transfer work without relaxing identity checks.

**Architecture:** Add bounded, owner-authorized setup reads and versioned chart-link RPCs on the existing practice-scoped model. A default-off settings screen calls these RPCs. Configuration never verifies a browser session or enables unsupported adapters.

**Spec:** `docs/superpowers/specs/2026-11-16-pims-backend-parity-design.md`

## Constraints and rulings

- Isolated `9bb5` worktree only; no merge, production migration, live patient writes or rollout activation.
- All displayed text translated into en/fr/de/it/es; pseudo-locale tests cover new components.
- Ruling: preserve unknown end times and tenant identities as blockers rather than inventing durations or treating a hostname as a tenant. Existing provider feeds do not all establish these facts.
- Ruling: configuration stays unverified. Manual owner input must not call `pims_verify_connection`.
- Ruling: linking an explicitly selected existing practice chart is an integration association, not a mutation of clinical chart data or automatic grouping by patient name.

## Tasks

- [x] Add failing real-PostgreSQL tests for owner-only setup reads, bounded paging, chart-link creation/relink, stale-source/version rejection and cross-practice/private-chart isolation.
- [x] Implement additive setup migration with audit and actor-bound replay receipts; preserve clinical data and invalidate stale proposals through version checks.
- [x] Add tested typed client and a lazy, rollout-gated setup screen in practice settings, with explicit confirmation and uncertain-write reload rules.
- [x] Implement reviewed existing-image download on both surfaces, with private storage retrieval, content/size/dimension validation and access/source revalidation.
- [ ] Automatic existing-image transfer through the guarded send boundary: requires immutable tenant/connection binding and durable upload-attempt reconciliation; not supplied by the current inspect protocol.
- [x] Run focused regressions, full tests, build, extension build and translation checks; document evidence and unresolved provider requirements.

## Execution ledger

- Starting point: commit `1548ad2`, clean isolated worktree. Prior REA evidence imported from `/private/tmp/scribblevet-parity-backend-design-evidence-2026-11-16.json`; shipped artifact code remains unexecuted.
- Static follow-up: Rhapsody schedules expose business ID, patient/person IDs and start times; Vetspire exposes location ID and duration but its unit semantics are not established by the selected code. Do not fabricate complete sync observations from display-only imports.
- Setup database tests were observed failing before the migration and passing afterward; typed-client and UI tests likewise started red. Review added a failing composite connection/practice foreign-key test and fixed the missing receipt constraint. Chart paging is tested across 51 rows.
- Ruling: ship the separately labelled manual-image path without adding automatic upload to the old inspect/send protocol. Inspect supplies tab/provider/consult but no independently verified tenant; treating it as a complete transfer target would violate the approved identity and duplicate-upload contract. Cost: automatic image parity remains incomplete, explicitly tracked above.
- Saved-image tests began red, then exercise reauthorization, overwritten bytes, changed chart/attachment metadata, MIME spoofing, dimensions, and unmount/disabled-state races. No arbitrary URL fetching, DICOM originals, conversion, remote upload, vendor service access or clinical mutation was added.
- First full checkpoint: 291 files / 3,252 tests passed, including the disposable PostgreSQL suite. Build caught an untyped test promise; its resolved type is now explicit. Final verification follows the image increment.
- Final regression review: authentication changes clear cached setup state, pending confirmations and prepared image bytes. Added auth-reset regressions; image-store tests verify private-storage retrieval and metadata minimization. German radiograph wording and Spanish chart terminology were corrected against the existing catalogs/glossary and restamped.
- The exhaustive PostgreSQL RLS audit now has a 15-second test timeout rather than five seconds: it performs multiple Docker/psql calls per integration table, including two new tables. Assertions are unchanged; the full suite was rerun without a concurrent build.
- Final verification: **295 test files / 3,278 tests passed**, including real PostgreSQL checks using `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`. Production build, development-extension build, rollout-enabled store-extension build, translation check (`todo=0 remove=0`) and `git diff --check` passed. Logs: `/private/tmp/pims-continuation-verified-{tests,build,extension,store,i18n}.log`.
- Browser coverage: 12 isolated synthetic scenarios in headless Chrome — empty setup/images, three long-name chart rows with image preview, explicit chart-relink confirmation, and stale-image rejection, each at 1440/390/320px. All measured controls were at least 44px tall, no horizontal document overflow and no page errors. Inspected desktop confirmation, 320px confirmation, 390px empty and 390px stale screenshots. Real PNG decoding ran in the browser; external network access was blocked. Artifacts: `/private/tmp/pims-continuation-visual.log` and `/private/tmp/pims-continuation-<width>-<scenario>.png`.
- Visual limits: this is not a full-app or live-PIMS review. Parent modal/extension integration, physical mobile save behavior, non-English rendered layouts, single-row setup, and connection/clinician configuration screenshots remain unverified. Synthetic preview files were removed. No independent model review, live vendor writes, production migrations, deployment, commit or push was performed for this continuation.
