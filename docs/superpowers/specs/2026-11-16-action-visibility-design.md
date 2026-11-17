# Action visibility and owner-report sending

Make actions and important states discoverable throughout the app while retaining the established clinical layout, teal identity, neutral surfaces, and compact controls.

## Approach

Update shared tokens and the styles that own each control, then audit individual screens for incorrect action hierarchy. A blanket recoloring would make every button compete; isolated report changes would leave the same discoverability problem elsewhere. Keep one filled primary action per context and quiet table-row actions.

Use existing Inter typography, white surfaces (#ffffff), slate text (#17232e), teal actions (#0c6b63), darker teal hover (#095049), light teal selection (#e7f0ef), and amber warning text (#92400e). Add shared semantic fill/border tokens where absent. Enabled secondary actions have visible teal text/borders; selected navigation has a teal tint and a structural indicator. Disabled controls remain distinguishable. Warnings retain explicit text/icons, not color alone. Preserve clinical chart notation colors and geometry.

## Owner reports

Remove the separate confirm-review/reopen workflow, review badges, draft-only download/share wording, and draft markings in generated PDFs. Existing saved review metadata must not restrict use of a report.

Keep the email composer. Clicking Send opens an explicit confirmation naming the recipient and report attachment; cancelling sends nothing. Confirming sends once. Preserve saved-recipient validation, attachment completeness checks, fresh PDF/content checks, and protection against chart changes during asynchronous work. Downloads do not require confirmation.

Translate new confirmation text into French, German, Italian, and Spanish and stamp translation metadata. Preserve practice-language defaults for owner-facing email text.

## Coverage and validation

Audit landing/sign-in, workspace navigation, patient lists and visit actions, chart sections/toolbars, imaging, documents/report previews, settings/account/practice dialogs, and native shared controls. Correct the owning styles rather than adding another override layer.

Record a screen/state/viewport matrix during implementation. Inspect desktop and 320px/390px phone screenshots, populated/empty lists, long names, single/multiple visits, expanded menus, selected/disabled controls, keyboard focus, and email confirmation/cancellation as applicable. Record inaccessible or untested states explicitly; do not claim full coverage with gaps.

Update workflow tests for unreviewed report export/email, confirmation acceptance/cancellation, repeated clicks, missing/changed images, and stale PDFs. Run npm test and npm run build. No live owner emails are sent during verification.

## Scope

Preserve existing layouts, spacing, touch targets, and shared components. This is a visibility and sending-flow change, not a new visual identity. Implementation may choose specific secondary styles by context to avoid competing primary actions.
