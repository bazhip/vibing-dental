# Explicit Finalization Implementation Plan

> Execute inline in this session using superpowers:executing-plans and test-driven-development. User authorized implementation with “yes go ahead”.

**Goal:** Replace automatic date-based locking with persistent explicit finalization and show finalized status in My charts.
**Architecture:** Optional finalizedAt snapshot field; cloud lifecycle save uses the existing save safeguards and commits local status after persistence. Query status from snapshot JSON. Web/native headers share lifecycle handlers.
**Tech Stack:** React, TypeScript, Supabase JSON snapshots, Vitest, existing CSS/i18next.
**Spec:** docs/superpowers/specs/2026-11-18-explicit-finalization-design.md

## Global Constraints

Preserve unrelated workspace edits; no commit requested. Use existing UI tokens and translate new labels into every enabled locale. npm test and npm run build required. Inspect rendered screenshots where browser tooling permits.

## Review Focus

Failed/cancelled saves leave state unchanged. A chart switch during a save must not finalize the new chart. In-flight autosaves must settle before finalization. Old saved records remain editable irrespective of date. New visits reset status.

### Task 1: Persistent status and cloud transitions

Files: src/types/index.ts, src/hooks/useChartState.ts, src/hooks/useCloudSync.ts, src/utils/chartQueries.ts and their tests.
Interface: ChartSnapshot.finalizedAt?: string, chart.finalizedAt: string|null, chart.setFinalizedAt; cloud.setFinalized(boolean): Promise<boolean>.
- [x] Add failing tests for persistence/reset and finalizing/reopening, network failure and cancellation.
- [x] Run targeted Vitest tests; confirm expected failures.
- [x] Implement snapshot persistence and serialized lifecycle saves after draining pending saves; reuse identity/duplicate/conflict protections.
- [x] Run targeted tests; expect pass.

### Task 2: Header lifecycle and library status

Files: src/EntryGrid.tsx, src/ios/chart/ChartNavBar.tsx, src/components/ChartLibrary.tsx, owning styles and existing UI tests.
Consumes Task 1 status and setFinalized API.
- [x] Add failing tests for past visits editable until finalized, explicit finalize/reopen, failed transition, grouped and individual statuses.
- [x] Run tests; confirm expected failures.
- [x] Replace date/session lock logic with finalizedAt; add header actions and list column; retain optional undo for reopened records.
- [x] Translate labels, stamp translations, run targeted tests and pseudo-locale coverage.

### Task 3: Verification and visual review

- [x] Run npm test and npm run build; resolve relevant failures, report any unrelated blockers.
- [x] Inspect desktop/320/390px screenshots for header states, populated/empty list, long names, single/multiple visits and expanded menus.
- [x] Review complete diff for persistence races and unintended edits, report exact verification and limitations.


## Additional authorized scope

The user requested saving/saved feedback inside the patient tab, like Editing. Added compact translated indicators on the active AnimalTabs tab and removed saving/saved status toasts. Retry/error and manual-save notifications remain actionable outside the tab button. The saved timestamp is available in a translated tooltip.

## Verification

- `npm test`: 282 files, 3021 tests passed.
- `npm run build`: passed, including i18n, ESLint and TypeScript checks; existing bundle-size advisory remains.
- `git diff --check`: passed.
- Independent read-only review found lifecycle saves missing from workspace capture and a missing chart-identity guard on fork completion. Both reproduced with failing regression tests, fixed, and verified with the complete suite. Added an explicit regression guard against autosaving finalized records created on this device.
- Implementation initially left uncommitted; user subsequently requested a PR. Preexisting workspace edits retained.

## Changed-UI browser coverage

Local Chrome with mocked cloud/profile fixtures; real application components and CSS. The browser run captured all cells below and found no page-width overflow. Manually inspected representative desktop and phone screenshots covering every listed state; this is scoped changed-UI verification, not a full product UI review.

| Screen/state | 1440px | 390px | 320px |
| --- | --- | --- | --- |
| Editable record, short name / single visit | Captured + finalize/reopen exercised | Captured + finalize/reopen exercised | Captured + finalize/reopen exercised |
| Editable record, long name / multiple visits | Captured | Captured | Captured |
| Patient-tab Saving indicator | Captured | Captured | Captured |
| Finalized record, disabled forms, header Edit | Captured | Captured | Captured |
| Reopened record, Editing and Saved indicators | Captured | Captured | Captured |
| Patients list, single/multiple visits and statuses | Captured | Captured | Captured |
| Expanded visit rows and individual statuses | Captured | Captured | Captured |
| Expanded row-action menu | Captured | Captured | Captured |
| Empty Patients list and focus state | Captured | Captured | Captured |

Artifacts: `/private/tmp/explicit-finalization-visual.json`, `/private/tmp/finalization-<width>-<scenario>.png`.

Gaps: live multi-device Supabase integration, native device screenshots, dark mode and translated-language screenshots were not exercised. Native behavior and translation coverage were tested with Vitest/pseudo-locale tests.


## PR preparation on current main

Created isolated branch `feat/explicit-chart-finalization` from `origin/main` at `1dd4e46`. Excluded unrelated working-tree changes. Preserved current dropdown chevrons and right-to-left support when applying the feature; added finalization/Saved translations for all nine enabled languages (en/fr/de/it/es/hu/ro/zh/ar). Corrected duplicate responsive CSS declarations introduced while implementing visit alignment.

Validation on the isolated branch: `npm test` passed all 288 files / 3088 tests; `npm run build` passed i18n checks, ESLint, TypeScript and Vite. The existing large-bundle advisory remains. Repeated the 1440/390/320px fixture screenshot run on this branch; artifacts are `/private/tmp/finalization-pr-<width>-<scenario>.png` and `/private/tmp/explicit-finalization-pr-visual.json`. Native-device and live multi-device integration remain untested.
