# Patient directory controls implementation plan

**Goal:** Move rare PDF import to the Patients footer, align New patient with search/filters, and search owner details.
**Design:** User specified the layout. Compact GitHub-style dialog toolbar: Search, Species, Rechecks due, New patient. Import chart PDF is a secondary footer action below the table. Preserve teal/neutral tokens, consistent control heights and 44px phone targets. Mockup shown in conversation before implementation.

- [x] Add failing tests for footer placement, primary action, owner-email search and search wording.
- [x] Move import action/file input into footer; size search flexibly so the primary action remains inline at desktop widths.
- [x] Search patient name/number and owner name/phone/email on the server. Translate the updated placeholder in every enabled locale and explicitly stamp its changed-English keys.
- [x] Run full test/build and visually inspect desktop/390/320px populated/empty states, long names, single/multiple visits and expanded row menu.

Preserve existing rabbit and theme changes. No commit or PR requested for this task.

## Additional user requests
- Version history: browser reproduction confirms equal-z-index History/Patients portals can put History behind Patients when mounted in that order. Add a dedicated history overlay layer at1150 (Patients1100), verify normal clicks and reversed mount order, empty/loading/error states, Escape/backdrop and focus.
- Consistent hover feedback: actual computed-style checks confirmed no hover change on Dictate or sidebar account/email. Add neutral hover fill in owning component styles and shared teal outline on enabled pointer-hover controls, excluding disabled and keyboard-focused controls. Preserve primary/destructive/status colors and touch behavior. Verify both themes, focused/disabled controls and representative button/disclosure types.

## Completion
Final full suite:289 files/3,117 tests passed. Production build passed. Browser16-case matrix and shared hover/history checks passed; screenshots inspected. Coverage and explicit limits:docs/design/patient-directory-controls-verification.md. No commit or deployment made.
