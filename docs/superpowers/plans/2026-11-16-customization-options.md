# Customization options implementation plan

**Goal:** Make existing customization choices clear, accurately scoped, and easier to manage.
**Architecture:** Preserve preference storage and clinical behavior. Refine translated labels, expose existing ordering through accessible controls, and explain duplicate/limit states. Reuse current editors on web and native.
**Tech stack:** React, TypeScript, i18next, Vitest.

- [x] Review chart, anesthesia, exam, quick-code, PDF and report-template choices; clean up names and explanatory text in all five app languages.
- [x] Add tests for quick-code/exam-area ordering, boundary disabling, duplicate handling and list limits; implement within the existing editors without changing IDs or stored chart data.
- [x] Add explicit PDF dependency and column minimum hints, positive Recheck naming on native, and persistent drug labels on web.
- [x] Run focused tests/pseudo-locales, stamp translations, review snapshots, check narrow layouts, run full tests and production build.

Design decision: extend the current options with list management, rather than introducing new clinical defaults or automatic treatment choices. Personal settings remain personal; owner-report templates remain practice-wide. Preserve existing values and charted content.

## Expanded scope and implementation

User additionally requested customization entry points on uncovered sections, automatic historical-image thumbnails below findings, and clearer explanation of locked fields.

- Procedure now has independent procedure shortcuts, persisted with existing account preferences and exposed on web/native; native Oral exam gains Customize.
- Treatment report Customize opens template management. Read-only visits block report edits and insertion but still allow independent template management.
- Quick codes and exam areas support ordering; duplicate codes and full lists have explanations. Stored chart comments and answers are not removed by deleting a preference.
- Precise option names, personal/practice scope, PDF prerequisites, and persistent medication labels; same positive Recheck option on native and web.
- Image history loads automatically below radiographic findings, with thumbnail groups per source visit date. Empty visits/history are omitted. Failed requests offer Retry; stale requests and patient identity are checked to avoid displaying previous-patient images.
- A shared View only notice appears beside chart content, with Edit chart using the existing unlock flow. Disabled image controls have distinct styling.

Verification: procedure browser checks at 1440/390/320px confirm no overflow, reordered shortcuts appear on Procedure and do not leak to Diagnosis. Imaging browser fixture confirms two historical date groups below findings and local Edit chart enables the image type and tooth selectors, with no page errors at 390px. Independent code review found no blocking regressions in preference separation, read-only report behavior or preservation of recorded data.

Final verification: full npm test suite passed (259 files, 2633 tests); production build passed with existing bundle-size warnings; translation queue has no outstanding keys. Image-history and lock wiring also passed independent read-only review. No commit or deployment.

## Upload interaction follow-up

Replaced the upload form row with a single plus drop zone and file/gallery/camera actions. The keyboard-accessible primary target opens the multi-file chooser; touch browsers use an environment-camera capture input and native iOS keeps its existing camera bridge. Captions are edited on the resulting image cards. Retained paste, DICOM handling, per-file errors, plan limits and view-only restrictions; the active upload batch retains its original attachment store. Removed the redundant web topbar Edit chart button, preserving the content-level unlock notice and topbar Done action. Touch detection handles both coarse pointers and touch-enabled devices. Corrected the chart form's Enter handling so ordinary buttons can activate without submitting the chart.

Browser verification: 1440, 390 and 320px fit without horizontal overflow; keyboard activation opens a multi-file chooser and the touch camera action opens the capture picker. No application errors in the fixture. Physical device camera capture was not exercised by desktop Chrome automation; the native bridge has mocked regression coverage.

Upload follow-up final validation: 259 test files / 2636 tests passed; production build passed, with only the existing bundle-size warnings. Translation check reports no pending keys. No commit or deployment performed.


## PR follow-up: customization completeness and mobile charting

- Put both treatment and owner report template management under Practice → Templates, with draft guards when navigating away.
- Keep Customize in the top-right of clinical section headers, remove redundant topbar All patients, preserve workspace Patients navigation.
- Align anesthetic name/concentration controls and keep units inside inputs.
- Add optional owner name, phone, email and technician visibility; recorded values always remain visible.
- Show built-in exam areas checked, suggested areas unchecked, custom areas editable, and preserve existing findings when hiding areas. Lips overlaps the extraoral exam; gingiva remains distinct from tooth-level periodontal scores. Clinical reference: https://www.aaha.org/resources/2019-aaha-dental-care-guidelines-for-dogs-and-cats/conscious/
- Keep mobile by-tooth navigation above the independently scrolling findings; make the tooth map collapsible.
- Verify regression tests, translated strings, desktop/mobile browser layouts, full npm test and npm run build before updating PR #105.
