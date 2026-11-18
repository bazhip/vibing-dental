# Warm light theme verification

Approved palette implemented on November 18, 2026. This is a targeted theme review, not a full product UI audit.

## Visual coverage

96 application screenshots captured and inspected at 1440×1000, 390×1000, and 320×1000 in local Chrome. Fixture data replaces cloud services; external requests are blocked. Six contact sheets were inspected, with individual chart, menu, library, patient, and export screenshots checked at full size. Browser results: zero runtime errors and zero document-level horizontal overflows.

| Screen / state | 1440 | 390 | 320 |
| --- | --- | --- | --- |
| All nine chart sections, light | Inspected | Inspected | Inspected |
| All nine chart sections, dark | Inspected | Inspected | Inspected |
| Patient: long name, empty name, finalized/disabled | Inspected | Inspected | Inspected |
| Patients dialog: populated, empty, single/multiple visits | Inspected | Inspected | Inspected |
| Patients dialog: expanded visit list and actions menu | Inspected | Inspected | Inspected |
| Account disclosure / mobile More menu | Inspected | Inspected | Inspected |
| Account settings dialog | Inspected | Inspected | Inspected |
| Review and export dialog chrome | Inspected | Inspected | Inspected |
| Keyboard focus on enabled form control | Inspected | Inspected | Inspected |
| Landing and offline practice sign-in gate | Inspected | Inspected | Inspected |

Warm canvas and white fields remain distinct. Neutral dividers, table stripes, menus and labels follow the palette. Teal actions and selected navigation remain recognizable; finalized forms and unavailable controls remain muted. Long names wrap or truncate within existing layouts. The export control stays 44px tall at all three widths, with a visible 2px keyboard focus outline; its light and dark appearances are consistent across sections.

Control-border #85887b contrast: 3.62:1 on white, 3.44:1 on alternate #fbf9f5, 3.27:1 on canvas #f6f3ed, 3.04:1 on recessed #efebe3. Secondary text #62665f is 5.29:1 against the canvas; white on primary teal is 6.37:1.

## Print and PDF isolation

Browser print emulation confirmed the original workspace aliases: background #f3f6f7, alternate #f7f9fa, divider #dfe6e9. Live PDF token resolution confirmed the original clinical record neutrals (#17232e text, #55677a muted, #e2e7eb border, #9cabb7 strong border). The new regression test failed before implementation and passed after it. Independent review found no remaining blocking theme defect after restoring print aliases.

## Limits

The embedded browser PDF canvas was blank in headless capture; exported PDF page rendering was not visually audited in this theme task. PDF palette preservation was checked through the actual browser token bridge and tests. Live cloud/auth, native device screenshots, the standalone patients/rechecks pages, practice administration dialogs, all localized layouts, every scrolled position, and all clinical/image contents were outside this targeted review. No claim of a full UI review is made.

## Automated checks

- `npm test`: 288 test files passed; 3,089 tests passed in the isolated PR checkout.
- `npm run build`: passed, including `i18n:check` (zero problems), ESLint, TypeScript, and Vite. Vite retains its existing bundle-size warning.
- `git diff --check` on the six changed source/test files: passed.
- Independent scoped review: PASS after print-alias restoration.

Artifacts: `/private/tmp/warm-theme-visual-results.json`, `/private/tmp/warm-theme-states.log`, `/private/tmp/warm-theme-*.png`, and `/private/tmp/warm-contact-{0..5}.png`.

Representative screenshots: [desktop](screenshots/warm-light-desktop.png), [390px phone](screenshots/warm-light-phone-390.png), [320px phone](screenshots/warm-light-phone-320.png).
