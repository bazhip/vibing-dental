# Consultation template customization implementation plan

**Goal** Give practice owners editable consultation templates and add a dental-specific starter for new consultations.

**Architecture** Extend the practice library and the visit's pinned layout with ordered section definitions. Keep clinical values in the visit. Apply the layout to the editor, evidence-backed dictation review and the shared record-note renderer used by PDF and PIMS.

**Tech stack** React, TypeScript, i18next, Vitest and Supabase Postgres.

## Verification

- [x] Test the versioned dental starter, legacy layouts, invalid section IDs and saved field retention.
- [x] Verify SQL accepts valid legacy and current libraries and rejects malformed revisions.
- [x] Test custom fields in the visit, note export and dictation, including stale review and unsupported fields.
- [x] Verify template editing, sample preview, default, archive and restore, and mobile controls. Update localized Help.
- [x] Run the full test suite and production build. Inspect screenshots at desktop, 390px and 320px.

## Browser coverage

| Screen | Widths | States |
| --- | --- | --- |
| Template manager | 1440px, 390px, 320px | Long template name, expanded section settings, open template menu, overflow and control sizing |
| Template manager | 390px | Import headings from a sample, preview, add a custom section, focus the expanded section |
| Dental consultation | 1440px, 390px, 320px | Populated editable visit on desktop and 390px, empty read-only version on 320px |
| Help | 1440px, 390px, 320px | Direct links to both guides, screenshots loaded, no horizontal overflow |

Browser checks used fictional visits. Database checks used embedded PostgreSQL. Live dictation, live PIMS and native iOS were outside this verification.

## Rollout

Apply the migration before shipping the template editor. Release the matching Chrome extension with the change and use updated clients when exporting customized consultations. The migration blocks older clients from overwriting versioned consultation notes or template libraries. Existing extensions can still read those notes in the older format.
