# Explicit record finalization

Approved in conversation: records stay editable until Finalize in the top bar saves and closes them. Edit chart reopens a finalized record; Finalize closes it again. Existing records are unfinalized. New visits are always unfinalized. My charts shows a Finalized column with Yes/No per visit and finalized/total counts for multiple visits.

## Approach

Persist an optional finalizedAt timestamp in the existing chart snapshot and project it in chart metadata queries. This avoids a schema migration and applies the same status across devices and workspaces. Replace the date-based locking rule; keep the existing save, conflict, and identity protections. Failed or cancelled saves must not change finalization status. Finalization is an explicit workflow lock, with Edit chart available to reopen.

## UI

Use GitHub's explicit close/reopen action placement in the record header and compact status in the list, adapted to the existing teal clinical design. Keep secondary row actions in their existing disclosure. The approved text mockup puts Finalize at the top right and Finalized beside the title after completion, with Edit chart available. On phones retain 44px targets and readable wrapping. Extend the native navigation action too.

## Constraints

Preserve existing unrelated edits. All copy uses t() and all enabled locales. Tests and build must pass; inspect desktop and 320/390px renders for editable/finalized records, single/multiple visits, empty/populated lists and long names.


## Follow-up approved during implementation

Saving and Saved appear in the active patient tab beside Editing, replacing their toast notifications. Error/retry and manual-save notifications keep their existing actionable placement. The header holds the single Edit chart action; the body notice explains finalized state without repeating the action.
