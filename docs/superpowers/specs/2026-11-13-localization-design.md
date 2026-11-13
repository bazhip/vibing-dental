# Localization: French, German, Italian, Spanish — design

Date: 2026-11-13 · Status: reviewed by builder check; awaiting owner approval

## Intent

A user asked how well ToothOps supports French. Today only the owner
report (client-facing PDF) is translated; everything else is English.
The goal is native-language support in **every user-facing surface** for
**French, German, Italian, and Spanish** (plus English), and — the hard
requirement — translations must **stay current automatically** as new
features and text are added. The project may be heavy; the ongoing cost
of keeping five languages in sync must be near zero.

## Goals

- Every string a user sees in the app is available in en / fr / de / it / es.
- A user works entirely in their chosen language: UI, clinical chart PDF,
  owner report defaults, emails we send, voice dictation, AI write-ups,
  dates and numbers.
- New or changed English text cannot ship without translations: it is
  caught by lint/tests and filled in automatically.
- Veterinary-dental terminology is consistent across the app (glossary).

## Non-goals

- Other languages (Portuguese stays where it already exists — owner
  report templates — but is not added to the UI). Non-Latin scripts and
  right-to-left layout are out of scope; the PDF's standard Helvetica
  (WinAnsi) font covers all five languages.
- Translating free text users type (chart comments, notes, custom report
  sections). It prints as written, as today.
- Translating stored clinical codes (AVDC abbreviations, Triadan numbers).
  Codes stay codes; their *descriptions/labels* are translated.
- Operator-only surfaces: `AdminPanel` (gated by `isAdmin`) and emails
  that go to the operator (signup alert, feedback). They stay English and
  are exempt from the lint rule. *(builder call)*
- Localized pricing. Prices keep their current Stripe currency and plans;
  only number/currency *formatting* follows the locale. *(builder call)*
- Translated legal documents (see Legal below).

## Anti-goals (failure even if it "works")

- Half-translated screens (English fragments in a French UI).
- Raw keys (`chartLibrary.empty`) ever visible to a user.
- Translations silently going stale when English wording changes.
- Inconsistent or amateur clinical terms (e.g. "tartre" in one place,
  "calcul" in another for the same field).
- Builds that word things differently on each deploy (no build-time
  translation).

## Constraints (found in the codebase)

- React 19 + Vite + TypeScript, ~54 `.tsx` screens / ~18k lines with
  English hard-coded in JSX. No i18n library, no linter, no PR CI (only
  two scheduled GitHub workflows). Vercel builds on deploy.
- Owner report already localized in `src/utils/ownerReportI18n.ts`
  (typed TS tables, en/es/fr/de/pt), per-template `language`.
- PDFs use pdf-lib standard fonts (WinAnsi); `pdfSafe` / `safeFont`
  drop unencodable characters. Italian/French/German/Spanish all fit.
- Voice: Deepgram `nova-3-medical`, `language=en`, English keyterm list
  (`src/constants/voiceKeyterms.ts`). Monolingually the medical model is
  English-only, but Deepgram lists `language=multi` (code-switching
  es/fr/de/it/en) for `nova-3-medical`; non-English dictation uses that,
  with an automatic one-time fallback to general `nova-3` (still
  `language=multi`) if the medical socket fails before any transcript.
- AI: Claude via `supabase/functions/ai-autofill` (owner report AI
  already takes a language).
- Emails: Supabase Auth templates (`supabase/templates/*.html`) are
  pasted manually into the dashboard; team invites / reminders / feedback
  go through edge functions + Resend.
- User prefs already sync per person via `profiles.chart_prefs`.
- The repo is edited by multiple parallel Claude Code sessions.

## Approaches considered

1. **Typed TS dictionaries** (extend `ownerReportI18n.ts` pattern) —
   compile-time completeness, no dependency; but scripts rewriting TS
   source for automatic translation is fragile.
2. **react-i18next + JSON catalogs** — standard, plurals/interpolation,
   lazy loading, machine-editable JSON that automation can update safely;
   typed keys via i18next's TypeScript resource typing.
3. **Lingui / FormatJS extraction** — English inline, tool extracts;
   most build machinery for little gain here.

**Chosen: 2 (react-i18next + JSON)**, because automatic updating is the
core requirement and JSON is safe for scripts to edit. Type safety is
kept by typing keys from `en.json`.

For **who fills in translations**, chosen: **Claude Code sessions**
translate as part of each change (project instruction), with the build
gate as the enforcement. A GitHub Action backstop was built and then
dropped (2026-11-13): the owner chose not to store an Anthropic API key
as a repo secret. Build-time translation was rejected
(non-deterministic, unreviewed).

## Design

### Catalogs

- `src/locales/{en,fr,de,it,es}/<namespace>.json`, namespaced by area
  (e.g. `common`, `chart`, `library`, `report`, `admin`, `billing`,
  `landing`, `auth`, `settings`). English is the source of truth.
- A sidecar `src/locales/.meta.json` records, per key per language, the
  hash of the English text it was translated from and a status:
  `machine` (Claude-drafted) or `reviewed` (a human checked it). Changed
  English → hash mismatch → stale, re-translated, status back to
  `machine`. **Owner decision:** languages ship machine-drafted once
  automated checks pass; no human review gates launch. The status lets a
  reviewer work through strings later (a small script lists `machine`
  entries per language, glossary first).
- Glossary: `src/locales/glossary.json` — canonical term per language
  for vet-dental vocabulary (field names, stages/grades, anatomy, AVDC
  procedure names, tooth naming). The translator always receives it.
- The owner report's `ownerReportI18n.ts` tables move into the same
  catalogs (`report` namespace) so they share the pipeline; the report
  keeps per-template language and keeps Portuguese (report namespace
  only). English report output must stay byte-identical (existing tests).

### Runtime

- `i18next` + `react-i18next` + language detector. Language resolution:
  user's saved choice (`profiles.chart_prefs.language` or a new
  `profiles.language` column — builder's call) → browser language →
  English. Logged-out pages (landing, login, reset) use browser language
  + a language switcher, persisted in localStorage.
- Language picker in account settings; changes apply instantly.
- `<html lang>` updated on change.
- Dates, numbers, currency via `Intl` with the active locale; plurals via
  i18next (ICU-style plural forms).
- Missing key at runtime falls back to English (never shows a raw key);
  in dev it logs loudly.

### Surfaces

| Surface | Treatment | Status |
|---|---|---|
| All screens/modals/menus/toasts/errors | `t()` everywhere; aria-labels, titles, placeholders included | Done (plans 1–2). Plan 3 added lint for thrown error text. |
| Landing / marketing | Translated | Done (plan 2) |
| Legal (Terms, Privacy, DPA in `public/`, `LegalNotice`, terms acceptance) | **Owner decision:** stay English. A translated notice beside every legal link/acceptance states the documents are in English and the English version governs. `TERMS_VERSION` unchanged. | Done (plan 3, task 7) |
| Clinical chart PDF (`pdfGenerator`) | Labels from catalogs in the generating user's language | Done (plan 3, task 3) |
| Owner report | Per-template language as today; defaults to user's language for new templates | Done (plan 2; plan 3 makes new templates default to the practice client language) |
| "What's new" (`whatsNew.ts`) | Moves into catalogs; translated like everything else | Done (plan 2) |
| Emails via edge functions (invites, reminders) | Team-member emails in the recipient's language when known, else the sender's. Pet-owner emails (reminders) in the practice's client language (below). Templates in catalogs, bundled into functions at deploy | Done (plan 3, task 4). The owner still has to deploy the functions. |
| Practice-stored text (reminder template, report templates, custom anesthesia labels) | New practice setting **client communication language** (defaults to the creating user's language). Stored text that is still the untouched seeded default (e.g. `DEFAULT_REMINDER`) is detected and rendered from catalogs in the right language; once a practice edits it, it's theirs and prints as saved. Placeholder fallbacks ("your pet") come from catalogs. *(builder call)* | Done (plan 3, tasks 1–2). The owner still has to apply the migration. |
| Supabase Auth emails | Single template per type with Go-template branches on `.Data.language` (user metadata); generated from catalogs by a script, still pasted into the dashboard manually (Supabase limitation) — script prints a reminder when they change | Done (plan 3, task 5). The owner still has to paste the templates into the dashboard. |
| Voice dictation | **Owner decision: full parity at launch.** The dictation language is the app language when a dictation starts (kept on resume). `en` keeps `nova-3-medical` + English keyterms, byte-identical; fr/de/it/es use `nova-3-medical` with `language=multi` (code-switching; if that socket fails or closes before any transcript the session retries once on `nova-3` with `language=multi`) and per-language keyterm lists (English codes and drugs, spoken score synonyms, nerve-block sites, then glossary terms) (`src/utils/voice/sttConfig.ts`, `src/constants/voiceKeyterms.ts`). Everything after transcription is per-language (`src/utils/voice/`): `normalizeTranscript` (spoken digits incl. tooth numbers like "cent quatre"/"eins null vier", score words, "slash"/unit words), the filler-word filter, the wait-for-the-value check at the end of an utterance, the autofill system prompt and its examples, and the replay harness (`scripts/replay-transcript.ts`) with test transcripts per language (`scripts/fixtures/voice/<lng>/`). Handles vets mixing English codes into native speech. Accuracy bar: per-language replay suite passes at the same rate as English. | Done (plan 4; voice chrome in plan 2). The owner still has to run the live parity check (`npm run replay -- --all-langs --expect --runs 3`; needs only `ANTHROPIC_API_KEY`, reports mean F1 over the runs) and confirm `language=multi` with keyterms on `nova-3-medical` (else the session falls back to `nova-3`). Replay scores cleanup + Claude extraction from text, not speech recognition: for that, record each fixture script read aloud, download the transcript and replay it with `--lang <lng> --expect scripts/fixtures/voice/<lng>/expected.json` (cleanup column differs by design; the score counts). |
| AI autofill / AI report | Prompts instruct output in user's language; extracted clinical codes unchanged | Plan 4 |
| Server error messages shown to users | Return error codes; client maps to translated text | Done (plan 3, task 6). The owner still has to deploy the functions. |

### Keeping it current (the automation)

0. **Build gate** *(builder call)*: the completeness test runs in
   `npm run build`, so a Vercel deploy fails if any translation is
   missing or stale — this covers code that reaches `main` without a PR.
   A Claude session or the translate script fixes it; a failing
   Anthropic API never blocks, since translations can be written by hand.
1. **Lint**: add ESLint with `eslint-plugin-i18next` (`no-literal-string`
   in JSX, tuned to ignore class names, test ids, codes). Runs in the
   `build` script and in CI so hard-coded English fails.
2. **Completeness test** (vitest): every key in `en` exists in every
   language; no stale hashes; interpolation placeholders match
   (`{{pet}}` present in every translation); no empty strings.
3. **Translate script** `npm run i18n:translate`: diffs catalogs +
   `.meta.json`, sends only missing/stale strings (with glossary, key
   path, and surrounding context) to Claude, writes results and hashes.
   Idempotent; no-op when nothing changed. Uses `ANTHROPIC_API_KEY`.
4. **Claude sessions**: a project `CLAUDE.md` rule — when adding/changing
   UI text, add keys to `en` and run `i18n:translate` (or write the
   translations directly), and run the completeness test.
5. ~~GitHub Action on `pull_request`~~ — dropped (owner won't add the
   `ANTHROPIC_API_KEY` secret). The build gate (step 0) is the backstop.

### Rollout

The extraction of ~18k lines is the bulk of the work and can land in
slices by area (each slice: extract → translate → verify), behind the
language picker *and* browser-language detection being off until all areas are done, so users never
see a half-translated UI.

## Left to the builder

- Namespace boundaries and key naming conventions.
- Where the language preference is stored (chart_prefs vs column).
- Exact ESLint ignore configuration.
- Claude model choice for the translate script and batching strategy.
- How edge functions consume catalogs (bundle copy vs shared module).
- Test strategy for screens (render in a non-English locale smoke tests).

## Owner decisions (2026-11-13)

- Languages: fr, de, it, es (+ en). Portuguese stays in the owner report only.
- Library: react-i18next + JSON.
- Automation: Claude sessions translate as they go; the build gate blocks
  anything missing. (GitHub Action backstop dropped — no API key secret.)
- Translations ship machine-drafted; human review is optional, later.
- Voice dictation: full parity at launch.
- Legal documents: English, with translated "English governs" notice.

## Builder calls (owner may override)

- Operator-only admin panel and operator emails stay English.
- No localized pricing; formatting only.
- Practice "client communication language" setting; untouched seeded
  defaults render translated, edited text prints as saved.
- Completeness test gates `npm run build` (blocks deploy on missing translations).
- Browser-language detection is off (as well as the picker) until rollout is complete.
