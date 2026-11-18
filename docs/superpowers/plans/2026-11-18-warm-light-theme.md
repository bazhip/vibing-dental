# Warm light theme implementation plan

> Execute inline in the current workspace. The user approved the palette mockup on November 18, 2026.

**Goal:** Apply the approved subtle tan/white/teal palette throughout web light mode and give Review and export one consistent teal appearance.
**Architecture:** Change shared screen tokens and align legacy web `--ios-*` aliases. Keep native, dark, print, and PDF record palettes independent. Remove the section-dependent export variant at its source.
**Tech stack:** React, CSS custom properties, Vitest, Vite, Playwright for visual inspection.
**Spec:** `docs/design/2026-11-18-warm-light-theme.md` and its approved HTML mockup.

## Constraints and review focus

Preserve unrelated dirty files. No commits or merges requested. No new user-facing copy. Keep existing typography, geometry, 44px phone targets, and clinical signals. Check dark mode, enabled versus disabled controls, long names, menus, and PDF palette isolation.

## Tasks

- [x] Update `src/styles/themes.css`: warm web light canvas #f6f3ed, white surfaces, alternate #fbf9f5, recessed #efebe3, text #24312f, muted #62665f, dividers #ddd8ce, control borders #9c9e92, teal selection #e7f0ec. Expose matching legacy aliases only on light web screens. Keep printed colors and native/dark variables intact.
- [x] Preserve PDF colors in `src/utils/pdf/appTheme.ts` with explicit record-color variables when screen tokens differ. Extend the existing PDF palette tests to prove screen appearance cannot alter record colors.
- [x] Remove conditional export styling in `src/EntryGrid.tsx` and its obsolete rule in `src/components/ClinicalPolish.css`. Use existing chart navigation tests to validate section switching; inspect computed button colors in the browser.
- [x] Audit actual light web screens for remaining hard-coded gray fills, enabled control clarity, and action hierarchy. Fix owning component rules only where needed. Palette-only CSS changes use visual verification rather than implementation-mirroring tests.
- [x] Run `npm test` and `npm run build`. Render and inspect application screenshots at desktop, 390px, and 320px, with coverage and any gaps recorded in the design document.

## Execution ledger

Ruling: Work in place because the approved mockup and substantial pre-existing uncommitted features are in this workspace; moving to HEAD in a new worktree would omit those features. Limit changes to this theme task and do not commit.
Ruling: Continue directly from the approved design without a second approval ceremony; the user has authorized implementation.

Ruling: Strengthen screen control borders from proposed #9c9e92 (2.72:1 on white) to #8c8f82 (3.30:1 on white, 3.14:1 on alternate surface) to preserve clear enabled boundaries.

Ruling: Final screen control border is #85887b: contrast 3.62:1 on white, 3.44:1 on alternate, 3.27:1 on canvas, and 3.04:1 on recessed surfaces. Retain the original Workspace aliases only under @media print to preserve printed appearance without screen token cycles.

Completed: final full suite passed (288 files, 3,089 tests); final build passed. 96 screenshots inspected with zero browser errors/overflow. See `docs/design/2026-11-18-warm-light-theme-verification.md` for coverage and limits. PR preparation uses an isolated checkout; unrelated source-workspace edits are preserved.
