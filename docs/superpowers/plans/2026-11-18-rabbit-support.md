# Rabbit Support Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add rabbit charts and group rabbit/equine under Other.
**Architecture:** Extend the existing Species union, anatomical data, SVG geometry and PDF/report mappings. Reuse PatientForm for web/native selection.
**Tech Stack:** React, TypeScript, SVG, Vitest, i18next, pdf-lib.
**Spec:** docs/superpowers/specs/2026-11-18-rabbit-support-design.md

## Global Constraints
Preserve existing uncommitted changes, clinical styling, 44px phone targets, translated UI, English voice snapshots. Run npm test and npm run build before any commit. No commit or external publication requested.

## Review Focus
- Switching from deciduous dog/cat to rabbit produces permanent rabbit dentition.
- Saving/reopening/export/import retain rabbit identity and all 28 teeth.
- Peg incisors stay separately selectable; labels do not overlap.
- Rabbit owner reports avoid dog/cat brushing and chew advice.
- Other selector works with keyboard, native forms, translations and narrow phones.

### Task 1: Anatomy and persistence
**Files:** src/types/index.ts; src/utils/species.ts; src/constants/{toothData,toothShapes,chartLayout,rabbitTeeth}.ts; public/diagrams/rabbit.svg; scripts/diagrams/rabbit-teeth.py; src/utils/{pocket,recordNote}.ts; src/utils/pdf/{layout,sections}.ts.
**Interfaces:** Species includes rabbit; getInitialToothData, TOOTH_DIAGRAMS and TOOTH_GRID_LAYOUTS cover rabbit.
- [x] Add rabbit anatomy, grid/diagram parity, orientation and root-label tests; run to see failures.
- [x] Generate vector artwork with individual closed hit shapes and integrate all species mappings.
- [x] Verify anatomy and species tests pass; add PDF roundtrip regression.

### Task 2: Selector and translations
**Files:** src/components/{PatientForm,ChartLibrary}.tsx; src/components/EntryGrid.css; src/locales/*/{forms,app,pdf,onboarding}.json; existing form/pseudo-locale tests.
**Interfaces:** PatientForm.onSpeciesChange emits rabbit/equine through the Other selector.
- [x] Add tests for rabbit/equine selection from deciduous charts and native/web forms; run to see failures.
- [x] Build compact Other dropdown with selected-species label and existing styling.
- [x] Translate all enabled app languages, stamp metadata, verify interaction and pseudo-locale tests.

### Task 3: Reports and validation
**Files:** src/utils/{ownerReport,ownerReportI18n}.ts; src/locales/*/report.json; report tests; scripts/fixtures/rabbit-preview.*; docs/design/rabbit-support-verification.md.
**Interfaces:** ReportStrings.homecareTipsRabbit provides client-language defaults.
- [x] Add failing rabbit report-default test, then implement translated rabbit defaults and species labels.
- [x] Run full npm test and npm run build, resolve failures.
- [x] Inspect screenshots for desktop/390/320, long names, empty/populated states and open Other menu; record coverage and gaps.
- [x] Review final diff and report results without committing unrelated user changes.

## Execution ledger
Ruling: Work in the provided feature checkout to preserve the user's existing theme changes and immediate preview; no worktree creation or branch mutation is necessary.

Task 1: complete — red/green anatomy tests, 28 closed tooth shapes, PDF table coverage and import/export roundtrip.
Task 2: complete — web/native selector tests and pseudo-locale checks; all enabled app locale additions stamped. Native labels stacked after screenshot review found 320px overlap.
Task 3: complete — rabbit report defaults including Portuguese; 16 browser cases passed; independent read-only review PASS; full test/build evidence and coverage gaps in docs/design/rabbit-support-verification.md.
Ruling: node --import tsx executed the translation stamping CLI because the tsx wrapper's IPC pipe is blocked in the sandbox; the same translation code and arguments ran without API calls.
Ruling: no commit, merge or deployment made; work remains reviewable in the supplied checkout alongside preserved theme changes.
