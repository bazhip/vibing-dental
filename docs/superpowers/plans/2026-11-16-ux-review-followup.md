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
