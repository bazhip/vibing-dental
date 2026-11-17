# Whole-app UX review follow-up implementation plan

**Goal:** Implement the user-approved UX review on PR #105, retaining the teal/slate clinical identity while reducing mobile chrome and making actions predictable.

**Architecture:** Improve existing React components and scoped styles. Establish explicit section-header action slots, shared control affordances, and consistent save scope cues rather than adding broad competing overrides. Preserve chart data, native conventions, and translated behavior.

**Approval:** User approved all findings and recommendations in the preceding review with “yes do it all.” Continue implementation without reopening design approval.

**Constraints:** en/fr/de/it/es translations and pseudo coverage; no clinical defaults or recorded data silently changed; no real backend mutations during browser checks; npm test and npm run build before commit/push.

- [x] Clinical shell: separate Customize from clinical actions; compact mobile patient header and workspace disclosure; restore floating export with reserved bottom space (user preference); explicit mobile diagram code lookup; phone default By tooth only for users without a saved view preference.
- [x] Patient form: group Patient/Owner/Visit; move species and dentition beside patient identity; normalize labels and optional field visibility without losing saved information.
- [x] Settings/reports: restore960px customization, select arrows, collapse template management controls, consistent scope/saving cues, PDF image retry and explicit incomplete export.
- [x] Patient directory/auth/onboarding: stable Open latest visit and separate history disclosure, labeled secondary menu; shorten signup by deferring optional branding; shared language control style; fix walkthrough destinations/count/species; billing loading state.
- [x] Dictation/accessibility: enforce locked state at all mutating entry points, retain pending review, restore focus after resolving review, Escape intro, restrained live status, pause actionable toast expiry during interaction.
- [x] Verify: focused regressions for behavior changes; rendered hit-target checks for overlapping headers; desktop/mobile320/390/768/1440 checks; five-language consistency; independent review; full test/build; update existing PR.

**Review focus:** saved personal preferences survive device changes; hidden recorded values remain visible; async dictation cannot mutate a newly locked or different chart; PDF retry cannot export stale/partial images without consent; menu focus and destructive confirmations remain reliable.

## Additional review and user follow-up

- [x] Owner reports: neutral undocumented-findings copy, explicit completion confirmation tied to chart/template and tagged-image content, draft PDF labels, failed-image retry, reviewed-only email, stale AI/confirmation/email guards.
- [x] Persistent mobile patient name, number, visit date, and labelled save state; touch quadrant picker and focus restoration.
- [x] Web Rechecks destination; native Equine parity and stacked recheck date controls.
- [x] Destination-first PIMS transfer and announced, focused results distinguishing saved and unconfirmed fields.
- [x] Three-step first-run path; comprehensive tour remains optional.
- [x] Explain the eight-custom-area limit separately from the three suggestions and exclude blank rows from the count.
- [x] Restore the floating Review and export button at the user's request, reserve bottom space, respect safe areas, and hide it while typing on phones.

Validation: 264 test files / 2,711 tests passed; production build (translations, lint, TypeScript, Vite) passed. Browser fixtures covered 320/390/768/1440 widths, populated identity, separate header hit targets, rechecks, touch tooth navigation, and floating export. Actual Safari/iOS devices, physical camera capture, and live clinical/PIMS/email backend writes were not exercised. Existing bundle-size warnings remain.

User follow-up: remove the redundant web Rechecks navigation tab. Keep visit recheck dates and the Patients filter, rename it “Rechecks due,” and place it with the other list filters. Existing recheck links and native workflows remain compatible.

## Rendered follow-up review (November 16)

User feedback exposed visual defects despite passing functional checks. This pass uses rendered screenshots and a finite coverage matrix; it is not a claim that every product state has been visually reviewed.

| Surface | Rendered states inspected | Viewports |
| --- | --- | --- |
| All nine clinical sections | Default/empty chart, section headers and navigation | 1440, 390, 320; 768 captured with some captures not individually inspected |
| Patient header | Long patient/practice/doctor names, branding, single/multiple visits, save status; empty chart; phone More menu | 1440, 1000, 768, 390, 320 |
| Diagnosis and Procedure | Mark/Comment/Draw toolbar, expanded secondary controls | 1440, 1000, 768, 390, 320; Draw panel inspected at 320 |
| Chart customization | Patient, Exam, Anesthesia, Charting, Diagnosis, Procedure, Imaging categories | 1440 and 320 |
| Owner template customization | Default, read-only basics/layout | 1440 and 320 |
| Patients | Populated, long name, single/multiple visits; expanded actions and visit history | 1440, 390, 320; expanded actions at 320, visits at 1440 |
| Practice settings | General initial viewport | 320 |

Additional corrections found: category-dialog width was overridden to544px; checkbox explanations occupied competing narrow columns; Treatment report inherited unnecessary minimum card height. Corrected and recaptured. Diagram toolbar uses shared SVG icons, consistent controls, translated secondary-group labels, and two rows at narrow widths; Escape returns focus. Locked drawing mutation controls are excluded from rendering and covered by regression tests.

Coverage limits: not all loading/offline/error/permission states, populated clinical combinations, imaging viewers, account/billing/settings tabs, editable report-template categories, generated output combinations, native hardware, translated visual layouts, or below-fold dialog states were reviewed. Automated coverage is reported separately. Do not describe this matrix as a complete whole-app visual sign-off.

Latest user direction: retain inline Add area beneath Exam; do not add per-area × removal controls. Area visibility remains in Customize. Clinical PDF diagrams now use the space released by omitted anesthesia. Optional anesthesia/custom exam content that exceeds the compact cards continues in full on supplemental pages, with patient identity and correct page counts. Actual default, omitted, species, and maximum-customization PDFs were rendered and inspected. Existing long treatment-report truncation remains outside this optional-section fix.

Final follow-up validation: 266 test files / 2,736 tests passed; production build passed (existing bundle-size warnings). Expanded patient history fits without document or table horizontal overflow at 320/390/768/1000/1066/1200/1440px. Persistent desktop sidebar and mobile menus were inspected across Patients, Current visit, and Practice settings at 320/390/768/1000/1440px. Account selector uses the signed-in email, including long-email layout checks; Help precedes Dictate; redundant topbar Visit actions is removed. Inline Exam Add area and duplicate handling were exercised at 320/390/1440px. These targeted checks do not remove the coverage limits above.
