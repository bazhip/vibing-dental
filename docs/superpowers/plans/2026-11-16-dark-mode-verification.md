# Dark-mode verification

## Automated checks

- `npm test`: 269 files, 2,753 tests passed.
- `npm run build`: passed (translations, lint, TypeScript, production bundle).
- `npm run build:extension`: passed.
- `npm run i18n:translate -- --check`: `todo=0 remove=0`.
- `git diff --check`: passed.

Regression coverage includes preference restoration, System-mode OS changes, manual overrides, tab synchronization, invalid/blocked storage, translated/accessible selectors, native status-bar changes, light PDF palettes, keyboard handling inside the settings menu, extension color-token coverage, and CSP-compatible first-paint initialization.

Independent code review found two issues: the inline bootstrap conflicted with the deployed CSP, and the extension destination card retained a light background. Both were fixed with regression tests observed failing before the fixes and passing afterward. The CSP remains unchanged.

## Browser coverage

Chrome desktop browser, real app components with local cloud-data fixtures. Screenshot artifacts are `/private/tmp/dark-*.png`; captured at 1440px desktop and 390/320px phones unless stated otherwise. Inspected screenshots for color contrast, wrapping, overflow, control spacing, focus styling and readable SVG line art. This is targeted feature verification, not an exhaustive review of every app state.

| Surface | States captured | Viewports |
| --- | --- | --- |
| Landing | System dark, explicit light, appearance/language controls | 1440, 390, 320 |
| Sign-in | Standalone password dialog, controls/focus | 1440, 390, 320 |
| Patient form | Blank visit, species/dentition controls | 1440, 390, 320 |
| Exam | Empty table and controls | 1440, 390, 320 |
| Anesthesia | Default form and table | 1440, 390, 320 |
| Charting | Grid, headers, empty clinical rows | 1440, 390, 320 |
| Diagnosis / procedure | SVG, tools, code reference | 1440, 390, 320 |
| Imaging | Empty upload surface and findings | 1440, 390, 320 |
| Treatment report | Empty editor | 1440, 390, 320 |
| Owner report | Draft editor, review notice, PDF preview | 1440, 390, 320 |
| Patients | Populated/empty, long names, single/multiple visits; expanded row actions | 1440, 390, 320; row menu at 320 |
| Practice settings | General tab | 1440, 390, 320 |
| Account / chart settings | Open dialogs; account and More menus | 1440, 390, 320 |
| Email composer | Local fixture, form | 1440, 390, 320 |
| All five species | Canine/feline permanent and deciduous, equine; missing/extracted marks, neutral drawing | 1440, 390, 320 |
| Native preview | Chart form, component gallery, explicit light on dark OS | Chart at 1440/390/320; gallery at 320 |
| Extension | Destination details with long patient name | 320 |

Browser behavior checks confirmed reload persistence, cross-tab updates, live system changes, manual overrides, and native light override. No page errors in the completed app/state scenarios. Main section, patient, menu, and PDF-preview captures reported no horizontal document overflow.

All five species' actual rasterized exports were byte-identical between dark and light modes. Exported PNGs retained white backgrounds, dark line art, red extraction marks, and original saved neutral pen colors, and long clinical comments. The rendered owner-report PDF also stayed light within dark preview chrome.

## Limits

No physical iOS device or Safari/WebKit run. Native status-bar behavior is unit-tested and native UI is browser-previewed. No live authenticated billing/admin/team workflow, real image-upload/lightbox session, cloud template-editor flow, or sent email was exercised. These surfaces inherit the shared palette, but those live state combinations are not claimed as visually verified. Long-comment testing used an isolated controlled component fixture, separate from the main app screenshots.


## Placement refinement

After user feedback, moved the theme preference into Account settings and quiet guest/footer disclosures, removed it from primary navigation and embedded sign-in, and added the enterprise SaaS reference/mockup rule to AGENTS.md. Independent review found no placement or keyboard defects.

Updated checks: **269 test files / 2,754 tests passed**; app and extension builds passed. Captured and inspected Account settings, account menus, landing header/footer and sign-in at **1440, 390 and 320px**. Exercised the footer disclosure and theme selection at 320px; browser checks reported no page errors or horizontal overflow in the account/header/sign-in states. Native and extension follow-up placement received code review/build checks, not a new native-device or extension-host visual review.


## PR integration verification

Rebased onto main at `2262029`, retaining the anchored sidebar and report/action changes. The newer action/warning tokens now map to the shared dark palette, covered by a regression test observed failing before the mapping and passing afterward. Full validation after integration: **269 files / 2,768 tests passed**, production build passed. Rechecked populated patients, long names, visit actions and the anchored navigation at 1440/390/320px: no browser errors or horizontal overflow.
