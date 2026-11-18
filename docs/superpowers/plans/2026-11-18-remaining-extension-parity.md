# Remaining observed extension parity

User requests all remaining parity items, continuing the existing compatibility scope and existing parity worktree.

## Design

1. Instinct durable sync: extend configured-practice confirmation and capture raw calendar/visit patient/clinician identifiers using existing GraphQL contracts. Use an in-memory Instinct session/practice/endpoint witness before and after each request. Namespaced calendar/visit IDs prevent collisions; actual visit IDs alone may populate encounter_id. Only evidenced ACTIVE/unclosed visits import as active; excluded/unknown/cancelled enums are not invented, completeness stays unknown/partial. Follow-up migration extends the confirmation allowlist; preserve membership, owner-only confirmation, audit/revision/run interruption and absence-archive protections.
2. Pulse/Rhapsody/Vetspire note export: use evidenced encounter identity when available. Otherwise provide a distinct user-confirmed editor-autofill flow, keeping strict send disabled. No invented encounter ID or saved acknowledgement. Exact provider/tab/URL/document/editor/field/original content/session pinned to expiring one-use tickets; append through the editor model where available. User reviews source text and explicitly confirms destination patient/encounter. No save/submit clicks, sent stamps or automatic retry after unknown.
3. Existing rollout flag, permissions and allowed external origins remain. Private backend outputs and live vendor interoperability are verification boundaries, not claims of completed exact parity. No deployment/push requested.

## UI sketch/reference

Reuse the current PIMS radiology-autofill pattern (explicit destination selection and progressive disclosure, grounded in GitHub's primary form + details pattern), preserving clinical teal/neutral controls and44px phone targets:

Fill an open PIMS note [expand]
Source: [All notes / documented section]
Review text [readonly textarea]
Destination tab [select]
Field [select]
[Prepare autofill]
Prepared destination: provider, tab title, field
[ ] I reviewed these notes and checked the destination patient and encounter.
[Fill selected field]
Result: Filled — verify and save in PIMS / Outcome unknown — check PIMS before another attempt.

## Plan

- [x] Add Instinct capture/session tests, provider registry/setup coverage and DB confirmation regression; observe failing tests.
- [x] Implement Instinct capture + configured binding + follow-up migration and validate focused/DB tests.
- [x] Trace three shipped editor contracts and retain evidence anchors; add adversarial tests before the compatibility writer/protocol.
- [x] Implement note-autofill backend/transport and UI with explicit source/destination review, source/auth/session invalidation and safe unknown results.
- [x] Add en/fr/de/it/es translations and pseudo coverage, inspect desktop/320/390px screenshots with populated/empty/source-changed/expanded/unknown states.
- [x] Independent read-only review, complete npm test + build + extension/package builds and translation/diff checks. Record exact remaining deployment/live evidence limitations.

## Review and validation ledger

- Instinct implementer:110 focused units +58 neighboring tests; full167 PostgreSQL tests and latest real-encounter persistence check pass. Independent review found missing rejection-path postchecks; two RED regressions now pass using `.finally(check)`. Reviewer final112 units +independent focusedDB check PASS.
- Autofill helper:29 focused tests; transport/protocol/page/background integration152 before finalbridge fixes. Independent183 tests +234 strict-provider/registry tests PASS. New explicit-inspection recovery regressions were RED2 then GREEN56 helper+bridge tests.
- UI: independently104 tests across5 suites PASS, including edited-note fallback, auth/source/target invalidation, pending navigation locks, no stamp and pseudo locale.
- Production build passed after integration; extension development/store package builds pass; translation backlog todo=0 remove=0. Final combined verification passes:335 files /4,466 tests, including167 PostgreSQL cases (`PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test -- --maxWorkers=4`). Final production build, development extension, store extension package, translation checks and diff checks pass. Logs: /private/tmp/remaining-parity-{full-tests,final-build,extension,package,i18n-check}.log. No commit/push/deployment or rollout change.

## Visual coverage

Synthetic standalone component with mocked transport/auth:1440,390,320px ×8 states (populated with long names, no tabs, no fields, empty source, prepared, filled, unknown, source changed) =24 cases. All screenshots were inspected by implementer; root inspected320prepared/1440populated/390unknown and independent reviewer320no-fields/390prepared/1440no-tabs. No horizontal overflow/browser errors; noncheckbox controls≥44px. Harness/log `/private/tmp/note-autofill-ui-visual.{cjs,log}` and `/private/tmp/note-autofill-ui-{width}-{scenario}.png`. Parent send surfaces have integration tests for entry availability and busy/close/back behavior.

This is scoped component visual verification, not a full UI review. Untested: full enclosing send-screen visual matrices, native OS select popups/native runtime, multiple real visit-navigation screens, installed extension and live vendor editors. These remain explicit gaps, and no exact private-backend/template or live persistence claim is made.

Additional Instinct setup visual checks:1440/390/320px ×6 states (unverified unchecked/checked, active unchecked/checked, confirmed, results) =18 synthetic cases, no browser errors/overflow and visible controls≥44px. Root inspected320unverified-checked and1440results. Harness/log /private/tmp/instinct-configured-setup-visual.{cjs,log}. Combined targeted browser cases42; the full-app/native/provider exclusions above still apply.

Completion means implementation of the four bounded local compatibility features, not exact or verified end-to-end competitor parity. Note autofill still requires an already-open unambiguous field and clinician save; strict encounter-bound Send remains disabled for these3 providers. Instinct unknown completeness/cancellation semantics remain conservative. Pending hosted deployment and live-provider testing are not completed by passing synthetic checks.
