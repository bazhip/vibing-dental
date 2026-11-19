# Provider sync and upload execution

## Retry implementation — November 17

Scope: continue the approved PIMS design in the existing isolated `feat/pims-extension-parity` worktree; leave the shared checkout and canceled modal request untouched. Parallel workers are authorized to use `mntn-auto`.

- [x] Replace the raw saved-attachment send path with a dedicated durable-dispatch contract; block legacy callbacks and uncertain/duplicate outcomes before further writes.
- [x] Prepare the exact bounded converted PNG before visual review; retain original-format manual downloads.
- [x] Implement durable image claim/dispatch/confirm storage and source/identity/access guards with real PostgreSQL race and replay tests.
- [x] Integrate verified-binding-only image selection and explicit Shepherd setup in both transfer surfaces; review worker changes.
- [x] Run fresh full tests/builds, translation checks and scoped desktop/phone browser review.

The image ledger deliberately provides no manual retry-unlock for unknown outcomes. A new request can renew an expired, never-dispatched preparation: the old attempt remains expired and non-executable, and a new attempt ID is issued under the connection lock. Unknown and confirmed attempts never renew. A real clinic/readback observer is still required before exposing automatic image writes.

### Verification completed — November 17

Independent review reproduced two Shepherd hazards (retry after document/worker replacement and prepared tickets surviving observed away-and-back navigation/session changes). The extension now persists an opaque per-record claim before opening; only definite pre-activation failures release it. Document tickets invalidate on observed navigation/session/provider changes. This lock is local to the browser profile, not cross-device saved-exam proof.

Image review reproduced a replay authorization bypass, late source drift before writing, lost partial-success bookkeeping, and expired-preparation deadlock. Regression-driven fixes reauthorize replay, revalidate the source after the final target await, preserve confirmed image success if notes fail, and renew only never-dispatched expired claims. The initial full-suite run also caught an incomplete bridge mock in the existing pseudo-locale suite; that fixture now includes `physicalExam`.

Follow-up review demonstrated that alternating asynchronous source and target reads only moves the race. The image capability now requires a synchronous current-target observation and synchronous write dispatch after final source validation; its returned receipt settles asynchronously. The target-drift regression verifies zero writer calls when the encounter changes during final source validation. The UI requires this capability and stays manual-only without a genuine binding. A separate same-user token-refresh regression now restarts the passive Shepherd capability check while rejecting stale replies.

Thirty synthetic Chrome cases cover the actual web modal and extension chart-send surface at 1440/390/320px: explicit exam setup with long labels, uncertain opening, older extensions, manual image preview and empty images. No external requests are allowed by the harness. Screenshot inspection found a 320px mapping selector clipped by fixed minimum columns; the owning layout now stacks on phones, and the browser assertion verifies the selector stays inside its viewport. Screenshots were inspected for both surfaces. Authentication/storage/provider responses are fixtures, not live PIMS evidence. The final rerun passed all thirty cases with no reported browser errors.

Final validation after the review fixes:

- `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: 317 files and 3,741 tests passed, including the disposable PostgreSQL foundation suite. Log: `/private/tmp/pims-retry-final-tests.log`.
- `npx tsc --noEmit`, `npm run build`, `npm run build:extension`, and the rollout-enabled store extension build passed. Build logs: `/private/tmp/pims-retry-final-build.log`, `/private/tmp/pims-retry-final-extension.log`, `/private/tmp/pims-retry-final-store.log`. Existing bundle-size and ineffective-dynamic-import warnings remain.
- Scoped ESLint passed for the changed exam/image UI, background, exam-attempt store, bridge, Shepherd adapter, send hook and image utilities. Translation check reports `todo=0 remove=0`; `git diff --check` passed.
- Browser logs: `/private/tmp/pims-retry-visual.log` and `/private/tmp/pims-retry-panel-visual.log`; screenshots use the corresponding prefixes and viewport/scenario names.
- Dalton's final read-only review passed the synchronous target-check/dispatch closure. Mencius's final read-only review passed the auth-refresh capability recovery. Neither verdict claims live provider verification; adapter authors must actually dispatch synchronously and independently observe saved content.

No commit, push, hosted migration, extension release or deployment was performed for this retry. The default rollout remains off. Automatic paths without authorized clinic/encounter/readback evidence remain unavailable; this validation is not a claim of full live-provider parity.

## Saved-image continuation — November 17

The modal request was canceled; work remains on PIMS in this isolated checkout.

- [x] Add a separate saved-attachment mapping row and explicit inclusion in the existing ezyVet Send flow, retaining manual downloads and all other provider gates.
- [x] Reauthorize source bytes around bounded PNG conversion and invalidate removed, stale or unauthorized selections.
- [x] Reproduce and fix late send/stamp callbacks affecting a different chart, removed selections retaining usable render callbacks, and stale previews surviving failed validation.
- [x] Add conversion, duplicate-click, uncertain-resend, pseudo-locale and browser integration coverage; translate all new labels in five languages.
- [x] Verify full suite, production/extension builds and desktop/phone screenshots.
- [ ] Complete immutable connection provenance, durable unknown-image outcome blocking/readback and explicit converted-artifact review before release. The existing note-send warning is not a substitute for these approved image-contract requirements.

Ruling: reuse the existing ezyVet writer without widening provider permissions or claiming durable image-upload parity — its encounter guard is already implemented, but its connection identity and unknown-outcome semantics are insufficient for the stronger approved transfer contract — enabling production before those gates are closed could allow duplicate appends after an uncertain outcome.

Fresh verification: 312 test files / 3,521 tests passed with the disposable PostgreSQL container. Production, development extension and rollout-enabled store builds passed; translation check reports `todo=0 remove=0`. Nine synthetic Chrome cases use the actual web dialog at 1440/390/320px with included, stale and empty images; screenshots of mapping, preview and results were inspected. Authentication, storage and provider transport are mocked; no live-provider or full sidepanel visual claim. Logs: `/private/tmp/pims-images-final-{tests,build,extension,store,i18n}.log`; browser log: `/private/tmp/pims-images-visual.log`. Local review only. No commit, push, deployment, migration application outside the disposable test database, or rollout enablement.

## Main refresh — November 17

Merged fetched `origin/main` at `d06638d` into the parity branch in `b26c41f`. Preserved the unfinished work using stash `b43b17d8ea8adcea7ea5cc88c015d0d41434d61a`, retained as a backup. All 35 previously untracked files restored byte-for-byte; the 28 tracked dirty files were preserved except the expected settings-navigation integration and merged locale metadata. Unfinished feature changes remain unstaged and uncommitted; nothing was pushed.

Main's modal section navigation required PIMS review/setup to follow `sectioned`, not only `asPage`. A failing modal-navigation regression demonstrated the mismatch; page/modal tests now ensure both panels appear only in General. Browser navigation checks and screenshots cover General/Team at 1440/390/320px using actual modal styles with mocked account data. This is scoped merge verification, not a new full-app visual review.

Pre-merge tests/build passed. The merge commit was validated with 3,254 tests (77 database tests explicitly skipped while the unfinished work was stashed). After restoring and integrating all unfinished work, **312 files / 3,500 tests passed**, including real PostgreSQL checks. Production and both extension builds passed; diff checks passed. Existing test-environment and bundler warnings remain. No release flags or provider permissions changed.

## Continuation — uncertain-upload review, November 17

Base: `1548ad2b6abf3a2e59ff3469d672fb40233916b5`; preserve all inherited uncommitted work.

Ruling: implement the approved manual observation path without unlocking retries — the remaining adapter sources do not establish independent clinic identity, and a human observation is not provider readback. This does not complete automatic provider parity.

- [x] Add append-only, actor-bound upload observations with optimistic concurrency and bounded paging; keep unknown attempts blocked.
- [x] Add validated client contracts and chart-scoped review in both existing transfer surfaces, with translations and stale-context guards.
- [x] Test access, replay, races, duplicate protection, UI and locale behavior; run full tests and builds and record results.

No live vendor calls, deployment, commit, push or new browser permissions.

Implementation: `20261204_pims_upload_observations.sql` adds immutable actor/time receipts, exact actor-bound replay, review-version concurrency, and 50-row keyset pages scoped to the chart's current practice. Historical review survives connection expiry, relinking and disabling, but never bypasses current chart access. Neither observations nor review reads confirm provider persistence or release duplicate protection. Client validation and shared web/sidepanel UI reject stale chart/auth responses and require reload after uncertain saves.

Rendered review coverage: empty, single attempt, multiple attempts, prior observation and interrupted save at 1440/390/320px (15 mocked local Chrome cases). All measured controls/checkbox labels meet 44px targets; no horizontal overflow or page exceptions. Desktop multiple, 320px prior-observation/empty and 390px interrupted screenshots were inspected for wrapping, density and action discoverability. The preview imports the actual component/styles but mocks authentication/backend; it does not establish live-provider or full modal/panel-parent behavior. The temporary browser harness needed a default ReactDOM client import; no product change was needed for that harness error.

Initial full-suite verification caught French/Spanish chart terminology and an Italian courtesy-pronoun lint violation; corrected the translations, then reran the terminology checks successfully. Final verification: 304 test files / 3,399 tests passed, including the real PostgreSQL suite with all six migrations applied twice. Production, development-extension and rollout-enabled store-extension builds passed; translation backlog is `todo=0 remove=0`, and `git diff --check` passed. Existing test-environment and bundle-size/dynamic-import warnings remain. Review is local, not an independent model review.

Continue the approved backend design in the isolated parity worktree; no live vendor writes, deployment, merge or commit.

## Evidence-led decisions

- Rhapsody exposes an explicit `businessId`, authenticated schedules and individual appointment status reads. Vetspire exposes an explicit selected location and a GraphQL location response. Neither requires guessing a tenant from a hostname.
- These feeds do not establish an end time (Vetspire duration units remain unknown). Represent a missing end as null throughout storage/reconciliation rather than inventing a duration. This corrects an unnecessarily strict foundation contract.
- Instinct exposes authenticated multipart `uploadChartFile`, its patient/file receipt, and session-selected practice API URL. Do not copy the hardcoded location, sharing default, branding or navigation.
- Unknown upload outcomes must remain durable and non-retryable until explicitly reconciled. A generic successful HTTP response is not proof of a saved file.

## Tasks

- [x] Test and support unknown end times in the coordinator, database and review validation.
- [x] Implement authenticated Rhapsody/Vetspire capture with source identity checks, partial failures and independent status where evidenced.
- [x] Wire provider capture through the extension bridge to an explicit owner verification/sync action.
- [x] Implement durable upload-attempt claiming and receipt handling plus the evidenced provider upload boundary.
- [x] Validate regressions, database behavior and production/extension builds; record exact coverage and remaining unknowns.

## Evidence ledger

- Reused REA retained application parents `ev_62894914c7b9b8b61dfbac42f7bdcd75aaa6dfdc2ab9052e7963606e3ef74810` and `ev_7e7c46773435c1abcb4cc97ee8f0f3c555d863307737fd70024b15841b598da7`, artifact SHA-256 `51eab8d0307b6acec82701ca2313536f41066361c5b4a10c6fdb82485ac92524`. Source inspection is static evidence, not live execution.
- Exact recovered source: `rhapsody.76fff428.js:572` (status endpoint), `:713` (business-scoped schedules), `:795` (status conversion); `vetspire.012b159d.js:487` (auth/location storage), `:509` (appointments/location query); `instinct.9eb2d42a.js:355` (session state), `:25137` (multipart mutation), `:25224` (variables).

## Execution boundary

Instinct's recovered hardcoded location is not identity evidence. Its generic session
API URL and file receipt do not independently identify the location. The upload
adapter and reviewed-draft coordinator are implemented and tested, but no UI action
enables them without independent target/readback observers. Unknown uploads remain
blocked rather than automatically retried; manual resolution UI and automatic saved
image transfers are not included. No live PIMS calls, hosted migrations or releases
were made. Existing default-off rollout stays off.

Regression coverage includes separate PostgreSQL sessions competing for one dispatch,
membership/revision/link/expiry changes, source drift, lost acknowledgements, concurrent
adapter calls, token changes, null-end reconciliation/review, and stale UI notices.
The 12 mocked browser cases cover four sync states at desktop and 320/390px; screenshots
were inspected. Local review only; no independent model review was available under the
requested model restriction.

## Final validation — November 17, 2026

- `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: 301 files / 3,333 tests passed, including real PostgreSQL transactions and RLS.
- `npm run build`, `npm run build:extension`, and rollout-enabled store build passed.
- `npm run i18n:translate -- --check`: `todo=0 remove=0`; `git diff --check` passed.
- Twelve synthetic Chrome cases passed with zero browser exceptions. No live provider writes were attempted. Existing Node localStorage/canvas test warnings and bundle-size/dynamic-import build warnings remain.
- Logs: `/private/tmp/pims-provider-final-{tests,build,extension,store,i18n}.log`; screenshots: `/private/tmp/pims-provider-<width>-<scenario>.png`. Temporary preview source removed. No commit, push, merge or deployment performed.
