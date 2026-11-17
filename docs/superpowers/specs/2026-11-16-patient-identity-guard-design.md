# Guard saved charts against accidental patient reassignment

Status: approved by the user.

## Intent

Prevent changing an existing chart to a different patient without noticing that its clinical findings and images remain attached. The production investigation found a Luffy/SP0001 chart renamed to Novmi/SP9111, followed by a separate NOVMI chart. Existing production records must remain unchanged.

## Approaches

- Lock identity fields behind an edit action: clear intent for typing, but requires protection for dictation and imports as well.
- Check identity before saving (recommended): covers all callers of the shared chart save path and allows deliberate corrections.
- Automatically create a new chart: rejected because copying old findings to another patient would perpetuate the underlying problem.

## Proposed behavior

Compare the proposed patient name and number with the saved record before an existing chart is overwritten. Ignore differences in capitalization and surrounding whitespace. Do not prompt on initial creation or filling a previously blank identifier; changing or removing an established name or number requires confirmation. Date and owner-contact changes alone do not trigger this guard.

Pause the write and show the saved and proposed identities in the existing shared dialog. Explain that findings and images remain attached and direct users to New patient for a different patient. Confirm correction authorizes only the displayed identity change on the displayed chart. Cancel, Escape, and outside dismissal leave the cloud record unchanged and retain the local edits. Do not repeatedly prompt from autosave for a dismissed change; an explicit Save can retry. Returning to the saved identity resumes normal saving.

Read failures must not permit an unchecked overwrite. Handle reloads with local edits, newly saved charts, opened charts, and edits arriving while a dialog is open. Never apply an answer to another chart or a different proposed identity. Explicit history restoration retains its existing deliberate restore flow.

## Interaction sketch

Use the enterprise confirmation-dialog pattern familiar from GitHub and Atlassian: consequence first, before/after values, quiet Cancel and one explicit confirmation. Reuse the app's shared dialog, teal accents, neutral surfaces, sentence-case labels, spacing, and mobile touch targets.

    Are these details for the same patient?

    Saved:   Luffy · SP0001
    Changed: Novmi · SP9111

    Saving will change the patient details on this chart.
    Existing findings and images will stay attached.
    For a different patient, cancel and choose New patient.

    [Cancel]                         [Confirm correction]

## Scope and validation

Use the shared cloud-save hook rather than adding separate guards to each input. Translate new messages into en/fr/de/it/es and stamp translation metadata. Add regression tests for an existing chart's identity change, all dismissal paths, explicit approval, normalized/no-op changes, first-time saves, reloads, read failure, and chart/identity changes during confirmation. Preserve the existing duplicate and conflict protections.

Inspect the actual dialog at desktop, 320px, and 390px widths, including long identities and keyboard focus. Run npm test and npm run build. This is a focused save-flow change, not a chart merge feature, an automatic patient reassignment, or a production data repair.
