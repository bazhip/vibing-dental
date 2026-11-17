# Professional Workspace Implementation Plan

> Execution: coordinated independent implementation with integration and final review.

**Goal:** Give patients, visits, administration and personal settings predictable homes.
**Architecture:** Reuse clinical components and protections; add page presentations and routes for the web, leaving native presentations intact. Split navigation by scope.
**Tech Stack:** React, TypeScript, CSS tokens, i18next, Vitest.
**Spec:** docs/superpowers/specs/2026-11-16-professional-workspace.md

## Global constraints
- All text translated en/fr/de/it/es; preserve placeholders and stamp changed translations.
- Preserve voice behavior, clinical data, authorization and save/discard protections.
- Keep native iOS navigation and billing restrictions intact.

## Tasks
- [x] Patients: page presentation, retained filters, clear patient/visit actions; test canceled import and page access.
- [x] Practice: sectioned page presentation with unchanged native/modal behavior; test drafts and permissions.
- [x] Navigation: direct Patients destination, independent visit menu, Help and account menus, practice route; test destinations and keyboard dismissal.
- [x] Copy: consistent patient/visit terminology and professional landing copy across five languages.
- [x] Integration: responsive styling, translations, full tests/build and independent review.

## Review focus
Canceled imports must stay in Patients. Draft practice names must survive section switches and confirm on departure. Library route must retain the working chart without allowing hidden interaction. Native billing restrictions must persist. Browser back/forward must select the expected destination without overwriting clinical data.

## Progress
Branch creation blocked by sandbox; using current workspace with uncommitted changes. Tasks delegated by disjoint file ownership; root owns navigation, integration, metadata and validation.


## Verification
- Final `npm test`: 253 files, 2,579 tests passed.
- Final `npm run build`: passed translations, lint, TypeScript and production bundling. Vite reports existing large-chunk warnings.
- Missing locally installed DICOM dependencies restored with npm install; package manifests and lockfile unchanged.
- Chrome with synthetic data: Patients/settings/visit navigation, 1440px desktop and 390px mobile screenshots; no page errors or horizontal overflow. Verified practice draft retention, canceled Back and approved Discard.
- Independent review: routing PASS after fixing skip-link navigation, dirty-settings exits, and browser-history restoration. All route consumers now share one navigation gate.
- Native iOS automated coverage passes; real microphone and live cloud/billing operations were not exercised in browser fixtures.
- Changes remain uncommitted in the requested workspace; no deployment performed.

## Expanded UI implementation
- [x] Reproduce missing patient return while scrolled; add pinned All patients action and regression/pseudo-locale coverage.
- [x] Shell: improve global destination hierarchy, compact clinical rail, predictable header actions and responsive wrapping.
- [x] Clinical forms: shared typography, field/control rhythm, restrained section headers, tables and toolbars without changing grid geometry.
- [x] Dialogs: coordinated headers, footers, content spacing, button hierarchy and responsive sizing.
- [x] Patients/settings: coordinated page widths, calmer directory rows and action hierarchy.
- [x] Review every chart section and representative dialogs in Chrome; full tests/build and final review.


## Expanded UI verification
- Confirmed original return-path bug: at chart scroll Y=500 the workspace nav was above viewport, while the sticky header had no patient-directory action. Added All patients to that header; browser verified return from scrolled Charting and pseudo-locale integration test passes.
- All nine chart sections rendered in Chrome at 1440px and 390px; no page horizontal overflow or application exceptions during section traversal.
- Inspected account, feedback, reminder and document dialog layouts. Live cloud data and delivery were mocked; reminders showed loading and document attachments could not load in the fixture. Chrome's embedded PDF viewer emitted a storage exception in headless mode; native PDF viewing was not changed by this pass.
- Independent styling/pseudo-locale review passed. Production build passed with existing chunk-size warnings.
- Web-specific CSS preserves native iOS controls, diagram/grid geometry, clinical signal colors and voice behavior.

## Customization and product-wide consistency pass

User extended scope to customization menus, all product surfaces, compact phone navigation, and Imaging behavior.

Implemented:
- Chart customization: desktop category rail; one compact phone selector; contextual entry; persistent Done; grouped layout/input controls; explicit account/browser scope; positive Recheck setting; preserve drafts across categories and flush text edits on close.
- Owner-report customization: Basics/layout, Report content, Home care, Closing; compact template/category selection on phones; persistent save/cancel/preview; preserve role and failed-load protections.
- Persistent labels for custom anesthesia definitions.
- Mobile topbar: More consolidates account/help/secondary visit actions while retaining patients, dictation and edit controls.
- Mobile section picker: restore trigger focus and constrain height to the remaining visual viewport, including resize/keyboard changes.
- Documents and treatment templates: modal focus containment/restoration; document tabs use arrows, Home/End and one tab stop.
- Landing authentication and sample-chart lightbox: shared modal focus management.
- Dictation failures remain visible until the next attempt rather than disappearing after eight seconds.
- Imaging: rename navigation and contextual references; radiographic findings follow uploaded images; no pre-upload classification choice; ordinary files default to Image; existing DICOM detection sets Radiograph; per-image classification stays editable and persists.
- All changed copy translated in French, German, Italian and Spanish; metadata stamped.

Audit coverage and disposition:

| Area | Review / outcome |
| --- | --- |
| Patients and visit navigation | Persistent return to patients; saved list filters; guarded practice navigation; desktop/phone checks. |
| Patient, exam, anesthesia, charting, diagnosis, procedure | Shared field/section hierarchy and compact navigation; nine-section desktop/390px browser sweep completed in earlier pass. |
| Imaging | Upload default/type persistence tests; read-only checks; browser verifies findings follow images. |
| Dictation | Persistent errors fixed; extraction behavior untouched. Physical-device keyboard/microphone testing remains outside browser fixtures. |
| Reports, templates and PDFs | Category organization, role restrictions, draft preservation and keyboard navigation covered; PDF fixture has no real attachment backend. |
| Account, team, practice, billing | Existing retry, role and dirty-state guards reviewed; shared dialog/workspace styling. Live billing and membership writes not performed. |
| Landing, authentication, onboarding | Consistent navigation copy and modal focus handling; localization tests. |
| Native iOS | Shared behavior regression tests; native settings screens retained. Simulator/device visual verification remains separate. |
| Administration | Source audit completed; intentionally English operator-only surface retained. Admin tabs now use arrow/Home/End navigation and a single tab stop. |

Verification: full suite at this checkpoint 256 files / 2615 tests; production build passes (existing bundle-size warnings). Browser customization checks at 1440, 390 and 320px show no horizontal overflow and an accessible Done action; local fixture has no application errors. Real backend uploads are covered at the mocked persistence boundary, not performed against patient records.

Final follow-through: owner-template discard/delete prompts use the shared explicit-action dialogs, guard stale approvals, and prevent template mutations during saving. The mobile action row wraps without clipping. Report editor browser checks at 1440/390/320px passed without overflow or application errors. Landing sign-in focus restoration is covered with an autofocus child.

Final validation: npm test passed (256 files, 2615 tests); npm run build passed including translation consistency, ESLint and TypeScript. Shared web confirmation/prompt/choice dialogs now trap focus, with nested-dialog regression coverage. No commits or deployment performed.

Pre-PR review found that workspace navigation guarded only the practice-name draft while the owner-template editor was open. The workspace now composes the active template editor's existing discard guard before checking the practice-name draft. A real-component regression covers keeping template edits when navigation is cancelled and allowing navigation after explicit discard.
