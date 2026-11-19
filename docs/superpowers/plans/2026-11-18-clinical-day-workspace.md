# Clinical-day workspace and mapped Paste All

## User-authorized scope

Merge current main into the existing parity worktree, implement saved section mappings/Paste All, update radiology to current enterprise UI guidance, add consultation/discharge entry tabs inferred from existing visit data, and use public CoVet/ScribbleVet screenshots as references. Keep architecture extensible for future GP transcription without implementing a new speech pipeline now.

Main was fetched at9ef7eb8 and merged into feat/pims-extension-parity as179d9c5 after checkpoint17794e1. Pre-checkpoint4466 tests/build pass; resolved merge4505 tests/build pass. Main workspace/branch is unchanged.

## Reference and design decisions

Public references viewed: CoVet case page https://co.vet/campaigns/case-page/ (one patient/visit, recording+notes sources, generated record/summary outputs); CoVet discharge https://help.co.vet/en/articles/14122487-generating-client-visit-and-discharge-summaries (consultation source → editable client summary); CoVet mapping https://help.co.vet/en/articles/14122523-use-the-covet-chrome-extension-with-your-web-based-pms (saved template/PMS maps and Paste All); ScribbleVet https://www.scribblevet.com/whats-new (radiograph template selector and grouped client-care output). Screenshots downloaded only to /private/tmp/{covet-case-reference,scribblevet-radiograph-reference,scribblevet-discharge-reference}.png. These establish public workflows, not vendor database schemas.

Reuse GitHub/Atlassian form hierarchy: section header+short purpose text, visible helper text associated with inputs, compact action row, optional details in a disclosure, review state adjacent to output. Follow existing ToothOps SectionHeader, patient-form classes, diagram-view__action buttons, --surface/--border/--text/--primary and --shadow-xs/sm/md/lg from latest main. No new typography/palette, no nested decorative cards. Desktop source/report layout may split into columns; phones stack and preserve44px controls. One primary action for the current task.

Wireframe shown in commentary: Patient → Consultation → Exam/Charting → Imaging/Radiology → Treatment → Discharge. Consultation adds history/assessment/plan alongside the shared complaint and existing exam/chart, with Review clinical record. Discharge adds only recorded medications/instructions/follow-up; reuse the existing owner report for client output and existing feature gate. New patient/visit semantics stay in ChartSnapshot, not a second case/encounter store. Preserve the owner-report deep link as an alias to discharge.

## Data and extensibility

- Add6 optional bounded source strings on PatientInfo: consultationHistory, consultationAssessment, consultationPlan, dischargeMedications, dischargeInstructions, dischargeFollowUp. Existing complaint/treatmentReport/recallDate/exam/teeth remain their owners. New fields persist through existing snapshot/JSON/PDF patient-info stash, normalize on load and clear for new visits.
- A declarative visit-document template registry defines stable document IDs, labels/helpers and field IDs. Initial templates consultation-v1 and discharge-v1; future GP templates reuse the same forms/mapping infrastructure rather than depending on tooth numbers.
- Clinical record-note composition adds explicit documented consultation/discharge sections, includes sources in its stale basis, and preserves old output byte-for-byte when fields absent. New mapping source keys default to no destination. Include source-only content in autosave eligibility.
- Existing owner-report model/AI facts must receive explicit discharge source. Preserve manual report overrides and client-language behavior; render recorded wording verbatim rather than invent translations, doses, normal findings, completion or follow-up. Existing output review fingerprint must invalidate on new source changes.
- Keep generated/editable output separate from sources. Consultation reuses existing RecordNotePanel; Discharge reuses OwnerReportSection and practice language/feature access. No new AI feature/server prompt or English voice behavior changes required.

## Saved mapping/Paste All contract

Mapping key = authenticated user + provider + origin + stable template ID. Store only section IDs→field labels, never note text/tokens/patient IDs. Use a dedicated owned-settings table/RPC with validation, RLS/privileges and version conflict checks; do not overwrite existing profile PIMS maps. New migration20261209_pims_note_mappings.sql.

UI keeps source review, explicit selected tab/field inspection and clinician confirmation. Render source-section→destination rows (or a single edited-note row if unsplittable); missing saved destinations visibly block preparation. Save mappings explicitly; saved maps never skip destination review. Group sections mapped to the same field in source order so each field gets one append. Prepare one ticket per distinct field, then one reviewed Paste All action dispatches sequentially. Stop immediately on blocked/unknown/source/auth/destination changes; show per-field results and skipped remainder. Never retry an uncertain or partial batch automatically, save the PIMS or mark Sent. Keep single-field behavior available. Bounded helper ticket storage may hold multiple distinct prepared fields but every ticket remains one-use/expiring/original-content-bound; preparation for the same field replaces its prior ticket.

## Plan

- [x] Checkpoint and merge main; resolve additive locales/import conflicts and verify.
- [x] Implement mapping persistence, explicit mapping UI and bounded grouped Paste All with adversarial/unit/DB tests.
- [x] Add optional source fields, normalization/new-visit/autosave/PDF/record-note/owner-report integration and declarative template-driven entry form with translations/pseudo tests.
- [x] Restyle radiology with shared clinical components, clear source/output/helper/action hierarchy, preserving all generation/review/async guards.
- [x] Integrate Consultation and Discharge in existing section routing/web/native menus, preserve old owner-report links/feature gates and current-main visit behavior.
- [x] Independent scoped reviews; full tests/builds/extension package/translation checks. Explicit screenshot coverage matrix at1440/390/320 (light/dark, empty/populated/long, single/multiple visits, review/proposal/error/menus/mapping partial outcomes) and declared gaps. No deploy/push or merge of this feature branch into main unless separately requested.

## Implementation and validation results

Saved mappings are user/provider/origin/template scoped and use owned RPCs with optimistic version checks. Paste All groups source sections by destination and appends once per field; partial/unknown outcomes persist until a fresh preparation and explicitly warn against duplicate pasting. Independent mapping/UI/helper/SQL review passed. Migration `20261209_pims_note_mappings.sql` is local and has not been deployed.

Consultation and Discharge use the six bounded optional source fields and declarative document registry. Snapshot/cloud/PDF round trips, new-visit reset, source-only autosave, record-note sections, owner-report facts and stale-source detection are covered. Discharge source remains available when owner reports are disabled; existing report access remains gated. Explicitly clearing an owner-report override stays empty; Reset restores recorded discharge source. Shared labels now remain associated with their textareas when Reset is visible. Legacy owner-report routes resolve to Discharge. No speech prompts or extraction requests changed.

Radiology now uses current clinical tokens and shared form hierarchy, linked helpers, optional study context and clear source/output actions. Consultation history supplies fallback study history; recorded assessment/plan contribute context and invalidate stale drafts. Manual radiology history takes precedence. Floating whole-chart export is omitted in Consultation, Discharge and Imaging, whose inline report actions avoid field overlap and competing primaries. The PDF walkthrough navigates to Treatment before targeting whole-chart export.

Independent clinical review passed, including the inline-action follow-up. Production build includes translation validation, lint and TypeScript. The store extension package builds successfully with its manifest key removed. Final `npm test -- --maxWorkers=4` with `PIMS_TEST_CONTAINER` passed 4,600 tests across 345 files; `npm run build` passed and translation check reports `todo=0 remove=0`. Build reports existing chunk-size/dynamic-import warnings, without errors.

## Screenshot coverage and limits

| Surface/state | 1440px light/dark | 390px light/dark | 320px light/dark |
| --- | --- | --- | --- |
| Full visit: Consultation, Discharge, Imaging; empty/populated/long source; long patient name; single/multiple visits; saved read-only visit | Captured | Captured | Captured |
| Expanded section navigation, Consultation/Discharge placement, Escape focus restoration | Desktop section rail | Captured/asserted | Captured/asserted |
| Radiology: optional context, proposal, applied/reviewed/stale, read-only, generation/PDF errors, manual/AI-off, autocomplete | Captured/asserted | Captured/asserted | Captured/asserted |
| Mapped paste: empty, unmapped, mapped, prepared/review, filled, unknown, missing field, long labels, options, partial/blocked/skipped | Captured/asserted | Captured/asserted | Captured/asserted |

Integrated harness: `/private/tmp/clinical-day-workspace-visual.cjs`; 90 full-visit captures, zero page errors and no horizontal overflow. Menu harness adds 18 captures with phone Escape/focus assertions. Radiology component harness adds 84 captures; mapped-paste harness adds 60. Representative screenshots were visually inspected across all viewport sizes, themes and the listed state groups. The phone overlap found during inspection was fixed and recaptured. Native select popups are operating-system surfaces and were not screenshot-reviewed; the multiple-visit control and available options were checked in-browser.

This is a scoped UI review, not full application coverage: live authenticated PIMS/editor sessions, real cloud/AI transport, installed-extension interaction, clipboard permissions, native iOS runtime and production PDF sharing remain unverified. The visual harness uses synthetic patient/visit data and mocked services; request/model/permission behavior is separately tested. Dev HMR socket warnings occur in the intercepted local harness; no business-runtime page errors were observed. Public vendor screenshots establish workflow references only; private template/schema/prompt equivalence is not claimed. Future GP templates can reuse the registry and shared visit sources, but GP voice/exam extraction is not implemented by this change.
