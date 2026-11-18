# Warm clinical light theme

Design approved by the user on November 18, 2026; implemented. Companion: `2026-11-18-warm-light-theme.html`.

## Problem and direction

Light mode currently uses a cool gray page (`#eef1f2`), alternate surface (`#f7f9fa`), and recessed surface (`#e8eced`). These make enabled areas feel unavailable. The Review and export button changes appearance because `EntryGrid.tsx` conditionally adds `visit-export__button--secondary`; `ClinicalPolish.css` styles that variant white instead of teal.

Use a very subtle tan canvas (`#f6f3ed`), white working surfaces, warm off-white alternate surfaces (`#fbf9f5`), warm dividers (`#ddd8ce`), and explicit control boundaries (`#85887b`, strengthened for control-boundary contrast). Keep the established teal (`#0c6b63`) and dark hover (`#095049`). Use dark neutral text (`#24312f`), readable secondary text (`#62665f`), and a pale teal selected fill. Disabled controls need distinct muted text/fill and actual disabled semantics; enabled secondary buttons retain readable labels, borders, hover, and focus feedback.

Reference: Atlassian's semantic color roles and layered surfaces (https://atlassian.design/foundations/color/ and https://atlassian.design/foundations/elevation/). Reuse the separation between canvas and working surface, brand-colored actions, quiet secondary controls, and explicit selected/disabled states. Preserve existing layout, Inter typography, spacing, and clinical signals. The HTML is a palette/state study, not a proposed navigation or export-placement redesign.

A background-only adjustment leaves cool gray controls behind. A full component redesign is unnecessary. Update shared tokens and audit consumers for hard-coded neutral fills; fix their owning rules where necessary. Review and export uses one shared solid teal treatment on every section, in light and dark modes. Preserve a clear hierarchy around section-local actions.

## Scope and safeguards

Web light appearance and its shared components: patient workspace, chart sections, tables, controls, navigation, menus, and dialogs. Preserve native platform conventions, dark surface palette, clinical warning/error/tooth signals, and printed/exported document colors. Audit shared light tokens used by those outputs before changing them. Keep unrelated in-progress work intact; do not commit it.

## Verification after implementation

Run `npm test` and `npm run build`. Inspect rendered application screenshots; the proposal screenshot does not constitute application verification.

| Area/state | Desktop | 390 px | 320 px |
| --- | --- | --- | --- |
| Patient library dialog: populated/empty, long name, single/multiple visits, expanded menu | Inspected | Inspected | Inspected |
| All nine chart sections: export consistency in light and dark | Inspected | Inspected | Inspected |
| Forms: enabled, selected, disabled, keyboard focus | Inspected | Inspected | Inspected |
| Account/settings dialog and export dialog chrome | Inspected | Inspected | Inspected |
| Dark mode: button and shared-control regression across all nine sections | Inspected | Inspected | Inspected |

Check contrast, alignment, spacing, wrapping, overflow, 44 px phone targets, and action discoverability. Application verification results and remaining gaps are recorded in `2026-11-18-warm-light-theme-verification.md`.
