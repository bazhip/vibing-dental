# ezyVet extension, phase 1 (Send to ezyVet from the web app): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension plus a **Send to ezyVet** button in Documents → Record note. Together they write the record note and the chart picture into the open ezyVet consult's fields, using a default mapping the vet can change.

**Architecture:**
- **Injected page script.** A classic (IIFE) script is injected into the ezyVet tab with `world: "MAIN"`. It exposes `window.__toothopsEzyvet` (`status`, `listFields`, `write`, `diagnostics`).
- **Background worker.** An MV3 service worker accepts `ping` / `inspect` / `send` / `diagnose` from `https://toothops.app` and `http://localhost:5173`, and drives that script through `chrome.scripting`.
- **Web app side.** The web app builds the items (mapping, splitting an edited note, the chart PNG) and shows the dialog. The extension only talks to ezyVet.

**Tech Stack:** TypeScript, React 19, Vite 8 (an extension build script calls Vite's `build()` twice), Vitest + jsdom, Supabase (Postgres migration + an edge function), i18next.

**Spec:** `docs/superpowers/specs/2026-11-15-ezyvet-extension-design.md`. Read it first: section numbers (§) below refer to it. Phase 2 (the side panel, spec §8) gets its own plan after this one ships.

## Global Constraints

- **AGENTS.md applies.**
  - Every user-facing string goes through `t()`. Add keys to `src/locales/en/pims.json`, write fr/de/it/es in the same change (formal address; Italian Lei/Suo/Sua), then run `npm run i18n:translate -- --rehash`.
  - Any `new Error('text')` that a user could see is a `LocalizedError`; dev-only ones carry `// eslint-disable-next-line no-restricted-syntax -- dev-only: <reason>`.
  - `npm test` and `npm run build` pass before every commit.
- **Extension code lives in `src/extension/`**, so the existing lint, i18n and pseudo-coverage rules apply to it.
- **The page script returns codes only, never translated text.** It contains no user-facing strings.
- **Allowed origins, exactly:** `https://toothops.app` and `http://localhost:5173`.
- **Manifest permissions, exactly:**
  - `permissions: ["scripting", "storage"]`
  - `host_permissions: ["https://*.ezyvet.com/*"]`
- **Never send ezyVet page text anywhere.** The diagnostic report contains selector match counts, states, booleans, field titles and kinds, version and codes, and nothing else.
- **Every ezyVet selector lives in `src/extension/ezyvet/selectors.ts`,** with a one-line comment, and is marked `// unverified: reference` until checked on real ezyVet.
- **Failure codes, exactly:**
  - `not_writable`, `field_not_found`, `editor_not_found`, `popup_not_found`, `popup_not_closed`
  - `save_button_not_found`, `save_not_confirmed`
  - `no_preferred_email`, `image_not_accepted`, `invalid_image`
  - `no_tab`, `extension_error`, `timeout`

## Review Focus

1. **The vet switches ezyVet to another patient or record between Inspect and Send.** `send` must re-inspect and refuse if the consult isn't writable, or if the patient now differs from what the vet confirmed. Owner: Task 5 (`background.send re-checks status and patient`).
2. **A write fails halfway through a multi-field send.** Earlier fields stay written. Later fields are still attempted, and each result is reported. Nothing is retried automatically. Owner: Task 5 (`send continues after a failed item`).
3. **A write throws inside the page.** The template guard must still be removed. Owner: Task 4 (`guard restored when write throws`).
4. **The vet double-clicks Send.** Only one send runs. Owner: Task 9 (`Send is disabled while sending`).
5. **The extension is installed but the service worker is asleep or was updated mid-session.** `ping` can fail once. The bridge retries `ping` once before reporting "not installed". Owner: Task 7 (`ping retries once`).

---

### Task 1: Field matching

**Files:**
- Create: `src/extension/ezyvet/matchField.ts`
- Test: `src/extension/ezyvet/matchField.test.ts`

**Interfaces:**
- Produces: `matchField(wanted: string, available: string[]): string | null`

The algorithm and synonyms are in spec "How ScribbleVet does it → Name matching". Write it fresh.
- Normalise by trimming, lower-casing, and stripping trailing `?:;.!`.
- Segments split on `>` or `/`.
- Plural forms: a small local helper (`s`/`es`/`ies`). Don't add a dependency.

- [ ] **Step 1: Write failing tests**

```ts
it('exact beats synonym', () => expect(matchField('History', ['Subjective', 'History'])).toBe('History'));
it('synonyms', () => {
  expect(matchField('Subjective', ['History', 'Plan'])).toBe('History');
  expect(matchField('Objective', ['Physical Exam'])).toBe('Physical Exam');
  expect(matchField('Exam', ['Physical Exam'])).toBe('Physical Exam');
});
it('plural', () => expect(matchField('Plans', ['Plan'])).toBe('Plan'));
it('leaf of compound', () => expect(matchField('In Person', ['Client Communication > In Person'])).toBe('Client Communication > In Person'));
it('parent only when unique', () => {
  expect(matchField('Client Communication', ['Client Communication > In Person'])).toBe('Client Communication > In Person');
  expect(matchField('Plan', ['Plan/Schedule > A', 'Plan/Schedule > B'])).toBeNull();
});
it('punctuation and case', () => expect(matchField('physical exam:', ['Physical Exam'])).toBe('Physical Exam'));
it('nothing', () => expect(matchField('Radiology', ['Plan'])).toBeNull());
```

- [ ] **Step 2:** Run `npx vitest run src/extension/ezyvet/matchField.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `matchField`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(extension): ezyVet field name matching`.

### Task 2: Mapping, edited-note split, payload items, patient check

**Files:**
- Modify: `src/utils/recordNote.ts`. `RecordNoteSection` gains `key: RecordNoteKey`; export `type RecordNoteKey = keyof typeof HEADING_KEYS` and `RECORD_NOTE_KEYS` (in note order); `add()` sets `key`.
- Create: `src/utils/pims/mapping.ts`, `src/utils/pims/patientMatch.ts`
- Test: `src/utils/pims/mapping.test.ts`, `src/utils/pims/patientMatch.test.ts`. Update `recordNote` tests and snapshots if the shape is asserted.

**Interfaces:**
- Consumes: `matchField` (Task 1); `buildRecordNote`, `recordNoteText`, `RecordNote` (existing).
- Produces:
  - `type SourceKey = RecordNoteKey | 'chart'`
  - `type PimsFieldMap = Partial<Record<SourceKey, string | null>>` (`null` = don't send)
  - `DEFAULT_EZYVET_MAP: Record<SourceKey, string | null>`, with the exact values from spec §5: `header: null`, `anesthesia: 'Plan'`, `exam: 'Physical Exam'`, `findings: 'Physical Exam'`, `procedures: 'Plan'`, `radiographs: 'Physical Exam'`, `treatment: 'Plan'`, `recheck: 'Plan'`, `chart: 'Discharge Summary'`
  - `effectiveMap(saved: PimsFieldMap | null): Record<SourceKey, string | null>`
  - `splitStoredNote(text: string, generated: RecordNote): RecordNote | null`
    - Splits on lines exactly equal to `heading.toLocaleUpperCase()` of the generated sections.
    - Returns null unless every generated heading is found, in order.
  - `type FieldInfo = { title: string; kind: 'note'|'popup'|'email'|'inPerson'|'dischargeSummary'; acceptsImage: boolean }` (this is also exported for the extension)
  - `targetableFields(fields: FieldInfo[]): FieldInfo[]`: drops `kind === 'email'`.
  - `type SendItem = { fieldTitle: string; text?: string; html?: string; pngDataUrl?: string }`
  - `buildSendItems(args: { note: RecordNote | { editedText: string; field: string | null }; map: Record<SourceKey, string | null>; fields: FieldInfo[]; pngDataUrl: string | null }): { items: SendItem[]; unresolved: string[] }`
    - Resolve each mapped title with `matchField` against `targetableFields(fields)`.
    - Group sections by resolved field, in note order. Text is heading line, then lines; sections are separated by a blank line. HTML uses the same markup as `recordNoteHtml`.
    - The picture joins the item with the same field (image last). It is dropped into `unresolved` if the field has `acceptsImage: false`.
    - Items are ordered by the first section's position, with a chart-only item last.
  - `patientsMatch(chartName: string, ezyvetName: string | null): boolean`
    - Normalise by NFD, stripping diacritics, lower-casing and collapsing whitespace.
    - Returns false if either side is empty or null; otherwise true when either name contains the other.

- [ ] **Step 1: Write failing tests**

```ts
// mapping.test.ts (fields fixture: History, Physical Exam, Assessment, Plan as 'note';
// Discharge Summary 'dischargeSummary' acceptsImage; Client Communication > Email 'email' acceptsImage)
it('defaults group by field in note order', () => {
  const { items } = buildSendItems({ note: canineNote, map: effectiveMap(null), fields, pngDataUrl: PNG });
  expect(items.map((i) => i.fieldTitle)).toEqual(['Plan', 'Physical Exam', 'Discharge Summary']); // anesthesia comes first in the note
  expect(items[0].text!.startsWith(t('app:sections.anesthesia').toLocaleUpperCase())).toBe(true);
  expect(items[2]).toEqual({ fieldTitle: 'Discharge Summary', pngDataUrl: PNG });
});
it('header not sent by default', () => expect(JSON.stringify(build())).not.toContain(canineNote.sections[0].lines[0]));
it('picture joins text sent to the same field', () => {
  const { items } = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), treatment: 'Discharge Summary' }, fields, pngDataUrl: PNG });
  const ds = items.find((i) => i.fieldTitle === 'Discharge Summary')!;
  expect(ds.text).toBeTruthy(); expect(ds.pngDataUrl).toBe(PNG);
});
it('email never targetable', () => {
  const r = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), chart: 'Client Communication > Email' }, fields, pngDataUrl: PNG });
  expect(r.unresolved).toContain('Client Communication > Email');
});
it('unknown field is reported, rest still sent', () => {
  const r = buildSendItems({ note: canineNote, map: { ...effectiveMap(null), exam: 'Dental' }, fields, pngDataUrl: null });
  expect(r.unresolved).toEqual(['Dental']); expect(r.items.length).toBeGreaterThan(0);
});
it('edited note as one block', () => {
  expect(buildSendItems({ note: { editedText: 'x', field: 'Plan' }, map: effectiveMap(null), fields, pngDataUrl: null }).items[0]).toMatchObject({ fieldTitle: 'Plan', text: 'x' });
});
it('split round trip', () => expect(splitStoredNote(recordNoteText(canineNote), canineNote)).toEqual(canineNote));
it('split fails on renamed heading', () => expect(splitStoredNote(recordNoteText(canineNote).replace('PROCEDURES', 'WORK DONE'), canineNote)).toBeNull());
it('saved null overrides default', () => expect(effectiveMap({ chart: null }).chart).toBeNull());

// patientMatch.test.ts
it.each([['Bella', 'Bella Smith', true], ['Zoë', 'zoe', true], ['Bella', 'Max', false], ['', 'Max', false], ['Bella', null, false]])(
  '%s vs %s', (a, b, ok) => expect(patientsMatch(a, b)).toBe(ok));
```

- [ ] **Step 2:** Run `npx vitest run src/utils/pims src/utils/recordNote`. Expected: FAIL.
- [ ] **Step 3:** Add `key` to the record-note sections, then implement `mapping.ts` and `patientMatch.ts`.
- [ ] **Step 4:** Run it again. Expected: PASS. Then run the full `npm test`; existing record-note snapshots must not change their text output.
- [ ] **Step 5:** Commit `feat(pims): note-to-ezyVet mapping and patient check`.

### Task 3: ezyVet page script, reading side (status, fields, diagnostics)

**Files:**
- Create: `src/extension/ezyvet/selectors.ts`, `src/extension/ezyvet/read.ts`
- Create: `src/extension/ezyvet/__fixtures__/consult-medical.html`, `consult-locked.html`, `consult-combined.html`, `patient-record.html`. Each starts with `<!-- synthetic: from reference selectors, unverified -->`, and has no real names (use "Testdog").
- Test: `src/extension/ezyvet/read.test.ts`

**Interfaces:**
- Consumes: `FieldInfo` type (Task 2).
- Produces:
  - `type EzyvetState = 'writable'|'notConsult'|'notMedicalTab'|'locked'|'combined'`
  - `status(doc?: Document): { state: EzyvetState; patientName: string | null }`
  - `listFieldElements(doc?: Document): (FieldInfo & { node: Element })[]` and `listFields(doc?): FieldInfo[]`
  - `diagnostics(doc?: Document): Diagnostics`, where `Diagnostics = { version: string; state: EzyvetState; selectorHits: Record<string, number>; fields: FieldInfo[]; hasJaxmanager: boolean; hasHugerte: boolean; hasLexical: boolean }`
  - `EXTENSION_VERSION`, exported from `src/extension/version.ts` (read from `package.json` version at build; `'dev'` in tests).

Use the selectors and the writable rule from the spec reference table, verbatim.
- **Patient name.** Use a best-guess selector constant, `PATIENT_NAME` (the consult header's patient link). Return `null` if it doesn't match.
- **Field entries.** `listFields` lists Client Communication → Email and → In Person as separate entries, titled `Client Communication > Email` and `Client Communication > In Person`.

- [ ] **Step 1: Write failing tests** (load each fixture into `document.body.innerHTML`)

```ts
it('writable consult on Medical tab', () => expect(status().state).toBe('writable'));
it('patient record is notConsult', () => { load('patient-record.html'); expect(status().state).toBe('notConsult'); });
it('locked', () => { load('consult-locked.html'); expect(status().state).toBe('locked'); });
it('combined', () => { load('consult-combined.html'); expect(status().state).toBe('combined'); });
it('lists fields with kinds', () => expect(listFields()).toEqual(expect.arrayContaining([
  { title: 'History', kind: 'note', acceptsImage: false },
  { title: 'Plan', kind: 'note', acceptsImage: false },
  { title: 'Vet Communication', kind: 'popup', acceptsImage: false },
  { title: 'Client Communication > Email', kind: 'email', acceptsImage: true },
  { title: 'Client Communication > In Person', kind: 'inPerson', acceptsImage: false },
  { title: 'Discharge Summary', kind: 'dischargeSummary', acceptsImage: true },
])));
it('strips counts from titles', () => expect(listFields().map((f) => f.title)).not.toContain('Plan (2)'));
it('no fields outside the active consult', () => { load('patient-record.html'); expect(listFields()).toEqual([]); });
it('diagnostics carry no page text', () => {
  const json = JSON.stringify(diagnostics());
  expect(json).not.toContain('Testdog');
  for (const s of fixtureNoteTexts) expect(json).not.toContain(s);
});
```

- [ ] **Step 2:** Run `npx vitest run src/extension/ezyvet/read.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the fixtures and implement `selectors.ts` and `read.ts`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(extension): read ezyVet consult state and fields`.

### Task 4: ezyVet page script, writing side (writers + template guard)

**Files:**
- Create: `src/extension/ezyvet/write.ts`, `src/extension/ezyvet/templateGuard.ts`, `src/extension/ezyvet/page.ts`. `page.ts` is the IIFE entry: it installs `window.__toothopsEzyvet = { version, status, listFields, write, diagnostics }` once per version.
- Test: `src/extension/ezyvet/write.test.ts`, `src/extension/ezyvet/templateGuard.test.ts`

**Interfaces:**
- Consumes: `read.ts` (Task 3); `SendItem` (Task 2).
- Produces:
  - `type WriteResult = { ok: true; guardSkipped?: boolean } | { ok: false; code: WriteCode }`
  - `write(item: SendItem, doc?: Document): Promise<WriteResult>`
  - `withTemplateGuard<T>(win: Window, fn: () => Promise<T>): Promise<{ result: T; guardSkipped: boolean }>`

Behaviour per field kind is spec §2. The guard's reply shape is spec §2a.
- `write` re-checks `status()` and returns `not_writable` unless the state is `writable`.
- **Images:** check `/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/` and length % 4 === 0, else `invalid_image`. An image sent to a field without `acceptsImage` returns `image_not_accepted`.
- **Note fields** (no `innerHTML` fallback):
  - Take an empty Lexical editor via `el.__lexicalEditor`. Insert one paragraph per text line, using the editor's registered `paragraph` and `text` node classes inside `editor.update(..., { discrete: true })`.
  - Then `pointerdown` inside the editor, and `pointerdown` on a temporary off-screen button outside it.
- **HugeRTE:** content is `html` (or text escaped into `<p>`), then `<p><img src=png></p>` when there's an image. Then `fire('input')`, `fire('change')`, `save()`, `setDirty(true)`.
- **Timeouts:** waits use `MutationObserver` / polling, at most 10 s each.

- [ ] **Step 1: Write failing tests.** Use the fixtures from Task 3, plus small fakes:
  - `fakeLexical(el)` records appended paragraphs.
  - `window.hugerte = { activeEditor: fakeHugeRte }` records `setContent` and `insertContent`.
  - Popup save buttons remove their `[id^="formbox"]` when clicked.
  - `window.jaxmanager = { request: vi.fn() }`, plus `window.response` and `window.updateGlobalItem` spies.

```ts
it('refuses when not writable', async () => { load('consult-locked.html'); expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'not_writable' }); });
it('note: new entry, one paragraph per line, existing untouched', async () => {
  const r = await write({ fieldTitle: 'Plan', text: 'line 1\nline 2' });
  expect(r.ok).toBe(true); expect(planEditor.paragraphs).toEqual(['line 1', 'line 2']); expect(existingPlanEntry.textContent).toBe('Earlier note');
});
it('note: image refused', async () => expect(await write({ fieldTitle: 'Plan', pngDataUrl: PNG })).toEqual({ ok: false, code: 'image_not_accepted' }));
it('note: missing lexical editor', async () => { removeLexical(); expect(await write({ fieldTitle: 'Plan', text: 'a' })).toEqual({ ok: false, code: 'editor_not_found' }); });
it('popup: fills textarea and saves', async () => { expect((await write({ fieldTitle: 'Vet Communication', text: 'a' })).ok).toBe(true); expect(lastSavedTextarea).toBe('a'); });
it('discharge summary: text then image in one document', async () => {
  await write({ fieldTitle: 'Discharge Summary', html: '<p>t</p>', pngDataUrl: PNG });
  expect(fakeHugeRte.content).toBe(`<p>t</p><p><img src="${PNG}"></p>`); expect(fakeHugeRte.dirty).toBe(true);
});
it('invalid image', async () => expect(await write({ fieldTitle: 'Discharge Summary', pngDataUrl: 'data:image/png;base64,@@' })).toEqual({ ok: false, code: 'invalid_image' }));
it('unknown field', async () => expect(await write({ fieldTitle: 'Nope', text: 'a' })).toEqual({ ok: false, code: 'field_not_found' }));

// templateGuard.test.ts
it('intercepts only templateFillData.php while active', async () => {
  const orig = window.jaxmanager.request;
  await withTemplateGuard(window, async () => {
    window.jaxmanager.request('get/templateFillData.php?id=1', '', null, cb);
    window.jaxmanager.request('get/other.php', '', null, cb2);
  });
  expect(orig).toHaveBeenCalledTimes(1); expect(orig).toHaveBeenCalledWith('get/other.php', '', null, cb2);
  await vi.waitFor(() => expect(cb).toHaveBeenCalled());
  expect(window.jaxmanager.request).toBe(orig);
});
it('guard restored when write throws', async () => {
  const orig = window.jaxmanager.request;
  await expect(withTemplateGuard(window, async () => { throw new Error('x'); })).rejects.toThrow();
  expect(window.jaxmanager.request).toBe(orig);
});
it('skipped without jaxmanager', async () => { delete window.jaxmanager; expect((await withTemplateGuard(window, async () => 1)).guardSkipped).toBe(true); });
```

- [ ] **Step 2:** Run `npx vitest run src/extension/ezyvet`. Expected: FAIL.
- [ ] **Step 3:** Implement `templateGuard.ts`, `write.ts` and `page.ts`. `write` wraps its body in `withTemplateGuard`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(extension): write to ezyVet fields with template guard`.

### Task 5: Protocol, background worker, manifest, build

**Files:**
- Create:
  - `src/extension/protocol.ts`
  - `src/extension/background.ts` (logic in exported functions; `chrome.*` passed in, so it's testable)
  - `src/extension/manifest.json`
  - `src/extension/README.md` (how to build, load unpacked and generate the key, plus the real-ezyVet manual checklist from spec Tests and §10)
  - `scripts/build-extension.mjs`
- Modify: `package.json` (script `"build:extension": "node scripts/build-extension.mjs"`; devDependency `@types/chrome`), `.gitignore` (`build-extension/`, `extension-key.pem`)
- Test: `src/extension/background.test.ts`

**Interfaces:**
- Consumes: page script globals (Task 4); `SendItem`, `FieldInfo`, `patientsMatch` (Task 2); `Diagnostics`, `EzyvetState` (Task 3).
- Produces (`protocol.ts`, imported by the web app):
  - `type Request =`
    - `{ type: 'ping' }`
    - `| { type: 'inspect' }`
    - `| { type: 'send'; tabId: number; expectedPatient: string; confirmedEzyvetPatient: string | null; items: SendItem[] }`
    - `| { type: 'diagnose'; tabId?: number }`
  - `type InspectResult = { tab: { id: number; title: string } | null; candidates: number; status: { state: EzyvetState; patientName: string | null } | null; fields: FieldInfo[] }`
  - `type SendResult = { ok: false; code: 'not_writable' | 'patient_changed' | 'no_tab' } | { ok: true; results: { fieldTitle: string; result: WriteResult }[] }`
  - `ALLOWED_ORIGINS = ['https://toothops.app', 'http://localhost:5173'] as const`
- **Background functions:** `handleExternal(msg, sender, deps)`, `pickEzyvetTab(tabs: chrome.tabs.Tab[]): { tab: chrome.tabs.Tab | null; candidates: number }`.

**Behaviour:**
- **Senders:** a sender whose origin is outside `ALLOWED_ORIGINS` gets no response, plus a `console.warn`.
- **Choosing the tab:** among `https://*.ezyvet.com/*` tabs, take the active tab of the last-focused window first, then the highest `lastAccessed`.
- **Injection:** `chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['ezyvet-page.js'] })`, then `func` calls into `window.__toothopsEzyvet`.
- **`send`:**
  - Focus the tab and its window.
  - Re-inspect: return `not_writable` if not writable. If the `patientName` now differs from `confirmedEzyvetPatient` (compared with `patientsMatch` when both are non-null, and by strict equality otherwise), return `patient_changed`.
  - Write items sequentially, collecting every result.

**Build script:**
- Vite `build()` with `lib: { entry: 'src/extension/ezyvet/page.ts', formats: ['iife'], name: 'ToothopsEzyvet', fileName: () => 'ezyvet-page.js' }`.
- Then `background.ts` as `es` → `background.js`.
- Then copy `manifest.json` with `version` from `package.json`.
- Then generate `_locales/<lng>/messages.json` from `src/locales/<lng>/pims.json` keys `extension.name` and `extension.description`. The `pims.json` keys are created here: add them in all five languages in this task.
- Output: `build-extension/`.

**Key:**
- Generate with `openssl genrsa 2048 > extension-key.pem` (git-ignored), and put the public key (DER, base64) in `manifest.json` `key`.
- The README documents computing the id: the first 32 hex characters of sha256(DER), mapped 0-f → a-p. Put that id in `src/extension/extensionId.ts` as `DEV_EXTENSION_ID`.
- The owner swaps in the Web Store key later.

- [ ] **Step 1: Write failing tests** (fake `chrome` deps)

```ts
it('ignores other origins', async () => expect(await handleExternal({ type: 'ping' }, { origin: 'https://evil.test' }, deps)).toBeUndefined());
it('ping', async () => expect(await handleExternal({ type: 'ping' }, okSender, deps)).toEqual({ version: 'dev' }));
it('picks active ezyVet tab of focused window, else most recent', () => {
  expect(pickEzyvetTab([tab(1, { lastAccessed: 9 }), tab(2, { active: true, focusedWindow: true })]).tab!.id).toBe(2);
  expect(pickEzyvetTab([tab(1, { lastAccessed: 3 }), tab(3, { lastAccessed: 9 })])).toMatchObject({ tab: { id: 3 }, candidates: 2 });
});
it('inspect without ezyVet tab', async () => expect(await handleExternal({ type: 'inspect' }, okSender, noTabs)).toMatchObject({ tab: null, status: null, fields: [] }));
it('background.send re-checks status and patient', async () => {
  deps.page.status = { state: 'writable', patientName: 'Max' };
  expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({ ok: false, code: 'patient_changed' });
  deps.page.status = { state: 'locked', patientName: 'Bella' };
  expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({ ok: false, code: 'not_writable' });
});
it('send continues after a failed item', async () => {
  deps.page.write = vi.fn().mockResolvedValueOnce({ ok: false, code: 'field_not_found' }).mockResolvedValueOnce({ ok: true });
  const r = await handleExternal(sendMsg({ items: [a, b] }), okSender, deps);
  expect(r).toEqual({ ok: true, results: [{ fieldTitle: a.fieldTitle, result: { ok: false, code: 'field_not_found' } }, { fieldTitle: b.fieldTitle, result: { ok: true } }] });
});
```

- [ ] **Step 2:** Run `npx vitest run src/extension/background.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the protocol, background, manifest, build script, README and key.
- [ ] **Step 4:** Run the tests: expect PASS. Then run `npm run build:extension`: expect `build-extension/` to contain `manifest.json`, `background.js`, `ezyvet-page.js` and `_locales/{en,fr,de,it,es}/messages.json`. Load it unpacked in Chrome: no manifest errors, and the id equals `DEV_EXTENSION_ID`.
- [ ] **Step 5:** Commit `feat(extension): background worker, protocol and build`.

### Task 6: Database and admin flag

**Files:**
- Create:
  - `supabase/migrations/20261125_pims_send.sql`
  - `supabase/functions/mark-pims-sent/index.ts` (verify_jwt on)
  - `supabase/functions/_shared/chartAccess.ts`: extract the creator-or-member check from `send-owner-report` and reuse it there.
- Modify: `supabase/schema.sql` (mirror the migration), `supabase/config.toml` (`[functions.mark-pims-sent] verify_jwt = true`), `supabase/functions/send-owner-report/index.ts` (use `chartAccess`), `supabase/functions/admin-api/index.ts` (`FEATURE_COLUMNS.pims_send = 'pims_send_enabled'`, plus the list select with the same missing-column fallback as `owner_report_enabled`), `src/components/AdminPanel.tsx` (a toggle next to the owner report one)
- Test: `supabase/functions/_shared/chartAccess.test.ts`

**Interfaces:**
- Produces:
  - **Columns:** `charts.pims_sent_at timestamptz` (nullable), `profiles.pims_field_map jsonb` (nullable), `practices.pims_send_enabled boolean not null default false`.
  - **Edge function:** `POST mark-pims-sent { chartId }` returns `{ sentAt }`, or `chart_forbidden` / `chart_gone` codes.
  - **Shared check:** `canAccessChart(admin, chart: { created_by: string; practice_id: string | null }, callerId: string): Promise<{ allowed: boolean; isMember: boolean }>`

**Migration:**
- Add the three columns.
- Add `pims_send_enabled` to `protect_practice_privileged_columns` (re-create the function with the extra `or` line).
- Replace `touch_updated_at` usage on `charts` with `charts_touch_updated_at_fn()`. It keeps `old.updated_at` when the only changed columns are `pims_sent_at` and/or `owner_report_sent_at` (compare `to_jsonb(new) - '{pims_sent_at,owner_report_sent_at,updated_at}'` with the same expression on `old`).
- Make it additive and idempotent, like the existing migrations.

The edge function uses the service role to set `pims_sent_at = now()` after `canAccessChart`, which is the same pattern as `send-owner-report` stamping `owner_report_sent_at`.

- [ ] **Step 1: Write failing tests** for `canAccessChart`: creator → allowed; member of the chart's practice → allowed with `isMember`; non-member → not allowed; chart without practice and not creator → not allowed.
- [ ] **Step 2:** Run `npx vitest run supabase/functions/_shared/chartAccess.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, function, shared check, admin flag and panel toggle.
- [ ] **Step 4:** Run the tests again: expect PASS. Then apply the migration to a Supabase branch (`mcp__supabase__create_branch`, then `apply_migration`) and check:
  - `update charts set pims_sent_at = now() where id = X` leaves `updated_at` unchanged;
  - an update to `data` still changes it;
  - a browser-role update of `practices.pims_send_enabled` raises 42501.

  Delete the branch afterwards.
- [ ] **Step 5:** Commit `feat(pims): sent-at stamp, field map column and practice flag`. Deploying the function and applying to production are the owner's steps; list them in the PR.

### Task 7: Web app extension bridge and profile wiring

**Files:**
- Create: `src/utils/pims/extensionBridge.ts`, `src/hooks/usePimsFieldMap.ts`
- Modify: `src/hooks/useProfile.ts` (read `practices.pims_send_enabled` beside `owner_report_enabled`; expose `pimsSendEnabled: boolean`), `src/utils/supabaseApi*` or wherever edge calls live (add `markPimsSent(chartId)`, following `send-owner-report`'s client call and error mapping), `supabase/functions/_shared/apiErrors.ts` + `common:errors.api.*` only if a new code is needed (reuse `chart_forbidden` and `chart_gone`)
- Test: `src/utils/pims/extensionBridge.test.ts`, `src/hooks/usePimsFieldMap.test.ts`

**Interfaces:**
- Consumes: `protocol.ts` types (Task 5); `PimsFieldMap`, `effectiveMap` (Task 2).
- Produces:
  - `extensionAvailable(): boolean`: `!!window.chrome?.runtime?.sendMessage && !isNativeApp()`
  - `ping(): Promise<{ version: string } | null>`: 500 ms timeout, one retry.
  - `inspect(): Promise<InspectResult>`
  - `send(req: Extract<Request, { type: 'send' }>): Promise<SendResult>`
  - `diagnose(tabId?: number): Promise<Diagnostics | null>`
  - `EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID ?? DEV_EXTENSION_ID`. Bridge rejections are `LocalizedError(t('pims:errors.extension_error'))` or `timeout`.
  - `usePimsFieldMap(): { map: Record<SourceKey, string | null>; save(next: PimsFieldMap): Promise<void>; reset(): Promise<void> }`. It reads and writes `profiles.pims_field_map`, following `useChartSettings`'s `chart_prefs` pattern. Without cloud or a session, it holds the map in memory with defaults.

- [ ] **Step 1: Write failing tests**

```ts
it('ping retries once', async () => { sendMessage.mockImplementationOnce(neverAnswers).mockImplementationOnce(answer({ version: '1.0.0' })); expect(await ping()).toEqual({ version: '1.0.0' }); });
it('ping null when not installed', async () => { sendMessage.mockImplementation(lastError('Could not establish connection')); expect(await ping()).toBeNull(); });
it('unavailable in native app', () => { native.mockReturnValue(true); expect(extensionAvailable()).toBe(false); });
it('field map defaults then saves', async () => { /* renderHook: map.chart === 'Discharge Summary'; save({ chart: null }) writes profiles.pims_field_map */ });
it('reset clears saved map', async () => { /* writes null */ });
```

- [ ] **Step 2:** Run `npx vitest run src/utils/pims/extensionBridge.test.ts src/hooks/usePimsFieldMap.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pims): extension bridge and saved field map`.

### Task 8: Chart picture

**Files:**
- Create: `src/utils/pims/chartPicture.ts`
- Test: `src/utils/pims/chartPicture.test.ts`

**Interfaces:**
- Consumes: `diagramSvgToPng` (existing; returns PNG bytes); `TOOTH_DIAGRAMS`; `PreviewSnapshot` from `PdfPreviewModal`.
- Produces: `renderChartPicture(snap: Pick<PreviewSnapshot, 'species'|'preSvg'|'postSvg'|'preComments'|'postComments'>, labels: { pre: string; post: string }): Promise<string>` (a PNG data URL).
  - Render each diagram like `PdfPreviewModal` does (`width`/`height`/`cropBounds` from `TOOTH_DIAGRAMS[species]`, scale 2, default comment colours).
  - Draw both onto one canvas: pre on top, post below, each under its label (pass in `t('pims:picture.pre')` and `t('pims:picture.post')`), on a white background.
  - Return `canvas.toDataURL('image/png')`.

- [ ] **Step 1: Write a failing test.** Mock `diagramSvgToPng` to return a 1×1 PNG and stub canvas. Assert:
  - it is called twice with the species' crop bounds;
  - the result starts with `data:image/png;base64,`;
  - the labels are drawn in order pre, then post.
- [ ] **Step 2:** Run `npx vitest run src/utils/pims/chartPicture.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pims): stacked chart picture for ezyVet`.

### Task 9: Send to ezyVet dialog and wiring

**Files:**
- Create: `src/components/SendToEzyvetDialog.tsx`, `src/components/SendToEzyvetDialog.test.tsx`, `src/components/pims.i18n.test.tsx`
- Modify:
  - `src/components/RecordNotePanel.tsx`: a **Send to ezyVet** button next to Copy, shown when `pims` is provided and `extensionAvailable()`.
  - `src/components/DocumentsModal.tsx`: `recordNote` gains `pims?: { enabled: boolean; chartId: string | null; patientName: string; sentAt: string | null }`, and passes `chartSnapshot` through for the picture.
  - `src/EntryGrid.tsx`: pass `pims: { enabled: profile.pimsSendEnabled, chartId: cloud.enabled ? chart.cloudChartId : null, patientName: chart.patientInfo.patientName, sentAt: <loaded pims_sent_at> }`. Load `pims_sent_at` where `owner_report_sent_at` is loaded, and follow its pattern.
  - `src/locales/{en,fr,de,it,es}/pims.json`; add `pims` to `NAMESPACES` in `src/i18n/config.ts` and to `src/i18n/i18next.d.ts`.

**Interfaces:**
- Consumes: Tasks 2, 5, 7 and 8.
- Produces: `SendToEzyvetDialog` props: `{ open; onClose; note: RecordNote; stored: StoredRecordNote | null; chartSnapshot: PreviewSnapshot | null; chartId: string | null; patientName: string; sentAt: string | null; onSent(sentAt: string): void }`.

**Dialog states:** these are spec §7, with the copy in `pims.json`.
- **Gate:** if the practice flag is off, no button.
- **Loading:** a spinner while `ping`, then `inspect`, runs.
- **Not installed:** an explainer and an install link. While the store URL is unknown, the link is hidden and the explainer says to ask ToothOps support.
- **No tab:** a message and a Retry button.
- **Not writable:** one message per state.
- **Several ezyVet tabs:** show "Using: <tab title>".
- **Writable:**
  - the target line;
  - the "Where it goes" rows (one per source that has content, plus the picture row when a `chartSnapshot` exists), each a `<select>` of `targetableFields` plus "Don't send";
  - the picture row only lists `acceptsImage` fields;
  - a saved title not on the page shows "Not on this page";
  - "Reset to defaults" and Send.
- **Edited note:**
  - If `stored` exists and `splitStoredNote` succeeds, show the normal rows.
  - If the split fails, show the notice and a single "Edited note →" row, defaulting to `effectiveMap(saved).treatment ?? 'Plan'`.
- **Send:**
  - Save the map.
  - If `!patientsMatch(patientName, status.patientName)`, show a confirmation naming both, with **Send anyway**.
  - Render the picture only if the chart row isn't "Don't send".
  - `send`, then show the results list (✓, or `t('pims:errors.<code>')`, plus unresolved titles as `field_not_found`).
  - If any item succeeded and `chartId` is set, call `markPimsSent`, then `onSent`.
- **Sending again:** if `sentAt` is set, confirm "Already sent on {{date}}. Send again?".
- **Diagnostic report:** a "Copy diagnostic report" link (`diagnose` → `copyRichText` of the JSON) in the results and error states.

- [ ] **Step 1: Write failing tests** (mock `extensionBridge`, `usePimsFieldMap`, `markPimsSent`, `renderChartPicture`)

```ts
it('not installed shows explainer', async () => { ping.mockResolvedValue(null); render(dlg()); expect(await screen.findByText(/pims:install\.title|Install/)).toBeInTheDocument(); });
it('no tab offers retry', async () => { inspect.mockResolvedValue({ tab: null, candidates: 0, status: null, fields: [] }); /* Retry calls inspect again */ });
it('locked consult explains', async () => { inspect.mockResolvedValue(writableWith({ state: 'locked' })); expect(await screen.findByText(t('pims:state.locked'))).toBeInTheDocument(); });
it('rows default to the mapping and omit email', async () => { /* Physical Exam selected for findings; options exclude 'Client Communication > Email' */ });
it('mismatch needs Send anyway', async () => { /* status.patientName 'Max', patientName 'Bella': first Send opens confirm, send not called until Send anyway */ });
it('Send is disabled while sending', async () => { /* send pending: button disabled; second click does not call send again */ });
it('results list and stamp', async () => { send.mockResolvedValue({ ok: true, results: [{ fieldTitle: 'Plan', result: { ok: true } }, { fieldTitle: 'Physical Exam', result: { ok: false, code: 'editor_not_found' } }] }); /* ✓ Plan, error text for Physical Exam, markPimsSent called once, onSent called */ });
it('picture skipped when chart row is Don\'t send', async () => { /* renderChartPicture not called */ });
it('edited note that cannot be split sends one block', async () => { /* stored with renamed heading → single row, defaults to Plan */ });
it('already sent asks first', async () => { /* sentAt set → confirm shown before send */ });
it('button hidden when practice flag is off or in native app', () => { /* RecordNotePanel without pims / native */ });
```

`pims.i18n.test.tsx`: `installPseudoLocale()`, render the dialog in each state (installed + writable, not installed, no tab, locked, results), and expect `findUntranslated(container)` to equal `[]` for each.

- [ ] **Step 2:** Run `npx vitest run src/components/SendToEzyvetDialog.test.tsx src/components/pims.i18n.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the dialog, wiring, `pims.json` (en plus fr/de/it/es written by hand) and the namespace registration. Run `npm run i18n:translate -- --rehash`.
- [ ] **Step 4:** Run them again: expect PASS. Then the full `npm test` and `npm run build`: both pass. Then a manual check with `npm start` plus the unpacked extension and a local copy of `consult-medical.html` served on a host mapped to `*.ezyvet.com` (or temporarily added to host permissions during the check). Verify that the dialog lists fields and that Send fills the fixture's fakes. Revert any temporary manifest change.
- [ ] **Step 5:** Commit `feat(pims): Send to ezyVet dialog`.

---

## After this plan

- **Owner's steps** (to list in the PR):
  - apply `20261125_pims_send.sql`;
  - deploy `mark-pims-sent`;
  - create the Web Store item (unlisted), then swap the manifest `key` and set `VITE_EXTENSION_ID` on Vercel;
  - enable `pims_send` for a pilot practice;
  - run the README checklist on real ezyVet.
- **Phase 2 (side panel)** gets its own plan. It reuses `matchField`, `mapping.ts`, `patientMatch.ts`, `renderChartPicture` (with diagrams mounted read-only as in `AdminChartViewer.tsx`) and the dialog's row and result components.
