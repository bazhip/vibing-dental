# Merge main with main taking priority

User instruction: merge main into the existing parity worktree and prioritize main for changed elements.

- Branch before merge: `feat/pims-extension-parity`, `cf55aa8`.
- Main fetched for merge: `b7e762c`.
- Pre-merge validation:353 files /4,765 tests passed; production build passed.
- Merge uses `--no-commit --no-ff -X theirs`; no changes to the user's main worktree and no deployment.

## Resulting behavior

Main's explicit finalization, patient-tab save states, export warnings, warmer light theme, dropdown/diagram changes, nine languages and separate report PDF cards are the baseline. Existing GP/consultation/discharge work remains additive.

Imaging retains main's CodeField editors, headings, helper text and sizes. Existing dictation/refinement/review actions sit below each editor, with no duplicate authoring fields. Main's `radiographicFindings` is authoritative, including explicit clears; an absent field can migrate from legacy `radiologyReport`. CT remains independent. Both report controls retain practice-AI, cloud and non-trial gates, plus finalized/read-only and stale-response guards. Manual reports without a prior AI source marker do not receive a misleading stale-draft status.

Main's CT note section ID `ct` is used; legacy `ctReport` saved destinations/skips migrate without overriding an explicit `ct` choice. Provenance remains private, persisted and included in source-only snapshot updates; GP clinical changes invalidate note bases. Finalized records continue to require Edit chart before dictation or editing.

Added461 translations per language (1,844 total) for Hungarian, Romanian, Chinese and Arabic, and reconciled50 pre-existing PIMS strings per language with provider-neutral wording. Existing main values remain unchanged except those stale translations requiring the current English meaning. All strings were translated manually; placeholders and consistency were checked, then stamped. English dental voice behavior remains covered by the unchanged snapshots.

The UI's nine-language PIMS draft selection also needs `20261210_pims_draft_languages.sql`: an idempotent, forward-only table constraint and targeted installed-function guard update. It preserves the remaining function definition/security/configuration/grants and aborts transactionally for an unexpected guard. Four new-language failures were reproduced before the fix;14 isolated PostgreSQL tests passed afterward, including the strengthened rollback check. No hosted database migration was applied.

## Scoped visual coverage

| Surface | States | Widths/themes | Evidence |
| --- | --- | --- | --- |
| Consultation, GP examination, Discharge, Imaging | Empty, populated, long text/name, multiple visits, explicitly finalized | 1440/390/320; light/dark |120 cases, `/private/tmp/parity-main-workspace-visual.json` |
| Final Imaging controls | Same five states after manual-report status fix |1440/390/320; light/dark |30 refreshed cases, `/private/tmp/parity-main-imaging-final-visual.json` |
| GP examination and Imaging in hu/ro/zh/ar | Populated, actual language asserted before capture; Arabic document direction is RTL |1440/390/320; light/dark |48 cases, `/private/tmp/parity-main-locales-visual.json` |

No page errors or horizontal overflow in these matrices. Inspected selected desktop/phone/light/dark views for alignment, control spacing, wrapping, action reachability and explicit finalization states. Local Vite React/ReactDOM dependencies use different version hashes; the harness reads both generated entrypoints before mounting. Native select popups, physical dictation, live AI/provider/cloud sessions and the full application are outside this scoped visual review. Synthetic clinical source text remains English in translated fixtures. Main's unrelated screen/diagram changes are inherited, not claimed as a full app UI review.

Independent scoped merge review passed after integration fixes; focused tests cover the restored gates, canonical source authority, CT mapping compatibility, snapshot dependency, normalization, report languages and endonyms. Final full-suite/build/packaging results are recorded below when complete.

## Final verification

- Full merged suite: **365 files /5,003 tests passed**, including the new14 PostgreSQL cases; `/private/tmp/parity-main-release-tests.log`,128.71 seconds.
- `npm run build`: passed, including translation validation, ESLint, TypeScript and production bundle; `/private/tmp/parity-main-release-build.log`.
- Extension store packaging passed; `/private/tmp/parity-main-release-extension.log`.
- Translation check: `todo=0 remove=0`; `/private/tmp/parity-main-translation-final.log`. Identical-English consistency test passed.
- Final independent scoped review: PASS,98 independently rerun focused tests plus source/rollback review; no blockers.
- Scoped visual matrices:120 clinical-workspace cases,30 refreshed final Imaging cases and48 actual new-language cases; zero page errors or horizontal overflow. Final snapshots were inspected for Arabic RTL and Chinese phone layouts and explicit finalized-chart locking.
- A pre-existing asynchronous PIMS draft test helper now waits for load completion (Close drafts enabled) before clicking actions; this preserves the access-revocation assertion under full-suite load.

No product/source edits followed the final full tests/build. Main remains the preferred baseline; no push, deployment or hosted migration occurred.
