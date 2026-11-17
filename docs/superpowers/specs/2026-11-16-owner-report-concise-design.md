# Owner report: concise findings — design

Date: 2026-11-16 · Status: approved 2026-11-16 (builder-check answers folded in)

## Why

Vets find the owner report "long and cumbersome". Real example (a canine biopsy visit, Nov 13): the findings section listed **40 teeth**, nearly all "gum inflammation (grade 2)", about a page and a half of bullets. Meanwhile:

- The **reason for the visit** (an oral mass, biopsied, results pending) appeared only as one shorthand exam line. The biopsy wasn't mentioned at all, because notes not anchored to a tooth and the treatment notes never reach the report.
- The **intro was wrong**: the built-in default says "had a professional dental assessment and cleaning under anesthesia" whatever was done.
- **AVDC shorthand** went to the owner verbatim: "T/FX/CCF", "T/FX/UCRF".

The report is what owners take home. It should read like a short letter from the vet: the main point first, the few teeth that matter, and plain words.

## Goals

- Mouth-wide findings shared by most teeth collapse into **one plain line per finding**.
- The per-tooth list holds only teeth with **something specific**: extractions, fractures and other coded diagnoses, notes, and measurements that aren't part of a mouth-wide pattern.
- AVDC codes inside notes read in **plain words** in the report's language.
- Notes not anchored to a tooth (e.g. "oral mass…", "biopsy taken…") appear as **"Other findings"** lines.
- The built-in default intro is **neutral**, never wrong for a non-cleaning visit.
- The AI draft ("Write with AI") **knows the reason for the visit and what was done**, so its summary leads with it (e.g. "we took a small sample of the growth; we'll call with the results").
- The example above drops from ~40 lines to about 6–8.

## Non-goals

- No change to saved charts. Reports are generated at render time, so existing charts improve on next open; nothing is migrated.
- No change to the clinical chart PDF or the record note.
- No per-practice settings for any of this (e.g. a threshold control). It's a better default for everyone.
- No AI in the deterministic findings list. The findings stay reproducible; AI only drafts the intro and home care (as today).

## Anti-goals

- Hiding clinically important information from the owner. Anything specific to a tooth (fracture, extraction, resorption, a vet's note) must still appear. Only *repetition* is removed.
- Inventing facts. The AI draft may only use what's on the chart.

## Approaches considered

- **A. Deterministic summary:** collapse mouth-wide findings, list only teeth that matter, translate codes, add unanchored notes. Predictable, translatable, applies to every report automatically.
- **B. AI writes the findings:** flexible, but the wording varies, needs proofreading, and only helps when someone clicks the button.
- **C. A + a better-informed AI summary (chosen by the owner):** A fixes length and clarity everywhere, and the AI draft also sees the complaint and treatment notes, so its summary fits the visit.

## Design

### 1. Mouth-wide findings (`buildOwnerReportModel`)

- **Teeth present** = the chart's teeth minus pre-op missing and post-op extracted ones.
- A value counts as a finding only when it's non-empty and **not 0** (gingivitis/calculus 0 = none). Zeros are no longer printed anywhere in the owner report ("grade 0" said nothing useful).
- For each periodontal field shown to owners (gingivitis, calculus, recession, gum overgrowth/hyperplasia), the field is **summarised** when it's a finding on **6 or more teeth** (my call), or on at least half of the teeth present for small charts (fewer than 12 teeth present).
- A summarised field becomes **one line** and is removed from per-tooth notes. Extent word by share of teeth present: **most** (≥ 75%), **many** (≥ 40%), **some** (otherwise) (my call). E.g. "Gum inflammation on most teeth (mild to moderate)", "Tartar on some teeth (mild to moderate)".
- **Severity words only for graded fields** (gingivitis, calculus): from the range of grades recorded, 1 = mild, 2 = moderate, 3+ = severe; a range ("mild to moderate") or a single word. Recession and hyperplasia are millimetres: no severity words.
- **Outlier exception (graded fields only):** a tooth graded **3+** when most summarised teeth are lower keeps its own note, so severe teeth stay visible.
- Fields never summarised (mobility, pocket depth, furcation, periodontal stage) stay per tooth as today (zeros excluded).
- When the template hides grades (`showGrades` false), summary lines have no severity words.

### 2. Per-tooth list

- Unchanged rules otherwise: a tooth gets a line if it has any remaining note or is extracted. Order by Triadan as today.
- Diagram pins follow this list (`teethWithFindings`), so fewer teeth means fewer pins. No change needed there.

### 3. Codes in notes

- When a note contains AVDC codes (matched with the existing code list, longest first), each code is replaced in the report by a plain phrase in the report's language.
- Plain phrases are written for the ~25 codes owners commonly see: fractures (`T/FX/*`), tooth resorption (`TR*`), extraction types (`X`, `XS`, `XSS`), missing/unerupted, discoloured/non-vital tooth, enamel defects, abrasion/attrition, caries, oral mass (`OM`), biopsy (`B/I`, `B/E`), root canal, crown, restoration, and gingival hyperplasia/recession codes. The builder picks the exact list from `dentalCodes.ts`, guided by what owners would meet in a report.
- Other codes fall back to the AVDC definition if one exists in the report's language; otherwise the code stays as written.
- New strings live in the `report` namespace (`report:codes.<code>`) in en, fr, de, it, es and pt, written by hand per AGENTS.md (formal address, glossary terms).

### 4. Other findings (unanchored notes)

- **Auto-copied grid comments are excluded** from the report entirely (`isGridComment`, `src/utils/gridComments.ts`): they repeat the grid in English ("Gingivitis 2 · Calculus 1", "Whole mouth — …") and printed as if the vet had written them. The grid itself already feeds the findings.
- Diagram notes with no anchor tooth become bullet lines under a new **"Other findings"** sub-heading at the end of the findings section, verbatim apart from code replacement (§3).
- Exam notes keep their own section as today.
- Treatment notes (`treatmentReport`) are not printed verbatim (clinical prose); they reach the owner only through the AI draft (§6).

### 5. Neutral default intro

- The built-in default intro (`report:intro`, the generated text) changes from "…had a professional dental assessment and cleaning under anesthesia…" to a neutral wording, e.g. "{{pet}} had a dental examination and treatment under anesthesia. This report explains what we found in everyday language…". Practice-written template intros are untouched.
- The English text changes, so the fr/de/it/es/pt translations are rewritten by hand and restamped by name (AGENTS.md).

### 6. AI draft knows the visit

- `ownerReportFacts` already sends the presenting complaint and the treatment notes. Changes:
  - The facts send the **new summary lines and "Other findings"** plus the (now short) per-tooth list, instead of the old per-tooth dump.
  - The prompt asks the summary to **lead with the main reason for the visit and what was done**, to mention **pending results** when the notes say samples were sent (biopsy, cytology, histopathology), and never to invent anything.
- The English voice-path snapshot rule (AGENTS.md "Voice") doesn't apply: this is the owner-report prompt, not dictation.

### Rendering

- `ownerReportPdf.ts` (and any on-screen preview that renders the model) draws the summary lines at the top of the findings section, then the per-tooth list, then "Other findings".
- Model shape: add `summaryLines: string[]` and `otherFindings: string[]`. `teeth` keeps its type.

## Constraints

- AGENTS.md i18n rules: all strings via `t()`, English source keys, hand-written translations, `--rehash`, plural forms (`_many` for fr/it/es) where counts appear.
- Owner reports use the practice client language (`template.language`), not the app language.
- `npm test` and `npm run build` must pass.

## Testing

- A fixture shaped like the example (40 teeth with gingivitis 1–2, calculus 1–2 on 8, gum overgrowth on 1, four fracture notes, two unanchored notes, a biopsy complaint): 2 summary lines, per-tooth lines only for the four fracture teeth and the overgrowth tooth, 2 "Other findings" lines (about 9 lines total), each fracture in plain words, no raw `T/FX/` text in the model.
- Thresholds: 5 teeth with gingivitis in a 40-tooth mouth → per tooth; 6 → summary ("some"); small chart (10 teeth present) uses half; a grade-3 outlier inside a grade-1–2 mouth keeps its own line; zeros never count or print; recession summary has no severity words; `showGrades` off → no severity words.
- Grid comments (with the grid-comments setting on) don't appear in the report.
- AI facts include the complaint and treatment notes (existing `ownerReportAi` tests extended).
- The pseudo-locale test covers the new section heading and summary strings.

## Left to the builder

- The exact plain-phrase list and wording (§3), and the summary-line wording in each language.
- Whether "Other findings" is a sub-heading inside Findings or its own built-in section in the template (prefer a sub-heading: no template migration).
- PDF spacing and typography for the new lines.

## My calls (for the owner to check)

- A finding is summarised from 6 teeth (half of the mouth for charts under 12 teeth); extent "most" ≥ 75%, "many" ≥ 40%, else "some".
- Severe outliers (grade 3+) still get their own line; mm fields have no severity words.
- Zeros count as no finding and never print.
- Auto-copied grid comments are left out of the owner report.
- The neutral default intro wording.
- Treatment notes are never printed verbatim; only the AI draft uses them.
- Portuguese has no AVDC definitions file: unknown codes in a pt report fall back to the code as written (the curated plain phrases are written in pt too).
