# Discharge template customization implementation plan

**Goal** Give every practice access to Discharge templates and reuse the Consult template editor.

**Architecture** Use an independent practice library with owner-managed defaults. Pin the selected layout to the visit, retain populated fields when switching, and use that layout in dictation review, notes, PDFs and PIMS. Custom fields may feed the owner report when explicitly enabled.

- [x] Test validation, the standard template and retained wording.
- [x] Connect the template manager and field editor to the visit and practice library.
- [x] Verify evidence review, clinical exports and the owner report opt-in.
- [x] Update translated Help, capture desktop and phone states, and run the tests and production build.

## Browser checks

| Screen | Widths | Scenarios |
| --- | --- | --- |
| Discharge template editor | 1440px, 390px, 320px | Long template name, expanded field settings, owner-report selection, template menu, 44px phone controls and no horizontal overflow |
| Discharge visit | 1440px, 390px, 320px | Populated editable and empty read-only visits, template selection and retained wording after switching on a phone |
| Help | 1440px, 390px, 320px | Direct link to Discharge instructions and loaded screenshot |

Browser checks used fictional visits. Database verification used embedded PostgreSQL. Live dictation, live PIMS, and native iOS were outside this verification.

## Rollout

Apply the Discharge migration and release the matching Chrome extension before rollout. Older clients can display or export a partial view of customized Discharge notes. The migration protects customized chart snapshots against writes from clients using an older snapshot version. Every practice can use the feature without a flag.
