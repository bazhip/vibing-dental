# Animal Tabs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved animal tabs in the web charting workspace.
**Architecture:** A workspace hook tracks animal metadata and local trial snapshots, captures per-visit working copies and pauses autosave during transitions, and delegates cloud retrieval to useCloudSync. A translated tab component renders navigation; EntryGrid connects opening, closing, new patients, and the empty state.
**Tech Stack:** React, TypeScript, existing CSS tokens, i18next, Vitest.
**Spec:** docs/superpowers/specs/2026-11-16-animal-tabs-design.md

## Global constraints

- Preserve native navigation and existing cloud conflict/save safeguards.
- Translate new text into all five app languages; stamp translations.
- Run npm test and npm run build; inspect desktop and 320/390px screenshots.

## Review focus

- Switching preserves unsaved work; failed closing saves must not discard a chart.
- Switching visits must not duplicate animal tabs.
- Closing an inactive tab must not change the active chart.
- Local charts must retain independent clinical data.
- Long names, keyboard focus, and the last-tab empty state must remain usable.

### Task 1: Workspace state and transitions
- [x] Write and run failing hook tests for the five review cases and concurrent transitions.
- [x] Implement src/hooks/useAnimalTabs.ts using working-copy capture/restore and existing chart APIs.
- [x] Run npm test -- src/hooks/useAnimalTabs.test.tsx.

### Task 2: Translated tabs and integration
- [x] Write component interaction and pseudo-locale tests.
- [x] Add AnimalTabs.tsx and AnimalTabs.css; integrate in EntryGrid inside the patient header, preserve native behavior, and replace web new-patient reload with an in-place blank visit.
- [x] Translate and stamp app:animalTabs keys in en/fr/de/it/es.
- [x] Run focused component and EntryGrid regression tests.

### Task 3: Verification
- [x] Run npm test and npm run build.
- [x] Inspect populated, empty, picker, long-name and visit states on desktop and 320/390px phones; fix discovered issues.
- [x] Review the diff and leave the implementation available for user review.


## Verification record

- `npm test`: 272 files, 2,812 tests passed (latest completed full run).
- `npm run build`: passed (translation checks: 0 problems, lint, TypeScript, Vite).
- `git diff --check`: passed.
- Independent review identified local close retention, transition serialization, focus restoration, and ezyVet reload dependency. Addressed each; hook/component/handover tests and browser interactions verify the resulting behavior.

| State | Desktop | 390px | 320px |
| --- | --- | --- | --- |
| Local populated chart, multiple animals, long name | Inspected | Inspected | Inspected; fixed header wrapping and visible close target |
| Separate notes after switching and reopening | Browser checked | Same responsive component | Browser checked |
| Empty workspace | Component test | Inspected | Inspected |
| Patient picker with single/multiple visits | Inspected with browser fixture | Not separately inspected | Not separately inspected |
| Close-button keyboard focus | Component test | Same component | Browser checked |

This is a focused review of the changed surfaces, not a full application UI review. Live authenticated Supabase saves and the external ezyVet side panel were not exercised; save failure/success/cancellation, overlapping operations, and handoff behavior are covered by automated tests. Cloud picker visual checks used isolated fixture responses.

Implementation decisions: tabs live for the mounted app session; cloud switches preserve working copies and their dirty/conflict state; closed local charts remain reopenable through + during the session. Existing native chart navigation is retained.


## Subsequent UI review

The user refined settings into a modal with section navigation, moved practice settings into the account menu, removed sidebar destinations, added missing-logo and practice-name settings affordances, moved save feedback into colored bottom toasts, and requested imaging spacing/count cleanup. These supersede the original prototype.

| Latest surface/state | Desktop | 390px | 320px |
| --- | --- | --- | --- |
| Long-name tab, plus, header | Screenshot inspected | Screenshot inspected | Screenshot inspected |
| Account menu | Screenshot inspected | More uses accessible ellipsis | More uses accessible ellipsis |
| Practice settings General modal | Sidebar screenshot inspected | Screenshot inspected | Screenshot inspected |
| Editing amber edge and label | Screenshot inspected | Screenshot inspected | Screenshot inspected |
| Unsaved/saved/error toast | Fixture screenshots inspected | Shared responsive toast | Shared responsive toast |
| Patients picker | Fixture screenshot inspected | Earlier capture only | Earlier capture only |

Independent review caught the modal width/display conflict and undersized Charting preferences action. Fixed the owning CSS rules and extended the 44px action rule to the modal. This remains a focused review, not full application coverage: live cloud operations, every populated settings tab, and a final screenshot of the expanded native visit chooser were not exercised. Save/restore, modal navigation, localization, and controlled toast cleanup have automated coverage.

Final refinements: patient-row backgrounds open the latest visit with hover feedback while nested actions remain isolated; the first tab aligns with the chart card. Dark-theme desktop and 320px screenshots were inspected for header alignment, editing state, and colored toasts.
