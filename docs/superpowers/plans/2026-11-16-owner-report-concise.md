# Owner report: concise findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner reports summarise mouth-wide findings in one line each, list only teeth that matter, put AVDC codes in plain words, show unanchored notes, use a neutral default intro, and give the AI draft the short findings plus a visit-first prompt.

**Architecture:** All logic stays in the deterministic report model (`buildOwnerReportModel`), which gains `summaryLines` and `otherFindings`; code-to-plain-words lives in a new small module. Renderers (PDF, on-screen preview, AI facts) read the model. Strings go in the `report` namespace in en/fr/de/it/es/pt.

**Tech Stack:** React + TypeScript, i18next, vitest, pdf-lib.

**Spec:** `docs/superpowers/specs/2026-11-16-owner-report-concise-design.md`

## Global Constraints

- Owner-report text uses `template.language` (`ReportLocale`: en, fr, de, it, es, pt), never the app language.
- New strings: English in `src/locales/en/report.json`; hand-written fr/de/it/es/pt in the same change (formal address; Italian courtesy forms capitalised; glossary terms); then `npm run i18n:translate -- --rehash`. Changed English (intro) → rewrite all five translations and restamp by name (`--rehash fr:report:intro de:report:intro it:report:intro es:report:intro pt:report:intro`).
- A value is a finding only when non-empty and not `"0"`; zeros never print.
- Summarise a periodontal field (gingivitis, calculus, recession, hyperplasia) when it's a finding on ≥ 6 teeth, or ≥ half of teeth present when fewer than 12 teeth are present. Extent: most ≥ 75%, many ≥ 40%, else some (share of teeth present).
- Severity words only for gingivitis and calculus: 1 mild, 2 moderate, 3+ severe; outlier (3+ while the summarised majority is lower) keeps its per-tooth note.
- Grid comments (`isGridComment`) never reach the owner report.
- No change to saved charts, the clinical PDF, the record note, or templates.
- `npm test` and `npm run build` pass before every commit.

## Review Focus

- Non-numeric grid values ("2+", "M4 D6", "1-2"): pockets keep today's per-root handling; for graded fields a value that doesn't parse as a number counts as a finding with no severity contribution (never "NaN").
- Charts with only zeros: no summary lines, no findings, the "nothing found" note still prints.
- Codes inside longer notes ("T/FX/CCF, pulp exposed"): only the code token is replaced; surrounding text kept; single-letter codes (`X`, `B`) are replaced only when they are the whole note.
- Equine charts: code lookup uses the species (`findCodesInText(text, species)`), so equine codes don't mis-match.
- `showGrades: false` templates: no severity words in summaries and per-tooth notes as today.

Each has a test in the owning task (Task 1: codes; Task 2: values, zeros, showGrades; Task 3: empty-chart rendering).

---

### Task 1: Plain words for AVDC codes

**Files:**
- Create: `src/utils/ownerReportCodes.ts`
- Test: `src/utils/ownerReportCodes.test.ts`
- Modify: `src/locales/{en,fr,de,it,es,pt}/report.json` (new `plainCodes` object), `src/utils/ownerReportI18n.ts` (`ReportStrings.plainCode`)

**Interfaces:**
- Produces: `ownerFriendlyText(text: string, locale: ReportLocale, species?: string): string` — returns `text` with each AVDC code token replaced by its plain phrase.
- Produces: `ReportStrings.plainCode: (code: string) => string | null` (null when no curated phrase).

Curated codes (keys of `report:plainCodes`, en values written by the implementer in owner language, e.g. `"T/FX/CCF": "a broken tooth with the nerve exposed"`): `T/FX`, `T/FX/EI`, `T/FX/EF`, `T/FX/UCF`, `T/FX/CCF`, `T/FX/UCRF`, `T/FX/CCRF`, `T/FX/RF`, `T/PE`, `T/NV`, `TR`, `T/A`, `T/U`, `T/I`, `DT`, `AT`, `AB`, `E/D`, `E/H`, `CA`, `GR`, `GH`, `OM`, `B`, `B/I`, `B/E`, `X`, `XS`, `XSS`, `RCT`, `VPT`, `PRO`.

- [ ] **Step 1: Write failing tests** in `ownerReportCodes.test.ts`:
  - `ownerFriendlyText('T/FX/CCF', 'en')` equals the en `plainCodes['T/FX/CCF']` value and contains no `T/FX`.
  - `ownerFriendlyText('T/FX/CCF, pulp exposed', 'en')` starts with the plain phrase and ends with `, pulp exposed`.
  - `ownerFriendlyText('B/I with 8mm punch and LN asp/cytology', 'en')` replaces `B/I` only.
  - `ownerFriendlyText('X', 'en')` → plain phrase; `ownerFriendlyText('R maxillary swelling', 'en')` unchanged (single letters only as whole note).
  - Uncurated code with a definition (`'MAL2'`, 'fr') → French `codes:MAL2` text; same code in `'pt'` → `'MAL2'` unchanged.
  - Every curated key exists and is non-empty in all six `report.json` files (iterate `Object.keys(en.plainCodes)`).
- [ ] **Step 2: Run** `npx vitest run src/utils/ownerReportCodes.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement.** Add `plainCode` to `reportStrings` (`t('plainCodes.<code>')` with `returnNull`-style check: return null if the key is missing). Implement `ownerFriendlyText` by scanning with the same token boundaries as `findCodesInText` (`src/constants/dentalCodes.ts`): get candidates from `findCodesInText(text, species)`, replace each whole-token occurrence longest-first with `plainCode(code) ?? (locale !== 'pt' ? codeDefinition(code, locale) : code)`. Write the 32 phrases in en, fr, de, it, es, pt; run `npm run i18n:translate -- --rehash`.
- [ ] **Step 4: Run** the test file and `npm run i18n:check` — expect PASS / `0 problems`.
- [ ] **Step 5: Commit** `feat(report): AVDC codes in plain words for owners`.

### Task 2: Concise findings in the model

**Files:**
- Modify: `src/utils/ownerReport.ts` (`OwnerReportModel`, `buildOwnerReportModel`)
- Modify: `src/locales/{en,fr,de,it,es,pt}/report.json` (`summary.*`, `extent.*`, `severity.*`, `otherFindings`), `src/utils/ownerReportI18n.ts`
- Test: `src/utils/ownerReport.test.ts` (new `describe('concise findings')`)

**Interfaces:**
- Consumes: `ownerFriendlyText` (Task 1).
- Produces on `OwnerReportModel`: `summaryLines: string[]` (one per summarised field, chart field order) and `otherFindings: string[]` (unanchored, non-grid comments, plain-worded). `teeth[].notes` no longer contain summarised fields (except outliers), zeros, or grid comments; anchored comment text passes through `ownerFriendlyText`.
- Produces on `ReportStrings`: `summaryLine(field, extent: 'most'|'many'|'some', severity: string): string`, `severityWord(level: 1|2|3)`, `severityRange(from: string, to: string)`, `otherFindingsHeading: string`.

Strings (en): `summary.gingivitis` "Gum inflammation on {{extent}}{{severity}}", `summary.calculus` "Tartar on {{extent}}{{severity}}", `summary.recession` "Receding gums on {{extent}}", `summary.hyperplasia` "Overgrown gum tissue on {{extent}}"; `extent.most` "most teeth", `extent.many` "many teeth", `extent.some` "some teeth"; `severity.mild` "mild", `severity.moderate` "moderate", `severity.severe` "severe", `severity.single` " ({{level}})", `severity.range` " ({{from}} to {{to}})"; `otherFindings` "Other findings".

- [ ] **Step 1: Write failing tests** (build snapshots with a small helper making `toothData` from `{triadan: fields}`):
  - Example fixture (40 canine teeth: gingivitis 2, four at 1; calculus 1–2 on 8; hyperplasia 2 on 107; anchored comments `T/FX/CCF`@104, `T/FX/UCF`@106, `T/FX/UCF`@406, `T/FX/UCRF`@205; unanchored "Generalized AB" and "B/I with 8mm punch and LN asp/cytology"; pre-missing 305, 405): `summaryLines` equals `['Gum inflammation on most teeth (mild to moderate)', 'Tartar on some teeth (mild to moderate)']`; `teethWithFindings(model).map(t => t.triadan)` equals `[104, 106, 107, 205, 406]`; 107's notes contain only the overgrowth phrase; `otherFindings.length === 2`; `JSON.stringify(model)` doesn't contain `T/FX/`.
  - 5 teeth with gingivitis in a 40-tooth mouth → `summaryLines` empty, five per-tooth notes; 6 → one summary with "some teeth".
  - Small chart, 10 teeth present, gingivitis on 5 → summarised.
  - Gingivitis 1–2 on 30 teeth plus 3 on tooth 108 → summary "(mild to moderate)" and 108 keeps "gum inflammation (grade 3)".
  - All values `"0"` → `summaryLines` empty, `teethWithFindings` empty.
  - Recession on 10 teeth → summary has no parentheses.
  - `showGrades: false` template → summary lines have no parentheses.
  - Grade value `"2+"` on gingivitis counts toward the threshold, contributes no severity, output has no `NaN`.
  - A grid comment (id with the grid prefix from `gridComments.ts`, anchored and unanchored) appears in neither `teeth` nor `otherFindings`.
- [ ] **Step 2: Run** `npx vitest run src/utils/ownerReport.test.ts` — expect the new tests FAIL.
- [ ] **Step 3: Implement** in `buildOwnerReportModel`: compute teeth present; per summarisable field collect `(triadan, value)` findings (non-empty, not "0"); apply the thresholds and extents from Global Constraints; severity from parsed integer grades (ignore non-numeric); drop summarised fields from per-tooth notes except outliers; skip zeros everywhere; filter `isGridComment` from both comment lists; route unanchored comments to `otherFindings` via `ownerFriendlyText(text, locale, snapshot.species)`; pass anchored comment text through it too. Add strings in six languages; rehash.
- [ ] **Step 4: Run** the test file plus `npx vitest run src/utils` and `npm run i18n:check` — expect PASS.
- [ ] **Step 5: Commit** `feat(report): summarise mouth-wide findings; plain-worded notes; other findings`.

### Task 3: Render summary lines and other findings

**Files:**
- Modify: `src/utils/ownerReportPdf.ts` (`case 'findings'`, `emptyChart`)
- Modify: `src/components/OwnerReportSection.tsx` (findings preview ~line 254)
- Test: `src/utils/ownerReportPdf.test.ts` (or the existing PDF test file), `src/components/ownerReport*.i18n.test.tsx` (pseudo-locale)

**Interfaces:**
- Consumes: `model.summaryLines`, `model.otherFindings`, `ReportStrings.otherFindingsHeading` (Task 2).

- [ ] **Step 1: Write failing tests:**
  - PDF text for the Task 2 example fixture contains both summary lines before the first tooth name and an "Other findings" heading followed by both lines (use the existing PDF test helper that extracts text, or assert on the draw calls the file's tests already use).
  - A chart whose only content is one unanchored note: the findings section prints (heading + other findings) and the "nothing found" note does not.
  - All-zero chart: "nothing found" note prints.
  - Pseudo-locale: the preview (`OwnerReportSection`) with the example shows summary lines and the "Other findings" label with `findUntranslated(...)` empty.
- [ ] **Step 2: Run** those test files — expect FAIL.
- [ ] **Step 3: Implement.** PDF `findings`: if `summaryLines` non-empty, draw them as bullets right after the heading; then the numbered tooth list as today; then, if `otherFindings` non-empty, a small bold "Other findings" line and bullets. Print the section when any of the three lists is non-empty. `emptyChart` also requires both new lists empty. Preview: same order, same strings.
- [ ] **Step 4: Run** the tests — expect PASS.
- [ ] **Step 5: Commit** `feat(report): print summary lines and other findings`.

### Task 4: Neutral intro and visit-first AI draft

**Files:**
- Modify: `src/locales/{en,fr,de,it,es,pt}/report.json` (`intro`)
- Modify: `src/utils/ownerReportAi.ts` (`ownerReportFacts`, `SYSTEM`)
- Test: `src/utils/ownerReport.test.ts`, `src/utils/ownerReportAi.test.ts`

**Interfaces:**
- Consumes: `summaryLines`, `otherFindings` (Task 2).

- [ ] **Step 1: Write failing tests:**
  - Built-in template intro for "Rex" equals `"Rex had a dental examination and treatment under anesthesia. This report explains what we found in everyday language — the full clinical chart with measurements is on file and available any time."` and contains no "cleaning".
  - `ownerReportFacts(example)` contains a `Mouth-wide findings:` block with both summary lines, an `Other findings:` block with both lines, the reason for visit and treatment report, and no `T/FX/`.
  - The system prompt includes the instructions: lead with the main reason for the visit and what was done; mention pending results when samples were sent (biopsy, cytology, histopathology); never invent anything.
- [ ] **Step 2: Run** `npx vitest run src/utils/ownerReport.test.ts src/utils/ownerReportAi.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Change en `intro` to the text above; rewrite fr/de/it/es/pt by hand; `npm run i18n:translate -- --rehash fr:report:intro de:report:intro it:report:intro es:report:intro pt:report:intro`. In `ownerReportFacts` add the two blocks (before "Findings by tooth"); in `SYSTEM` add the three instruction lines.
- [ ] **Step 4: Run** the two test files and `npm run i18n:check` — expect PASS / `0 problems`.
- [ ] **Step 5: Commit** `feat(report): neutral default intro; AI draft leads with the visit`.

### Task 5: Full verification

- [ ] **Step 1:** `npm test` — expect all test files pass.
- [ ] **Step 2:** `npm run build` — expect `i18n:check 0 problems` and `✓ built`.
- [ ] **Step 3:** Fix anything failing, commit, then hand off for review and PR.
