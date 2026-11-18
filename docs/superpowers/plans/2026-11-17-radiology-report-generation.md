# Radiology report generation and section completion

**Goal:** Generate a reviewable clinical radiology report from documented ToothOps chart facts and improve the existing radiographic-findings section, reusing authenticated AI and PIMS transfer workflows.

**Evidence:** ScribbleVet 1.31.3 `sidepanel.b7741352.js:162801–162811,213732–213822` calls `noteGenerateRadiographReport(input:{id})`, receives report text, and autofills a radiology form. Its private backend prompt/model are not shipped. Implement a ToothOps-native equivalent; do not claim recovered private generation or image diagnosis.

## Design

Keep existing `patientInfo.radiographicFindings` as clinician-entered source. Add optional string fields to PatientInfo, naturally persisted by the existing snapshot/local/cloud/PDF-data paths:
`radiologyHistory`, `radiologyTechnique`, `radiologyQuestion`, `radiologyReport`, `radiologyReportLanguage`, `radiologyReportBasis`, `radiologyReviewedBasis`, `radiologyReportGeneratedAt`.

A new RadiologyReportSection follows the existing findings field. Collapsible study context supplies history/technique/clinical question. One primary Generate draft action sends minimal documented text through existing AI consent + authenticated ai-autofill proxy (server model, rate limit, usage logging). No images, signed URLs or owner contact fields are sent. Tool output supplies clinical history, technique, findings, recorded impression, recorded recommendations and clinical question; unsupported/blank content stays explicitly unrecorded, never normal. Preview is editable and Use draft applies it without changing original findings. Existing reports are preserved until Use draft. Nothing is automatically reviewed, saved to a provider or submitted.

Report edits and source/context/language changes invalidate review. Explicit clinician review binds body/language to current source. Copy and standalone multipage PDF require current review. The fixed chart-PDF treatment card retains its original findings rather than truncating a long generated report. PIMS draft generation uses the same generator; composeDraft radiology can reuse a current reviewed chart report in its matching language. PIMS drafts still require save + separate review before autofill. Long output/error/empty/offline/locked/stale/undo/discard paths must be clear.

UI reuses clinical teal/neutral tokens and shared controls, adapting the existing owner-report and GitHub review-before-write hierarchy. Mockup shown in commentary before implementation. Preserve 44px phone controls and existing findings/dictation behavior.

## Work split

- [x] AI utility: radiologyReportState.ts basis/review/text helpers; radiologyReportAi.ts facts/prompt/tool validation/generator; shared multipage text PDF renderer; reuse in drafts.ts. Tests for sparse/adversarial/oversized/malformed/multilingual/stale/no-contact data.
- [x] AI routing: new radiology_report request kind/model feature and usage/admin labels via existing proxy. Preserve all existing voice request bytes/config behavior. No API key in client, no new provider service.
- [x] UI: RadiologyReportSection + styling/tests/pseudo coverage; PimsDrafts generation integration; all new app/pims/admin strings hand-translated and stamped. Meaningful auth/chart/readOnly/source/edit race tests.
- [x] Main: optional PatientInfo fields and normalization/persistence regression tests, EntryGrid wiring beside findings, generation export integration/record-note staleness where applicable, evidence ledger and independent review.
- [x] Final: full tests including disposable PostgreSQL, build app/extension/store, translation check; desktop/320/390 actual rendered state matrix and inspected screenshots. No live API/provider calls, deployments, rollout changes, commit or push.

Pure helpers take explicit AppLanguage. AI request must preserve original tooth numbers/units and uncertainty, distinguish performed treatment from recommendations, and treat chart text as data rather than instructions. AI output remains a draft for veterinary review. Unsupported glyph/PDF or interrupted downloads must not be shown as successful export. New visit must not carry old report/context/review; older snapshots load without report fields.

## Implementation and independent review

- Helper generation/state/PDF/draft suites: 59 tests pass. An independent input review found oversized history could be removed during normalization after the original source-presence check; four RED→GREEN regressions now reject malformed/oversized study context before normalization and require meaningful normalized source before any AI call.
- Persistence: six radiology cases plus four existing record-note cases pass, including local remount, snapshot restore, old charts, malformed imported fields and new-visit isolation.
- UI review reproduced language changes leaving old review/export active and retained auth-error details. Both are fixed. Deferred consent, PDF/auth/source changes, repeated clicks and source/readOnly change-and-restoration regressions pass; proposals never mutate original findings.
- Independent final UI/export review PASS: 10 suites /151 tests, TypeScript and lint. Independent parent EntryGrid checks: six suites /49 tests. Independent helper/AI review PASS: four suites /59 final helper tests plus earlier 13 suites /479 routing/persistence/voice tests. No open actionable finding remains in those scopes.
- Routing/admin worker: seven suites /285 tests, including unchanged English voice request/prompt snapshots. New model settings use existing server choices, not a client-selected model/key.
- Initial full suite found app-frame section-isolation mock omissions and two identical-English translation inconsistencies. The frame now stubs this independently pseudo-tested section as it already does other sections; German Draft language and Italian Download PDF use the existing matching translations. Both affected suites pass 26 tests after correction. No product code was changed for those fixture/catalog corrections.

### Targeted rendered coverage

| Actual surface | Widths | Captured synthetic states |
| --- | --- | --- |
| RadiologyReportSection | 1440, 390, 320 | Empty, recorded findings, expanded study context, generated preview, applied draft, reviewed report, stale source, read-only, generation error, long text/names, PDF error |
| PimsDrafts generation | 1440, 390, 320 | Generated preview, applied unreviewed draft, generation error |
| Admin AI configuration | 1440, 390, 320 | New radiology model row configured and model update complete |

Report/PIMS: 42 cases, no page errors or horizontal overflow, ordinary buttons/selects/textareas/summary at least 44px, at most one primary action. Worker inspected 320px preview, 390px reviewed,desktop context and 320px PIMS preview; main inspected 320px preview and desktop context. Harness/log `/private/tmp/radiology-report-ui-visual.{cjs,log}`; screenshots `/private/tmp/radiology-report-ui-{report|pims}-{width}-{scenario}.png`.

Admin: six cases, no page errors/overflow and 44px selectors; inspected desktop and phone results. Harness/log `/private/tmp/radiology-ai-admin-visual.cjs`, `/private/tmp/radiology-ai-admin-visual.log`; screenshots `/private/tmp/radiology-ai-admin-{width}-{configured,updated}.png`. The harness was corrected to load owning app styles. Report harness React import versioning and mocked generation setup were corrected before final captures; these were harness changes.

These are targeted component/admin state checks with synthetic AI/auth/backend services and blocked external requests, not a full-app UI review, hosted auth/service validation, live model factuality test or live radiology-provider test. The app's native report generation works from text records and does not interpret images. Existing chart PDF behavior is unchanged; a standalone report PDF is offered.

### Cloud review persistence correction

A final root check found nested object-key insertion order in source fingerprints could change under PostgreSQL JSONB even when clinical values were unchanged. A synthetic SQL probe confirmed key reordering; the helper regression reproduced loss of reviewed status. Canonical JSON now sorts object keys recursively while retaining array order, values and types. Clinical changes still invalidate review. The actual chart-state `applySnapshot` path is covered by a cloud-style reordered JSON regression. Independent recheck PASS: two suites /19 tests, TypeScript and diff check. Helper/PDF/draft total is now 60 tests; persistence totals seven radiology cases plus four existing record-note cases.

Final visual pass also explicitly asserts keyboard focus outlines on both report and PIMS Use draft actions. All 42 report/PIMS cases and six admin cases pass; task-owned 5204 server stopped. No rendered source change was needed after final captures.

The integrated suite after fixture/catalog corrections passed 331 files / 4,362 tests before the two final canonical-persistence regressions were added. The frozen-source rerun result is recorded below. Final app, development/store extension builds, packaging and translation check pass; logs `/private/tmp/radiology-report-verified-{build,extension,package,i18n}.log`. Existing non-fatal bundle/dynamic-import, canvas/localStorage and Capacitor sourcemap warnings remain.

Final frozen-source `PIMS_TEST_CONTAINER=toothops-pims-foundation-20261116 npm test`: **331 files / 4,364 tests pass**, exit zero, including all 166 PostgreSQL tests. Log `/private/tmp/radiology-report-verified-tests.log`. App/extension/store builds, translation checks and diff validation pass. No live AI/provider calls, deployment, commit or push; all earlier uncommitted work remains local.
