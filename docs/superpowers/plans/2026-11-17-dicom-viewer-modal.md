# DICOM viewer modal implementation plan

Goal: Present the shared photo/DICOM viewer in a themed, bounded modal with a dark imaging canvas.

Design: Use the Atlassian modal pattern: dimmed backdrop, clear header and close control, bounded desktop surface, responsive phone layout. Reuse clinical surface, text, border and teal tokens. Preserve all imaging operations and translated labels. User authorized proceeding with implementation decisions.

- [x] Add regression tests for focus containment/restoration, scroll locking, safe backdrop dismissal, Escape isolation, and empty input.
- [x] Reuse useModalFocus/useBackdropDismiss; render through a portal, separate header and tools, keep all existing image controls.
- [x] Replace the owning viewer CSS block with responsive modal styling and size media to the actual canvas area.
- [x] Run viewer tests, npm test and npm run build.
- [x] Inspect rendered desktop and 320/390px phone states: long captions, one/multiple images and visit dates, missing preview, DICOM windowing/error, keyboard focus, light/dark themes.

Review focus: nested dialog Escape, image fit after toolbar wrapping, phone control sizes, long translated labels, stale DICOM loading after navigation.


Verification notes:
- Independent review found no implementation defects; requested a nested focus test, now added and passing.
- Browser checks found focus could be lost when the DICOM load button disabled itself; a failing regression test reproduced it, and moving focus to the modal before loading fixes Escape during and after loading.
- Dependency setup: a shared node_modules symlink caused Vite to reject codec WASM paths. A local dependency copy resolved all seven baseline failures without codec changes.

| Rendered state | 1440×1000 | 390×844 | 320×844 |
| --- | --- | --- | --- |
| Long caption and tooth, multiple visits | Checked | Checked | Checked |
| Single image | Checked | Checked | Checked |
| Missing preview | Checked | Checked | Checked |
| Expanded actions | Checked | Checked | Checked |
| Dark theme | Checked | Checked | Checked |
| German labels | Checked | Checked | Checked |

DICOM window/level, expanded actions, error state, visit navigation, Tab/Shift+Tab and Escape checked in Chrome at 1440×1000, 390×844, 320×568 and 844×390. Empty items render no modal. Screenshot inspection led to reserving room around the missing-preview message for navigation arrows. Short viewports scroll the controls while preserving image space and the close button.

Scope: component harness with synthetic images and a valid synthetic uncompressed DICOM file; not a full application UI review. Authenticated upload/storage workflows, native iOS and other browser engines were not exercised. Existing decoder and integration tests remain part of the full suite.
