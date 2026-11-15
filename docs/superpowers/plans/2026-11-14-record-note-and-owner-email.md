# Record note + email owner report — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Record note" tab to Documents, and an "Email to owner" action on the owner report.
- **Record note:** a clinical note built from the chart, editable, with optional AI polish. One Copy action puts HTML and plain text on the clipboard.
- **Email to owner:** sends the PDF to the chart's saved owner email through a new edge function.

**Architecture:**
- A pure builder (`recordNote.ts`) turns a `ChartSnapshot` into sections, with text and HTML renderers.
- Edits and AI output are stored on the snapshot as `recordNote`, so they autosave with the chart.
- A `RecordNotePanel` inside `DocumentsModal` shows the note.
- The email is a composer in `OwnerReportModal`. It posts the PDF it already generated (`pdfBlobRef`) to `send-owner-report`, which is modelled on `send-reminder`.

**Tech Stack:** React 18 + TS, Vitest + Testing Library, i18next, Supabase Edge Functions (Deno), Resend.

**Spec:** `docs/superpowers/specs/2026-11-14-record-note-and-owner-email-design.md`

## Global Constraints

- **AGENTS.md applies in full:**
  - All user-facing text goes through `t()`.
  - Add keys to `src/locales/en/<ns>.json`, and write fr/de/it/es translations in the same change (formal address; Italian Lei/Suo/Sua; follow `src/locales/glossary.json`; identical `{{placeholders}}`).
  - Then run `npm run i18n:translate -- --rehash`.
  - Plurals need `_one`/`_other`, plus `_many` for fr/it/es.
- **Pseudo-locale tests:** every new exported `.tsx` component is imported by a `*.i18n.test.tsx` that uses `installPseudoLocale` + `findUntranslated`.
- **Errors:**
  - User-visible errors throw `new LocalizedError(t(...))`.
  - Edge-function errors return a `code`, defined in `supabase/functions/_shared/apiErrors.ts`, with a matching `common:errors.api.<code>` key in all 5 languages.
- **Voice/AI:** English voice behaviour is unchanged; the `src/utils/voice/__fixtures__/` snapshots must not change.
- **Languages:**
  - The note is in the user's app language (`i18n.language`).
  - The email's default wording is in the practice client language (`usePracticeLanguage(practiceId)`).
- **Gates:** `npm test` and `npm run build` pass before every commit.
- **Where to work:** worktree `/Users/timothyobrien/git/vibing-dental-record-note`, branch `record-note-and-owner-email`. Stage files by path.

## Review Focus

1. **A chart with nothing charted** (new chart, only the patient name): the note is just the header, never an empty heading. Covered in Task 1 (`omits empty sections`).
2. **A locked saved chart:** Copy works; edit, Polish and Rebuild are disabled. Covered in Task 5 (`locked chart: copy only`).
3. **Owner email changed in the form but not yet saved:** Send must save first, or block. It must never email the old address silently. Covered in Task 8 (`saves before sending; blocks when save fails`).
4. **Clipboard API missing** (older Safari, http, an in-app browser): Copy falls back to plain text, then to `window.prompt`. Covered in Task 3.
5. **A crafted request to `send-owner-report`** (non-PDF bytes, a huge payload, a header-injecting filename): rejected. Covered in Task 7 (validation tests).

---

### Task 1: Record note builder

**Files:**
- Create: `src/utils/recordNote.ts`
- Create: `src/utils/recordNote.test.ts`
- Modify: `src/locales/{en,fr,de,it,es}/media.json` (add `recordNote.*`)

**Interfaces:**
- Produces:
  - `interface RecordNoteSection { heading: string; lines: string[] }`
  - `interface RecordNote { sections: RecordNoteSection[] }`
  - `buildRecordNote(snapshot: ChartSnapshot, t: TFunction): RecordNote`. `t` is a fixed-language `TFunction` (from `i18n.getFixedT(lng)`).
  - `recordNoteText(note: RecordNote): string`
  - `recordNoteHtml(note: RecordNote): string`
  - `recordNoteBasis(snapshot: ChartSnapshot): string`. A djb2 hash, as a decimal string, of `JSON.stringify` of exactly the inputs the builder reads. It never includes language.

**Section order and content** (from the spec). Omit any section with no lines.
1. `recordNote.h.header`: "Dental procedure". Lines:
   - patient name, species label (`chart.json` species label key), patient number
   - date
   - doctor and tech
   - complaint
2. `recordNote.h.anesthesia`:
   - nerve blocks with any value, using the `forms:anesthesia.*` site labels plus right/left
   - `other`
   - drugs, via `formatAnestheticDrug`
   - `customAnesthesia` blocks and fields with a value
3. `recordNote.h.exam`: each `EXAM_ITEMS` area with a status, as `forms:exam.items.<key>`: normal/abnormal plus comment. Then `customExam` items with a status.
4. `recordNote.h.findings`:
   - One line per tooth in ascending Triadan order, for teeth with any non-empty `ToothData` field (labels `chart:columns.<field>`), a `preMarks` entry, or a `preComments` entry whose `anchorTriadan` is that tooth and whose id does not start with `grid-`.
   - Line format: `"{{triadan}}: Mobility 2; Pocket 6; …; <comment text>"`.
   - Teeth marked `missing` in `preMarks` go on one line: `recordNote.alreadyMissing` with `{{teeth}}`.
   - Comments not pinned to a tooth (`anchorTriadan === null`, not `grid-`) go on a final line: `recordNote.otherNotes`.
5. `recordNote.h.procedures`:
   - teeth `extracted` in `postMarks` on one line: `recordNote.extracted` with `{{teeth}}`
   - per-tooth `postComments` (same filtering as section 4)
   - unpinned post comments go on `recordNote.otherNotes`
6. `recordNote.h.radiographs`: `radiographicFindings`, split on newlines.
7. `recordNote.h.treatment`: `treatmentReport`, split on newlines.
8. `recordNote.h.recheck`: `recallDate`.

**Rendering:**
- Text: heading uppercased, lines below it, a blank line between sections.
- HTML: `<p><strong>{heading}</strong><br>{line}<br>…</p>` per section, with every string HTML-escaped (`&<>"`).

- [ ] **Step 1: Write the failing tests** in `recordNote.test.ts`. Use the real `i18n` with `i18n.getFixedT('en')` and a fixture snapshot built like `src/utils/ownerReportSample.ts`.
  - `omits empty sections`: a snapshot with only `patientName: 'Rex'` gives `sections.map(s => s.heading)` equal to `['Dental procedure']`.
  - `orders teeth by Triadan`: toothData for 409 (pocket '5') and 104 (mobility '1') gives findings lines in the order `104…`, `409…`.
  - `quotes pinned comments, skips grid- mirrors, collects unpinned`:
    - preComments `{id:'c1', text:'T/FX', anchorTriadan:104}`, `{id:'grid-104-x', text:'dup', anchorTriadan:104}`, `{id:'c2', text:'check occlusion', anchorTriadan:null}`
    - the 104 line contains `T/FX` and not `dup`
    - the last findings line contains `check occlusion`
  - `summarises missing and extracted`: preMarks `{108:'missing',204:'missing'}` gives a line containing `108, 204`; postMarks `{409:'extracted'}` gives a procedures line containing `409`.
  - `equine and deciduous`: species `'equine'` and `'canine-deciduous'` render the species label and don't throw.
  - `escapes html`: treatmentReport `'<b>&'` gives `recordNoteHtml` containing `&lt;b&gt;&amp;` and no `<b>&`.
  - `text format`: `recordNoteText` starts with `DENTAL PROCEDURE\n`, and sections are separated by `\n\n`.
  - `basis ignores language, tracks chart`: `recordNoteBasis(s)` is the same before and after `i18n.changeLanguage('fr')`, and differs when `toothData[0].pocket` changes.
  - `deterministic`: two calls give deep-equal output.
- [ ] **Step 2: Run** `npx vitest run src/utils/recordNote.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Add the en keys** under `media.json` → `recordNote`:
  - `h.{header,anesthesia,exam,findings,procedures,radiographs,treatment,recheck}`
  - `alreadyMissing` ("Already missing: {{teeth}}")
  - `extracted` ("Extracted: {{teeth}}")
  - `otherNotes` ("Other notes: {{text}}")
  - `normal`, `abnormal`, `right`, `left`, `doctor`, `tech`, `patientNumber`, `complaint`, `recall`

  Write the fr/de/it/es translations.
- [ ] **Step 4: Implement** the four functions in `src/utils/recordNote.ts`. Copy `hashStr` from `useCloudSync.ts:199` into a local helper; don't export it from the hook.
- [ ] **Step 5: Run** the tests. Expected: PASS.
- [ ] **Step 6: Run** `npm run i18n:translate -- --rehash`, then `npm test`. Expected: all pass.
- [ ] **Step 7: Commit:** `git add src/utils/recordNote.ts src/utils/recordNote.test.ts src/locales/*/media.json src/locales/.meta.json && git commit -m "Record note: build a clinical note from the chart"`

### Task 2: Store edited/AI notes on the chart

**Files:**
- Modify: `src/types/index.ts` (ChartSnapshot)
- Modify: `src/hooks/useChartState.ts` (~398–445, ~541–575, ~700–712)
- Test: `src/hooks/useChartState.recordNote.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface StoredRecordNote { text: string; source: 'edited' | 'ai'; lng: AppLanguage; basedOn: string }`
  - `ChartSnapshot.recordNote?: StoredRecordNote`
  - `useChartState()` returns `recordNote: StoredRecordNote | null` and `setRecordNote(v: StoredRecordNote | null): void`

- [ ] **Step 1: Write the failing tests** (renderHook):
  - `setRecordNote appears in getSnapshot`: after `setRecordNote({text:'x', source:'edited', lng:'en', basedOn:'1'})`, `getSnapshot().recordNote` has `text` `'x'`.
  - `null clears it`: `setRecordNote(null)` gives `getSnapshot().recordNote` `undefined`. The key is absent, so existing snapshot hashes don't change.
  - `applySnapshot restores it`: `applySnapshot({...snap, recordNote})` gives `recordNote` equal to the input.
  - `applySnapshot without it clears it`.
- [ ] **Step 2: Run** `npx vitest run src/hooks/useChartState.recordNote.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `usePersistedState<StoredRecordNote | null>('chart.recordNote', 1, null)`. Include it in the snapshot only when non-null, and reset it in `applySnapshot` from `snapshot.recordNote ?? null`. Also reset it wherever `setOwnerReport({})` is reset for a new chart.
- [ ] **Step 4: Run** the tests plus `npx vitest run src/hooks`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/types/index.ts src/hooks/useChartState.ts src/hooks/useChartState.recordNote.test.ts && git commit -m "Record note: store edited notes on the chart snapshot"`

### Task 3: Rich clipboard helper

**Files:**
- Create: `src/utils/clipboard.ts`
- Create: `src/utils/clipboard.test.ts`

**Interfaces:**
- Produces: `copyRichText(html: string, text: string): Promise<'rich' | 'plain' | 'prompt'>`. It tries, in order:
  1. `navigator.clipboard.write([new ClipboardItem({'text/html': Blob, 'text/plain': Blob})])`
  2. on absence or rejection, `navigator.clipboard.writeText(text)`
  3. on absence or rejection, `window.prompt(promptLabel, text)`

  The prompt label is a parameter: `copyRichText(html, text, promptLabel: string)`.

- [ ] **Step 1: Write the failing tests**, one per path:
  - `rich`: `write` is called with one item having both types; returns `'rich'`.
  - `plain when ClipboardItem missing`: delete `globalThis.ClipboardItem`; `writeText` is called with the text; returns `'plain'`.
  - `plain when write rejects`.
  - `prompt when clipboard missing`: `navigator.clipboard` is undefined; `window.prompt` is called with `(label, text)`; returns `'prompt'`.
- [ ] **Step 2: Run** `npx vitest run src/utils/clipboard.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/utils/clipboard.ts src/utils/clipboard.test.ts && git commit -m "Clipboard: copy HTML + plain text with fallbacks"`

### Task 4: Polish with AI

**Files:**
- Create: `src/utils/recordNoteAi.ts`
- Create: `src/utils/recordNoteAi.test.ts`
- Modify: `supabase/functions/ai-autofill/index.ts:93`. Change `KINDS` to add `'record_note'`.

**Interfaces:**
- Consumes:
  - from Task 1: `buildRecordNote`, `recordNoteText`
  - `sendAutofill`, `AutofillRequest` from `src/utils/aiAutofill.ts`
  - `LOCALE_LABELS` from `ownerReportI18n.ts`
- Produces:
  - `buildRecordNoteAiRequest(snapshot: ChartSnapshot, lng: AppLanguage): AutofillRequest`. Its fields:
    - `kind: 'record_note'`
    - `max_tokens: 4096`
    - one tool, `write_record_note`, with input `{ text: string }`
    - the user message holds `Write in <language>.`, then `NOTE`, then the `recordNoteText(buildRecordNote(snapshot, i18n.getFixedT(lng)))` output
  - `parseRecordNoteDraft(content): string | null`
  - `polishRecordNote(snapshot, lng): Promise<string>`. Throws `LocalizedError(t('media:recordNote.aiEmpty'))` when the parse returns null.

**System prompt rules** (from the spec):
- Rewrite as a concise clinical procedure note for a veterinary medical record.
- Use only facts present.
- Keep every tooth number, measurement and code exactly as given.
- No diagnoses, causes, prognoses, drugs or doses that aren't in the input.
- Keep the section headings, in the same order.
- Plain text only, with no markdown.

- [ ] **Step 1: Write the failing tests:**
  - `request shape`: `kind === 'record_note'`, `tools[0].name === 'write_record_note'`, and the user text contains `Write in French.` for `'fr'` and contains the tooth `104`.
  - `parse`: a tool_use block with `{text:' A '}` gives `'A'`; no tool_use gives `null`; an empty text gives `null`.
- [ ] **Step 2: Run** `npx vitest run src/utils/recordNoteAi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `ownerReportAi.ts`. Add the en key `recordNote.aiEmpty` plus 4 translations.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/utils/recordNoteAi.ts src/utils/recordNoteAi.test.ts supabase/functions/ai-autofill/index.ts src/locales/*/media.json src/locales/.meta.json && git commit -m "Record note: Polish with AI via ai-autofill (kind record_note)"`

### Task 5: RecordNotePanel

**Files:**
- Create: `src/components/RecordNotePanel.tsx`
- Create: `src/components/RecordNotePanel.test.tsx`
- Create: `src/components/recordNote.i18n.test.tsx`
- Modify: `src/locales/*/media.json`
- Modify: `src/components/EntryGrid.css` (or the stylesheet `DocumentsModal` already uses)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `RecordNotePanel` with props `{ snapshot: ChartSnapshot; stored: StoredRecordNote | null; onChange: (v: StoredRecordNote | null) => void; readOnly: boolean; aiEnabled: boolean }`.

**Behaviour:**
- `generated = recordNoteText(buildRecordNote(snapshot, i18n.getFixedT(i18n.language)))`.
- The textarea shows `stored?.text ?? generated`.
- Typing calls `onChange({ text, source: 'edited', lng: i18n.language, basedOn: recordNoteBasis(snapshot) })`.
- **Stale** = `stored && stored.basedOn !== recordNoteBasis(snapshot)`. It shows `recordNote.stale` and a **Rebuild from chart** button. Rebuild calls `onChange(null)`.
- Rebuild is also shown, without the notice, whenever `stored` is set.
- **Copy:**
  - If stored, HTML is the stored text escaped, with `\n` → `<br>`. Otherwise it's `recordNoteHtml(note)`.
  - It calls `copyRichText`.
  - It toasts `recordNote.copied` on `'rich'`/`'plain'`.
- **Polish with AI** (only when `aiEnabled`):
  - Shows a busy state while it runs.
  - On success calls `onChange({ text, source: 'ai', lng, basedOn })`.
  - On error, toasts `friendlyError(err, t('recordNote.aiFailed'))`.
- **readOnly:** the textarea is `readOnly`; Polish and Rebuild are disabled; the hint `recordNote.unlockHint` shows; Copy stays enabled.

**New en keys:** `recordNote.{title,copy,copied,copyPrompt,polish,polishing,rebuild,stale,unlockHint,aiFailed,aiBadge}`.

- [ ] **Step 1: Write the failing tests:**
  - `shows generated note`: the textarea value contains `DENTAL PROCEDURE`.
  - `editing stores an edited note`: typing calls `onChange` with `source: 'edited'`.
  - `stale notice and rebuild`: with `stored.basedOn = 'old'`, the stale text is visible; clicking Rebuild calls `onChange(null)`.
  - `locked chart: copy only`: with `readOnly`, Polish and Rebuild are disabled, the textarea is readonly, and Copy calls a mocked `copyRichText`.
  - `polish stores ai note`: mock `polishRecordNote` to resolve `'Prose'`; clicking Polish leads to `onChange` with `{text:'Prose', source:'ai'}`.
  - `polish hidden without aiEnabled`.
- [ ] **Step 2: Write** `recordNote.i18n.test.tsx` with `installPseudoLocale` + `findUntranslated` rendering `RecordNotePanel` (`readOnly` false, `aiEnabled` true, a stored stale note so every string shows). Assert `findUntranslated(container)` is `[]`.
- [ ] **Step 3: Run** `npx vitest run src/components/RecordNotePanel.test.tsx src/components/recordNote.i18n.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement** the component, keys and translations.
- [ ] **Step 5: Run** the tests, then `npm run lint` (`i18next/no-literal-string`). Expected: PASS.
- [ ] **Step 6: Commit** the component, tests, locales and `.meta.json`.

### Task 6: Record note tab in Documents

**Files:**
- Modify: `src/components/DocumentsModal.tsx` (tabs, ~line 36)
- Modify: `src/EntryGrid.tsx:1448-1475`
- Test: `src/components/DocumentsModal.test.tsx`
- Modify: `src/locales/*/media.json` (tab label)

**Interfaces:**
- Consumes: `RecordNotePanel` from Task 5; `chart.recordNote` and `chart.setRecordNote` from Task 2.
- Produces:
  - `DocumentTab = 'chart' | 'owner' | 'note'`
  - a new `DocumentsModal` prop `recordNote: { snapshot: ChartSnapshot; stored: StoredRecordNote | null; onChange; readOnly: boolean; aiEnabled: boolean }`

**Tabs:**
- They are `['chart', ...(ownerReport ? ['owner'] : []), 'note']`, so they show even when the owner report is off.
- `readSaved` accepts `'note'`.

**EntryGrid:**
- Pass `recordNote={{ snapshot: chart.getSnapshot(), stored: chart.recordNote, onChange: chart.setRecordNote, readOnly, aiEnabled: profile.aiEnabled && !trial && cloud.enabled }}`.

- [ ] **Step 1: Write the failing tests** in `DocumentsModal.test.tsx`:
  - `note tab without owner report`: with `ownerReport` undefined, there are 2 tabs and clicking the Record note tab renders the textarea.
  - `three tabs with owner report`.
  - `remembers note tab`: after selecting note, then closing and reopening, the note tab is active.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `DocumentsModal`, the EntryGrid wiring, and the tab label key `tabs.note` with translations.
- [ ] **Step 4: Run** `npx vitest run src/components/DocumentsModal.test.tsx src/EntryGrid.*.test.tsx src/app.i18n.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: `send-owner-report` edge function

**Files:**
- Create: `supabase/functions/_shared/ownerReportEmail.ts` (pure validation)
- Create: `src/utils/ownerReportEmail.validation.test.ts` (imports `../../supabase/functions/_shared/ownerReportEmail`, as `brandedEmail.test.ts` does)
- Create: `supabase/functions/send-owner-report/index.ts`
- Modify: `supabase/functions/_shared/apiErrors.ts`
- Modify: `src/locales/*/common.json` (`errors.api.*`)
- Modify: `supabase/functions/ai-autofill/index.ts:102-103` (exclude email rows from AI limits)
- Create: `supabase/migrations/20261124_owner_report_sent_at.sql`

**Interfaces:**
- Produces, in `_shared/ownerReportEmail.ts`:
  - `MAX_PDF_BYTES = 10 * 1024 * 1024`
  - `sanitizeFilename(name: string): string`. Keeps `[A-Za-z0-9 ._-]`, collapses everything else to `_`, trims to 100 characters, and ensures a `.pdf` suffix. Empty input gives `owner_report.pdf`.
  - `decodePdf(b64: string): { ok: true; bytes: Uint8Array } | { ok: false; code: 'attachment_invalid' | 'attachment_too_large' }`. Invalid base64, or bytes that don't start with `%PDF-`, give `attachment_invalid`. More than `MAX_PDF_BYTES` gives `attachment_too_large`. Check the length before decoding: `b64.length * 3/4 > MAX`.
- The HTTP contract is `POST { chartId, subject, body, filename, pdfBase64 }`, which returns `{ ok: true, to, sentAt }` or an `apiError` body.

**New error codes** (English in `apiErrors.ts`, keys in `common:errors.api`, 5 languages):
- `attachment_invalid`: "The report file couldn’t be read. Try again."
- `attachment_too_large`: "The report is too large to email (max 10 MB). Remove some photos and try again."
- `daily_owner_report_limit`: "Daily report email limit reached (100). Try again tomorrow."
- `report_chart_required`: "Save the chart before emailing the report."

**Function logic** (copy the `send-reminder` structure):
- Use CORS, the auth check and the chart access check as-is.
- `report_chart_required` if `chartId` is missing.
- Recipient = `charts.owner_email` (`no_owner_email` if invalid).
- From-name = the practice name of `charts.practice_id`, else the caller's first practice, else `ToothOps`. Strip CR/LF and cut to 100 characters.
- Limits: subject ≤ 200 characters, body ≤ 10,000 (`message_too_long`).
- Daily cap: 100 per day, counted in `ai_usage` with `model = 'owner-report-email'`.
- Send to Resend with:
  - `reply_to: caller.email` (when present)
  - `text: body`
  - `html` from `renderBrandedEmail({ preheader: subject, title: subject, paragraphs: body.split(/\n{2,}/) }, clientLng)`, where `clientLng` = `practices.client_language` of the chart's practice, else `'en'`
  - `attachments: [{ filename: sanitizeFilename(filename), content: pdfBase64 }]`
- Then insert the usage row, and update `charts.owner_report_sent_at = now()`.

**Migration:** `alter table public.charts add column if not exists owner_report_sent_at timestamptz;`

**ai-autofill:** the two rate-limit counts become `.not('model', 'in', '("deepgram-token","reminder-email","owner-report-email")')`.

- [ ] **Step 1: Write the failing tests** in `ownerReportEmail.validation.test.ts`:
  - `sanitizeFilename('a/b\r\nc.pdf') === 'a_b_c.pdf'`
  - `sanitizeFilename('') === 'owner_report.pdf'`
  - `sanitizeFilename('rex')` ends with `.pdf`
  - `decodePdf(btoa('%PDF-1.7 x')).ok === true`
  - `decodePdf(btoa('hello'))` returns `{ok:false, code:'attachment_invalid'}`
  - `decodePdf('!!!')` returns `attachment_invalid`
  - a base64 string of length `> MAX_PDF_BYTES*4/3 + 4` returns `attachment_too_large`
- [ ] **Step 2: Run** `npx vitest run src/utils/ownerReportEmail.validation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `_shared/ownerReportEmail.ts`, the error codes and keys, and the function. Use `decodePdf` before sending.
- [ ] **Step 4: Run** the tests plus `npx vitest run src/utils/apiErrors.test.ts`. Expected: PASS.
- [ ] **Step 5: Add** the migration file and the ai-autofill change.
- [ ] **Step 6: Run** `npm run i18n:translate -- --rehash`, `npm test`. Expected: PASS.
- [ ] **Step 7: Commit.** Deploy is a separate step at the end (Task 9).

### Task 8: Email composer on the owner report

**Files:**
- Create: `src/components/OwnerReportEmailModal.tsx`
- Create: `src/components/OwnerReportEmailModal.test.tsx`
- Modify: `src/components/reportui.i18n.test.tsx` (render the new modal)
- Modify: `src/components/OwnerReportModal.tsx` (button next to Download, ~line 208)
- Modify: `src/components/DocumentsModal.tsx` (pass through new `ownerReport` fields)
- Modify: `src/EntryGrid.tsx:1455-1470`
- Modify: `src/locales/*/reportui.json`

**Interfaces:**
- Consumes:
  - Task 7's HTTP contract, via `invokeFunction('send-owner-report', …)`
  - `errorText` from `src/utils/apiErrors.ts`
  - `usePracticeLanguage`
- Produces, as new fields on `DocumentsModal`'s `ownerReport` prop and on `OwnerReportModal`'s props:
  - `ownerEmail: string`, the in-memory `patientInfo.ownerEmail`
  - `ensureSaved: () => Promise<boolean>`
  - `onEditPatient: () => void`

  `OwnerReportEmailModal` props: `{ open; onClose; chartId: string; practiceId: string; practiceName: string; toEmail: string; patientName: string; ownerName: string; getPdf: () => { blob: Blob; filename: string } | null }`.

**EntryGrid `ensureSaved`:**
- If `!cloud.enabled || trial`, return false.
- If `readOnly`, return `!!chart.cloudChartId`.
- If `cloud.dirty || !chart.cloudChartId`, set `explicitSaveRef.current = true` and `try { await cloud.saveNow() } catch { return false }`.
- Return `!!chart.cloudChartId && !cloud.dirty`. Read the latest value through a ref.

`onEditPatient` = close Documents, then `goToSection('patient')`.

**OwnerReportModal button `reportui:email.button` ("Email to owner"):**
- Disabled with the title `email.needAccount` when `!cloudActive`.
- If `ownerEmail` is blank: `chooseDialog` with `email.noEmail` and an "Add owner email" action that calls `onEditPatient`.
- Otherwise: `await ensureSaved()`. If false, toast `email.saveFirst`. If true, open `OwnerReportEmailModal` with `getPdf` reading `pdfBlobRef` and the filename built as in `handleDownload` (extract a `reportFilename()` helper).

**Composer:**
- Defaults come from `i18n.getFixedT(clientLng, 'reportui')`:
  - `email.defaultSubject` ("Dental report for {{pet}}")
  - `email.defaultBody` ("Hello {{owner}},\n\nAttached is {{pet}}’s dental report from today’s visit. Please contact us with any questions.\n\n{{practice}}")
- To is read-only.
- Send: base64 the blob with `FileReader.readAsDataURL` (strip the prefix), then call `invokeFunction`. On success, toast `email.sent` ("Report sent to {{email}}") and close. On error, toast `errorText(err)`.
- Busy state: `email.sending`.

- [ ] **Step 1: Write the failing tests:**
  - `OwnerReportEmailModal.test.tsx`:
    - `prefills in client language`: mock `usePracticeLanguage` → `'fr'`; the subject value matches the French `defaultSubject` for pet `Rex`.
    - `sends pdf and chart id`: mock `invokeFunction`; clicking Send calls it with `('send-owner-report', {chartId:'c1', subject, body, filename, pdfBase64: <base64 of blob>})`.
    - `shows server error`: `invokeFunction` rejects an `ApiError` with code `daily_owner_report_limit`, which toasts the translated text.
  - `OwnerReportModal` test (existing file or new `OwnerReportModal.email.test.tsx`):
    - `saves before sending; blocks when save fails`: `ensureSaved` resolves false, so a toast shows `email.saveFirst` and the composer doesn't open. Resolving true opens the composer.
    - `no owner email → add email action`: the action calls `onEditPatient`.
- [ ] **Step 2: Add** `OwnerReportEmailModal` to `reportui.i18n.test.tsx` with `findUntranslated` → `[]`.
- [ ] **Step 3: Run** those tests. Expected: FAIL.
- [ ] **Step 4: Implement** the composer, the button, the plumbing, the keys and translations.
- [ ] **Step 5: Run** `npx vitest run src/components src/EntryGrid.*.test.tsx`, then `npm run lint`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 9: Full verification and deploy notes

- [ ] **Step 1:** Run `npm run i18n:translate -- --check`. Expected: `todo=0 remove=0`.
- [ ] **Step 2:** Run `npm test` and `npm run build`. Both must pass.
- [ ] **Step 3:** Manual check in `npm run dev`:
  - open a chart, then Documents, then Record note
  - copy and paste into a rich editor and into a plain textarea
  - lock a saved chart and confirm only Copy works
- [ ] **Step 4:** Commit any fixes. Push the branch with the bazhip account and open the PR. The PR body lists the deploy steps for the owner:
  - apply the migration
  - deploy `send-owner-report` (verify_jwt on)
  - redeploy `ai-autofill`
