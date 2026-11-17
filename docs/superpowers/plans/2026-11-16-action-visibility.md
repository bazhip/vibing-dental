# Action Visibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make app actions discoverable, expose treatment template titles, and replace owner-report review with email confirmation.
**Architecture:** Update owning shared styles; remove persisted review gating while retaining current-PDF and attachment checks; link existing template editor from settings titles.
**Tech Stack:** React, TypeScript, CSS, i18next, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-16-action-visibility-design.md

## Global Constraints
Preserve clinical teal design and chart geometry. Translate new strings into fr/de/it/es. Check screenshots at desktop, 320px and 390px. Run npm test and npm run build. Send no live emails.

## Review Focus
- Confirmation cancellation and double-clicks must send no duplicate email.
- Chart/PDF/recipient changes during confirmation must prevent stale sends.
- Incomplete or remotely changed attachments must block sending.
- Long template titles must wrap and select the correct template.
- Selected, enabled and disabled controls must remain visually distinct on phones.

## Task 1: Owner report flow
Files: OwnerReportSection.tsx, OwnerReportModal.tsx, OwnerReportEmailModal.tsx, ownerReportPdf.ts; related tests and reportui locales.
- [x] Change tests to expect ordinary export and email without review; add confirmation cancellation and pending-confirmation tests; run focused tests and observe failures.
- [x] Remove review UI and PDF draft markings. Replace review gating with PDF readiness and freshness checks. Confirm recipient/attachment before encoding and sending; revalidate afterwards.
- [x] Translate confirmation text and stamp; run focused tests.

## Task 2: Treatment template titles
Files: PracticeSettingsModal.tsx, ReportTemplatesModal.tsx, associated tests.
Interface: optional initialTemplateId prop on ReportTemplatesModal, selected on opening.
- [x] Test initial selection by ID and settings title links before implementing.
- [x] Render saved titles in settings and open selected template directly, retaining unsaved-edit protection and new-template action.
- [x] Run related settings/template/i18n tests.

## Task 3: Shared visibility
Files: themes.css, EntryGrid.css, Workspace.css, ClinicalPolish.css, DialogPolish.css, PatientsWorkspace.css, AccountSurfaces.css, native styles where needed.
- [x] Audit primary/secondary/selected/warning styles; update owning definitions using shared semantic tokens.
- [x] Inspect screenshots in a recorded screen/state/viewport matrix and fix overflow/contrast/focus issues.

## Task 4: Verification
- [x] Run npm test and npm run build; review complete diff and resolve defects.
- [x] Record visual coverage and gaps; leave a reviewable worktree (no requested commit/merge).

## Execution ledger
Approved design; subsequent user request adds directly visible treatment template titles. Execute inline without another approval round. Worktree b6a2, baseline 5423c49. Tasks 1/2 share dialog styling with task 3; behavior first, style second. No commit requested; leave changes uncommitted after checks.


## Results
- Added user-reported practice-name load and Back-to-current-visit fixes, each reproduced with failing tests before fixing.
- Full test run: 266 files, 2,745 tests passed. Build passes i18n checks, lint, TypeScript and Vite; only existing bundle-size guidance remains.
- Independent reviewer found two confirmation issues (Escape interception and a server-side changed recipient); both fixed with regression tests and re-reviewed PASS.
- Recipient precondition is backward compatible for older app clients. Deploy `send-owner-report` with the app release to activate server mismatch protection.
- Baseline codec failures were a worktree dependency-symlink artifact; using local dependencies resolved all seven without product changes.
- Visual review found a treatment/owner template CSS class collision; treatment selectors now have their own prefix.
- Detailed screenshot coverage and remaining environment gaps: `2026-11-16-action-visibility-coverage.md`.
