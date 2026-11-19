# Radiology autofill implementation plan

**Goal:** Append an approved ToothOps radiology draft to an explicitly reviewed Radimal/Vetology form, matching the observed autofill feature without submitting a clinical order.

**Architecture:** A dedicated radiology protocol lists supported open tabs, prepares a one-use document/URL/textarea/content-bound ticket, and appends reviewed text using the native textarea setter plus input/change events. The UI reuses clinical draft controls and shows provider/origin/tab title with explicit patient/request confirmation. No patient identity is invented from selectors. User confirmation is the compatibility boundary; native DOM readback confirms only form filling, not saving. Autofill is restricted to reviewed radiology drafts. Existing global rollout remains unchanged.

**Evidence:** Existing ScribbleVet 1.31.3 artifact, `sidepanel.b7741352.js:180883,180891,213732–214021`: Radimal `/request-consult` notes textarea and Vetology history textarea, keyboard-based text fill, no order submission or persistence check. Native textarea events are our implementation choice and require live interoperability verification. No vendor script is executed in analysis.

**UI mockup:** existing PimsDrafts review-before-write placement, adapted from GitHub confirmation flows; `Radiology destination [open tab selector]`, destination summary, `I checked the patient and request on this page`, one `Autofill report notes` primary button. Teal/neutral shared controls, 44px targets. Appends existing content; refuses changed/ambiguous/disabled/hidden forms. No debugger permission. Narrow HTTPS Radimal/Vetology host access is required by this newly requested feature; external messaging origins stay unchanged.

## Tasks

- [x] Provider module: TDD a radiology adapter with exported wire guards, exact host/route handling, unique writable visible textarea, expiring one-use tickets, changed destination/content checks, append/event handling and explicit filled/blocked/unknown outcomes.
- [x] Main: protocol/transport/background/page wiring, dedicated radiology tab query separate from PIMS appointments, authenticate senders, validate requests/results, replay handling and tests. Add only narrow radiology hosts and advertise capability.
- [x] UI: reuse reviewed draft workflow with target list/prepare/confirmation/autofill; reauthorize export and compare text before dispatch; chart/auth/draft/target changes invalidate pending actions. Translate en/fr/de/it/es and add pseudo-locale tests.
- [x] Independent whole-change review; address reproduced defects.
- [x] Full tests with disposable PostgreSQL, app/extension/package builds, translation check and targeted desktop/320/390 screenshots. Record coverage limits and remaining live-provider tests.

No live provider writes, order submissions, rollout enablement, deployment, commit or push in this task. Preserve all earlier uncommitted parity work.

## Implementation and review evidence

- Background routing RED: three regression failures for missing list/prepare/fill handling. GREEN: 126 protocol/background/transport/host tests, then 132 with bridge lifetime coverage.
- Provider: 55 tests pass covering exact host/route handling, malformed inputs, expiry/replay, field/content changes, visibility/disabled/read-only/ambiguous forms, native append events and navigation/disposal.
- Bridge RED: two observed navigation/document ticket-revival failures. GREEN after disposing cached writers when a different page is observed, including via shared status inspection.
- UI: 25 focused and pseudo-locale tests pass, including explicit choice/confirmation, stale actions, unknown outcomes and blocked review reset. Fourteen new strings are hand-translated/stamped in fr/de/it/es.
- Independent review: PASS; independently ran 226 focused tests, TypeScript and diff validation. No blocking defect found. Manual clinical identity confirmation and live native-event acceptance remain explicit limits.
- Actual Chrome writer probe: native module exercised on synthetic Radimal/Vetology form fixtures. Both append reviewed text preserving original history, emit one input and one change, block repeated tickets and emit zero submit events. No page errors or external provider requests. Harness/log `/private/tmp/radiology-provider-browser.{cjs,log}`.

### Targeted rendered coverage

| Surface | Viewport widths | Captured states |
| --- | --- | --- |
| Actual PimsDrafts component, mocked backend/extension | 1440, 390, 320 | Single target/long source and target names, multiple targets, empty targets, filled, unknown, blocked |

All 18 cases have no horizontal overflow or page errors and button/select/textarea controls at least 44px tall. Representative 320px prepared, 390px filled and desktop multiple-target screenshots were inspected; main also inspected the 320px prepared screenshot. Existing clinical typography, teal/neutral controls, disclosure placement and spacing are reused. Harness/log `/private/tmp/radiology-ui-visual.{cjs,log}`; screenshots `/private/tmp/radiology-ui-{width}-{scenario}.png`.

This is a targeted component review with synthetic services, not full-app or installed-extension coverage. Actual Radimal/Vetology patient/request transitions, native event acceptance, saving and submission are untested. The UI explicitly leaves provider review/submission to the user.

Initial integrated full suite: **320 files / 4,203 tests pass**, including disposable PostgreSQL. A final rerun after source freeze includes the last blocked-state regression; result recorded below. Final app/extension/store builds pass; translation backlog `todo=0 remove=0`. Logs `/private/tmp/radiology-final-{build,extension,package}.log` and `/private/tmp/radiology-i18n.log`. Existing non-fatal chunk/dynamic-import and canvas/localStorage warnings remain.

Final frozen-source `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **320 files / 4,204 tests pass**, exit zero, including PostgreSQL tests. Log `/private/tmp/radiology-final-tests.log`. Final production, development-extension and store-package builds exit zero; translation backlog remains zero. `git diff --check` passes. Task-owned preview server stopped; all changes remain local/uncommitted, with rollout unchanged.
