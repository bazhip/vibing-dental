# Medical record note + email the owner report

## Why

This closes ScribbleVet's edge in the dental workflow. ScribbleVet turns a dictated COHAT into a chart, then:

- pushes a written note into the practice management system (PIMS), and
- emails the client a recap.

ToothOps already charts in more depth than ScribbleVet. What it lacks is everything after charting: a written note a vet can paste into ezyVet, Vetspire or Cornerstone, and a way to get the owner report to the client without downloading it and re-attaching it somewhere else.

Success means: a vet finishes a chart, opens Documents, copies a complete procedure note into their PIMS in one action, and emails the owner report to the client from the same dialog.

## Goals

1. **Record note.** A clinical procedure note, built from the chart by fixed rules. It is editable, and it can optionally be rewritten as prose by AI ("Polish with AI").
2. **Copy.** One Copy action that works in every PIMS that accepts pasted text.
3. **Email owner report.** Send the owner report PDF to the chart's recorded owner email, from the practice's name.

## Non-goals

- Per-PIMS note formats.
- Browser-extension or API write-back to a PIMS. That is a later, separate project.
- SOAP notes for non-dental visits.
- Emailing arbitrary addresses.
- Emailing the clinical chart PDF.

## Anti-goals (a failure even if it works)

- **The note states something that isn't in the chart.** The rule-built note must be a pure function of the snapshot. The AI polish runs under the owner report's "use only facts in the chart" rules.
- **The email function can send to an address the client supplies.** It must never become an open relay.
- **English voice/AI behaviour changes.** This includes the voice snapshot fixtures; see AGENTS.md "Voice".

## Constraints

- **i18n rules in AGENTS.md apply in full.**
  - Every string goes through `t()`.
  - fr/de/it/es translations are written in the same change.
  - Any new screen or component gets a pseudo-locale test.
  - Errors use `LocalizedError` or edge-function `code`s with `common:errors.api.*` keys.
- **Note language:** the user's app language (a clinical record).
- **Email default wording:** the practice client language (`usePracticeLanguage` / `clientLanguageOf`).
- **Before commit:** `npm test` and `npm run build` must pass.

## Approaches considered (for who writes the note)

- **A. Rule-built only.** Instant, available on every plan, no hallucination. Reads as a structured record.
- **B. Claude only.** Reads naturally. Costs AI usage, and every note needs proofreading.
- **C. A + optional "Polish with AI".** **Chosen by the owner.** The rule-built note is always available and trustworthy, and prose is one tap away. This mirrors the owner report's existing "Write with AI".

PIMS output: one note copied as both `text/html` and `text/plain`. Per-PIMS variants were rejected: they would differ only in line breaks and bolding, and the clipboard's two flavours already cover that.

## Design

### 1. Record note builder: `src/utils/recordNote.ts`

`buildRecordNote(snapshot: ChartSnapshot, t: TFunction, lng): RecordNote` is a pure function.

`RecordNote = { sections: { heading: string; lines: string[] }[] }`.

Two renderers:

- `recordNoteText(note)`: plain text, with headings in caps and a blank line between sections.
- `recordNoteHtml(note)`: `<p><strong>Heading</strong><br>line<br>…</p>`, escaped.

Sections, in this order. An empty section is omitted.

1. **Header.** "Dental procedure", then patient name, species, patient number, chart date, doctor and tech.
2. **Anesthesia.** Drugs and doses as entered, plus nerve blocks.
3. **Oral exam.** The six standard exam areas plus custom areas, with their findings.
4. **Findings by tooth.** One line per tooth that has any data, in Triadan order. A line holds:
   - the `ToothData` grid fields (mobility, recession, pocket, furcation, hyperplasia, calculus, gingivitis, pdstate), and
   - pre-op marks and the text of every pre-op comment pinned to that tooth, quoted as written.

   Codes are not fields: they are free text typed or quick-stamped into comments (`preComments`). Teeth that were already missing are summarised on one line.
5. **Procedures.** Post-op marks and the text of `postComments` pinned to each tooth, with extractions summarised.
   - **Other notes:** comments not pinned to a tooth go into a final "Other notes" line in sections 4 and 5.
   - **Skipped:** mirrored grid comments (ids starting `grid-`, see `gridComments.ts`), because they repeat grid fields, and freehand strokes.
   - *(Builder call.)*
6. **Radiographic findings.** Free text.
7. **Treatment report.** The existing free text.
8. **Recheck.** The recall date.

Field and mark labels reuse the existing chart and PDF label keys, so the note's wording matches the chart PDF. New keys are only added for section headings and sentence frames.

Species (canine, feline, equine) and dentition (permanent, deciduous) come from the snapshot. Equine uses the 44-tooth Triadan set.

### 2. Storage

Add `recordNote?: { text: string; source: 'edited' | 'ai'; lng: AppLanguage; basedOn: string }` to `ChartSnapshot`.

- Absent means the note is generated live from the chart.
- Present means the user edited it or polished it with AI; the stored text is shown as is.
- No schema version bump: the field is optional and additive.

When the stored note is older than the chart, the tab shows a notice: "The chart changed since this note was edited", with a **Rebuild from chart** action. `basedOn` is a hash of the language-independent chart data the builder reads, not of the rendered text. Switching language, or a teammate with another language opening the chart, is therefore not "stale". The stored note keeps the language it was written in. *(Builder call.)*

**Locked charts.** Saved charts reopen view-only until unlocked (`useCloudSync`). The note follows the same rule as the owner report section (`readOnly`):
- **Copy** always works, whether the note is stored or generated.
- **Editing, Polish with AI and Rebuild** are disabled with an "Unlock to edit" hint until the chart is unlocked, and then save through the normal chart save path.
- No new write path. *(Builder call.)*

`DocumentsModal` needs new props for this: the full `ChartSnapshot`, the `readOnly` state, and an `onRecordNoteChange` callback. These are needed even when the owner report is off.

### 3. UI: a third tab in `DocumentsModal`

Tabs become Chart · Owner report · **Record note**.

- The record note tab is shown even when the owner report feature is off. In that case there are two tabs (Chart · Record note) instead of none.
- The body is a textarea holding the current note.
- Actions:
  - **Copy**: writes HTML + plain text with `ClipboardItem`. If `ClipboardItem` is unavailable, it falls back to `writeText`, then to `window.prompt`, as `PdfLinkPanel` does.
  - **Polish with AI**
  - **Rebuild from chart**: shown only when the note is stored.
- **Native iOS:** this is the same component inside the existing Sheet. Copy uses `navigator.clipboard`, which works in WKWebView after a user tap.
- New component: `src/components/RecordNotePanel.tsx`, with a `*.i18n.test.tsx` pseudo-locale test.

### 4. Polish with AI: `src/utils/recordNoteAi.ts`

This mirrors `ownerReportAi.ts`.

- It sends the rule-built note text plus the structured chart to `ai-autofill` with a new `kind: 'record-note'` (added to `KINDS`).
- It uses one tool, `write_record_note { text }`.
- Prompt rules:
  - Write a concise clinical procedure note in `{{language}}`, for a veterinary medical record.
  - Use only facts present.
  - Keep every tooth number and measurement exactly as given.
  - No diagnoses, causes, prognoses, drugs or doses that aren't in the input.
  - Keep the section headings.
- The result is stored as `{ source: 'ai' }` and stays editable.
- Rate limits and model choice are the existing `ai-autofill` ones. No plan gate, but the button shows only under the same condition as the owner report AI: `profile.aiEnabled && !trial && cloud.enabled` (`EntryGrid.tsx` ~1187).
- The kind is named `record_note`, matching the underscore style of `owner_report`.
- Errors are shown with `friendlyError`.

### 5. Email the owner report

**Client.** An **Email to owner** button in `OwnerReportModal`, next to Download.

- If the chart has no cloud id (trial or local), the button is disabled and explains that the chart must be saved to an account.
- If the chart has no owner email, the button opens a notice with a link to the Patient section. This is a new `onEditPatient` callback threaded through `DocumentsModal` from `EntryGrid`.
- **Unsaved changes.** The server sends to the saved `charts.owner_email`, so Send first triggers the normal chart save. If the chart can't be saved (offline, failed save, or a new chart that isn't saved yet), Send is blocked with "Save the chart before emailing the report". Locked charts have no unsaved edits, so they send as is. *(Builder call.)*
- Otherwise it opens a composer showing:
  - **To:** the chart's owner email, read-only.
  - **Subject:** default "Dental report for {{pet}}".
  - **Message:** a default short note signed with the practice name.
  - The PDF attachment, by filename.

The defaults come from a new `ownerReport.email.*` key set, resolved in the practice client language with `i18n.getFixedT(clientLng)`. The composer can reuse the `ReminderModal` layout.

On Send, the client builds the PDF bytes (the existing `buildOwnerReportPdfBytes`), base64-encodes them, and calls the edge function.

**Server: new edge function `supabase/functions/send-owner-report`** (verify_jwt on). It is modelled on `send-reminder`:

- **Body:** `{ chartId, subject, body, filename, pdfBase64 }`.
- **Checks:**
  - Authenticate the caller.
  - The chart exists, and the caller created it or is a member of its practice.
  - The recipient is the chart's `owner_email`, read on the server and validated.
  - From-name is the name of the chart's practice (`charts.practice_id`), falling back to the caller's first practice and then "ToothOps", with CR/LF stripped. *(Builder call; differs from `send-reminder`, which uses only the caller's practice.)*
  - Subject ≤ 200 characters and body ≤ 10,000.
  - Filename sanitised to `[\w .-]+\.pdf`.
  - The decoded PDF starts with `%PDF-` and is ≤ 10 MB.
  - A daily cap of 100 sends per account, counted in `ai_usage` with `model = 'owner-report-email'`. Like `reminder-email`, these rows count toward ai-autofill's rate limits. The builder should add `owner-report-email` and `reminder-email` to that function's exclusion next to `deepgram-token`.
- **Reply-To:** the email of the account that pressed Send (`caller.email`), so client replies reach that vet. *(Owner's decision. A practice-email setting could replace it later.)*
- **Send:** Resend with `attachments: [{ filename, content: pdfBase64 }]`. The plain-text body is the user's message; the HTML body uses `renderBrandedEmail` with no button.
- **Errors:** new codes in `_shared/apiErrors.ts` (`attachment_invalid`, `attachment_too_large`, `daily_owner_report_limit`, `report_chart_required`; the existing `chart_required` text names reminders), plus matching `common:errors.api.*` keys. Existing codes are reused where they fit (`no_owner_email`, `chart_forbidden`, `chart_gone`, `email_not_configured`, `email_failed`, `message_too_long`).
- **Afterwards:** stamp `charts.owner_report_sent_at` (migration: nullable timestamptz) so the tab can show "Sent to x@y on …".

The PDF goes in the request body rather than being uploaded to storage first. Reasons: it's a single call, the reports are a couple of MB, and Supabase edge functions accept bodies of that size.

### Tests

- **`recordNote.test.ts`:**
  - Section order and omission of empty sections.
  - Triadan ordering.
  - Equine and deciduous charts.
  - HTML escaping.
  - Determinism: same snapshot gives the same output.
  - Snapshot tests for a canine and a feline fixture.
- **`RecordNotePanel` tests:**
  - Copy writes both flavours.
  - The fallback paths.
  - The stale notice and Rebuild.
  - Polish stores `source: 'ai'`.
- **Pseudo-locale test** for `RecordNotePanel` and the email composer.
- **`recordNoteAi.test.ts`:** request shape, and parsing of the tool reply.
- **Edge function:** a unit test of the validation helpers (filename, PDF magic bytes, size), extracted to `_shared`.

## Left to the builder

- Exact wording of the sentence frames and email defaults. Follow `glossary.json`.
- Whether the composer is a new component or a parameterised `ReminderModal`.
- Visual styling, which should match the existing Documents tabs.
- Deploying the new edge function, applying the migration, and adding `send-owner-report` to `supabase/config.toml` with verify_jwt on.
