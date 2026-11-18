# Configured-practice sync compatibility plan

The user's instruction to copy ScribbleVet's behavior supersedes the earlier requirement that these four providers must independently reveal active-clinic identity before sync. The recovered selected-tab + configured integration/provider-link flow is sufficient for compatibility. Do not label a configured clinic as independently observed.

## Contract

- ezyVet, DaySmart, Pulse and Shepherd gain configured-practice sync, with explicit user confirmation of the selected PIMS tab before activation and each sync. Rhapsody/Vetspire retain their existing observed-identity flow; Instinct remains unsupported here.
- Persist `binding_mode=user_confirmed` on configured-practice activation with owner authorization, revision checks and audit. Use a distinct confirmation RPC; never call this browser verification.
- Page sessions require explicit user-confirmation on open, exact configured provider/origin, document/navigation continuity and the available existing session signals. Tokens remain page-local. Same-origin clinic changes not reflected by these signals remain a manual-confirmation limitation.
- Capture actual provider appointment/patient/clinician identifiers where recovered. ezyVet's recovered provider-name matching uses an explicit name key rather than inventing an opaque clinician ID. Shepherd SOAP and appointment identities stay namespaced separately.
- Completeness remains unknown or partial; absence never archives. Preserve server membership, links, versions, run generations, idempotency and conflict handling. No unattended sync, deployment or rollout enablement.

## UI mockup

Reuse the existing PimsSetup clinical controls and GitHub-style review-before-write placement:

Selected practice / configured PIMS origin and label
User-confirmed connection (active clinic is not detected automatically)
[ ] I checked the selected PIMS tab belongs to this practice.
[Confirm connection] / [Sync appointments]

Only one main action for the connection's state; existing date control and review results remain. Hand-translate all new strings in en/fr/de/it/es and inspect desktop/320/390px screenshots.

## Work

- [x] Provider captures: DaySmart/Shepherd and Pulse/ezyVet, TDD using recovered source contracts, preserve display reader behavior.
- [x] Main: configured SyncSource, explicit confirmation protocol, background/registry/browser-sync wiring and regression tests.
- [x] Main: additive binding-mode/owner confirmation migration and PostgreSQL regressions.
- [x] UI: explicit confirmation and accurate binding labels, translations/pseudo tests and screenshots.
- [x] Independent verification, full test suite/PostgreSQL, app/extension/store builds, translation checks and evidence ledger update.

Evidence: existing extracted ScribbleVet1.31.3 `sidepanel.b7741352.js:224867–224998` maps configured integration users/provider links and sends platform/external visit/patient IDs to the authenticated backend; provider pull hooks use the selected tab. The backend implementation remains private. ToothOps reuses its own practice-scoped backend and does not copy a private endpoint or claim its identity guarantees.

## Verification evidence

- Shared configured-source tests cover explicit confirmation, immutable configuration/options, wrong context, sticky session invalidation, ticket/date-window checks, bounded raw identifiers and disposal.
- Protocol/client RED: three failures before confirmation propagation and distinct activation. Reviewed-tab RED: most-recent tab 8 replaced reviewed tab 7; fixed coordinator reuses reviewed tab 7 with no new inspect. Same-origin document replacement was separately reproduced and fixed.
- PostgreSQL RED: 12 failures before migration. GREEN: 13 configured-practice cases, including actual linked-appointment persistence. The added durable-write fixture initially started as member and submitted as owner; the expected actor-bound rejection required correcting the test to use the original actor, with no product authorization change.
- Independent provider review PASS: 11 focused suites / 487 tests, TypeScript and diff check. Independent DB/UI review PASS:13 PostgreSQL cases and 4 UI/client suites / 45 tests, TypeScript and diff check. Root fixed the reproduced tab-confirmation race and lifecycle cleanup before these final reviews.
- Translations: 10 new keys hand-written/stamped in fr/de/it/es, backlog todo=0/remove=0. App and extension/store builds pass; final full suite result recorded below.

### Rendered scope

| Actual surface | Widths | Captured states |
| --- | --- | --- |
| PimsSetup with synthetic backend/transport | 1440, 390, 320 | Unverified unchecked/checked, active unchecked/checked, confirmed result, sync result, empty connections, multiple long connection labels |

All 24 refreshed cases pass with no page errors or horizontal overflow, ordinary controls at least 44px and at most one primary action. Representative 320px reviewed-tab/checked and 390px result screenshots were inspected; main also inspected 320px reviewed-tab/checked. Harness `/private/tmp/configured-setup-visual.cjs`, final log `/private/tmp/configured-setup-reviewed-visual.log`, screenshots `/private/tmp/configured-setup-{width}-{scenario}.png`. Task-owned 5202 preview server stopped.

This is targeted component rendering, not full-app or installed-extension coverage. Live provider behavior, same-tab invisible clinic switches and private ScribbleVet backend behavior are unverified. A long provider callback may continue bounded GET requests past lease expiry; the post-capture lease check rejects its result before persistence.

## Final integration

- Frozen-source `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **323 files / 4,286 tests pass**, including all 166 PostgreSQL tests. Log `/private/tmp/configured-sync-full-tests.log`.
- `npm run build`, `npm run build:extension`, `npm run package:extension` and `git diff --check` pass. Translation backlog `todo=0 remove=0`. Logs `/private/tmp/configured-sync-final-build.log`, `/private/tmp/configured-sync-extension.log`, `/private/tmp/configured-sync-package.log`, `/private/tmp/configured-sync-i18n.log`.
- Existing non-fatal chunk/dynamic-import and test canvas/localStorage warnings remain.
- ezyVet capture reads the calendar already showing the requested date in Day view; it does not navigate away from a clinical editor. Its clinician-link IDs are explicit name keys. Other providers use recovered read endpoints for the requested date. This is a local implementation with synthetic provider fixtures, not a live-provider verification claim.
- New migration is included and undeployed. No host grant, rollout change, commit or push. Earlier unrelated uncommitted work is preserved.
