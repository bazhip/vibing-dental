# i18n Foundation & Auto-Translation Pipeline — Implementation Plan (1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the translation runtime, language preference, catalogs, completeness gate, Claude-powered translate script, lint rule, and PR automation in place, and move the owner report onto it, with no change for users yet (switching stays off).

**Architecture:** react-i18next with JSON catalogs at `src/locales/<lng>/<ns>.json` (English is the source of truth) and a sidecar `src/locales/.meta.json` that stores, per translation, the hash of the English it came from and whether it's `machine` or `reviewed`. A pure checker (`scripts/i18n/check.ts`) gates `npm run build` and the vitest suite. A translate script fills missing or stale strings via Claude, used by both Claude sessions (per `CLAUDE.md`) and a GitHub Action on PRs. Everything is behind `LANGUAGE_SWITCHING_ENABLED` (off), so the app keeps rendering English.

**Tech Stack:** React 19, Vite 8, TypeScript 5.9, Vitest 4, i18next, react-i18next, @anthropic-ai/sdk (already a dependency), ESLint 9 flat config + typescript-eslint + eslint-plugin-i18next, tsx, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-localization-design.md`

**Later plans (not this one):** 2 — extract every screen into catalogs, area by area, then turn switching on; 3 — clinical PDF, emails, Supabase auth templates, practice client-language setting, seeded-default detection, legal "English governs" notice; 4 — voice dictation parity.

## Global Constraints

- App languages: `en`, `fr`, `de`, `it`, `es`. `en` is the source of truth. Portuguese (`pt`) exists only in the `report` namespace.
- No non-Latin scripts and no RTL. PDFs keep standard Helvetica (WinAnsi).
- English owner-report output must stay byte-identical (existing `src/utils/ownerReport.test.ts` passes unchanged).
- A raw key is never shown to a user: missing keys fall back to English at runtime and log `console.error` in dev.
- No build-time translation. The build only *checks*.
- `npm run build` fails on any missing, stale, empty, or placeholder-mismatched translation.
- Translations ship with status `machine`. Human review is optional and later.
- Language switching **and** browser-language detection stay off until plan 2 finishes (`LANGUAGE_SWITCHING_ENABLED = false`).
- Operator-only surfaces (`src/components/AdminPanel.tsx`, `AdminChartList.tsx`, `AdminChartViewer.tsx`, signup-alert/feedback functions) are exempt from the literal-string lint.
- Stage files by path (other sessions share the repo). GitHub work goes through the `bazhip` account.

## Review Focus

1. **English wording edited after translation:** the translation is reported stale and re-translated, never silently kept → Task 3 test `flags stale translation when English changes`.
2. **Claude drops or renames a `{{placeholder}}`:** the translation is rejected, retried once, then the script fails without writing that key → Task 5 test `rejects translation with mismatched placeholders`.
3. **Regional browser tags (`fr-CA`, `de-AT`, `es-419`) and unsupported ones (`pt-BR`, `ja`):** these map to the base language, or to `en` → Task 2 test `maps regional and unsupported browser languages`.
4. **A French browser while switching is off:** still English, even with a saved `language: 'fr'` → Task 2 test `forces English while switching is disabled`.
5. **Key deleted from English:** reported as `extra` in other languages, and removed by the translate script along with its meta entry → Task 3 test `reports keys missing from English as extra`, Task 5 test `removes extra keys`.

---

### Task 1: i18n runtime with typed keys

**Files:**
- Modify: `package.json` (add `i18next`, `react-i18next`)
- Create: `src/i18n/config.ts`, `src/i18n/index.ts`, `src/i18n/i18next.d.ts`
- Create: `src/locales/{en,fr,de,it,es}/common.json`
- Modify: `src/index.tsx` and `src/setupTests.ts` (both `import './i18n'` first)
- Test: `src/i18n/index.test.ts`

**Interfaces:**
- Produces:
  - `src/i18n/config.ts`: `export const APP_LANGUAGES = ['en','fr','de','it','es'] as const; export type AppLanguage = typeof APP_LANGUAGES[number]; export const NAMESPACES = ['common','report'] as const;` (later plans append namespaces) `export const LANGUAGE_SWITCHING_ENABLED = false; export function isAppLanguage(v: unknown): v is AppLanguage`
  - `src/i18n/index.ts`: default export the initialized `i18n` instance. Resources are loaded eagerly with `import.meta.glob('../locales/*/*.json', { eager: true })`, with `fallbackLng: 'en'`, `lng: 'en'`, `interpolation.escapeValue: false`, `returnNull: false`, and a `missingKeyHandler` that calls `console.error` when `import.meta.env.DEV` is true (`saveMissing: true`).
  - `i18next.d.ts`: a `CustomTypeOptions` declaration with `defaultNS: 'common'` and `resources` typed from the `en/*.json` imports, so `t('common:typo')` fails `tsc`.

- [ ] **Step 1: Install deps.** `npm install i18next react-i18next`, then confirm both appear in `dependencies`.
- [ ] **Step 2: Write the failing test** `src/i18n/index.test.ts`:

```ts
import i18n from './index';
test('renders English common strings', () => {
  expect(i18n.t('common:actions.save')).toBe('Save');
  expect(i18n.t('common:actions.cancel')).toBe('Cancel');
});
test('falls back to English, never a raw key', async () => {
  i18n.addResource('en', 'common', 'test.onlyInEnglish', 'English only');
  await i18n.changeLanguage('fr');
  expect(i18n.t('common:test.onlyInEnglish' as any)).toBe('English only');
  await i18n.changeLanguage('en');
});
test('French catalog loads', async () => {
  expect(i18n.getFixedT('fr')('common:actions.save')).toBe('Enregistrer');
});
```

- [ ] **Step 3: Run** `npx vitest run src/i18n/index.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** the files above. Seed `common.json` with `actions.save`, `actions.cancel`, `actions.close`, `actions.delete`, `actions.edit` in all five languages (fr: Enregistrer/Annuler/Fermer/Supprimer/Modifier; de: Speichern/Abbrechen/Schließen/Löschen/Bearbeiten; it: Salva/Annulla/Chiudi/Elimina/Modifica; es: Guardar/Cancelar/Cerrar/Eliminar/Editar). The fallback test adds its English-only key at runtime with `i18n.addResource('en','common','test.onlyInEnglish','English only')`, so no catalog fixture is needed.
- [ ] **Step 5: Run** `npx vitest run src/i18n && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 6: Run the full suite** `npx vitest run`. Expected: all existing tests pass (the app still renders English).
- [ ] **Step 7: Commit** `package.json package-lock.json src/i18n src/locales src/index.tsx src/setupTests.ts` with "i18n: add i18next runtime and typed common catalog".

### Task 2: Per-user language preference

**Files:**
- Modify: `src/utils/chartSettings.ts` (add `language: AppLanguage | null` to `ChartPrefs`, `DEFAULT_CHART_PREFS.language = null`, normalize with `isAppLanguage`)
- Create: `src/i18n/resolveLanguage.ts`, `src/i18n/useAppLanguage.ts`
- Modify: `src/App.tsx` (call `useAppLanguage(prefs.language)` where `useChartSettings` is used)
- Modify: `src/components/AccountModal.tsx` (a "Language" select rendered only when `LANGUAGE_SWITCHING_ENABLED`)
- Test: `src/i18n/resolveLanguage.test.ts`, extend `src/components/AccountModal.test.tsx`

**Interfaces:**
- Consumes: `APP_LANGUAGES`, `isAppLanguage`, `LANGUAGE_SWITCHING_ENABLED`, and the `i18n` default export (Task 1).
- Produces:
  - `resolveLanguage(saved: AppLanguage | null, browser: readonly string[], enabled: boolean): AppLanguage`. Order: `!enabled` → `'en'`; then `saved`; then the first browser tag whose base subtag (`tag.split('-')[0].toLowerCase()`) is an `AppLanguage`; otherwise `'en'`.
  - `useAppLanguage(saved: AppLanguage | null): AppLanguage`. Resolves with `navigator.languages` and calls `i18n.changeLanguage` and `document.documentElement.lang = lng` when the result changes. Logged-out pages pass `readJson('app.language', 1, null)` from localStorage (key `app.language`).

- [ ] **Step 1: Write the failing tests:**

```ts
test('forces English while switching is disabled', () => {
  expect(resolveLanguage('fr', ['fr-FR'], false)).toBe('en');
});
test('saved choice beats browser', () => {
  expect(resolveLanguage('de', ['fr-FR'], true)).toBe('de');
});
test('maps regional and unsupported browser languages', () => {
  expect(resolveLanguage(null, ['fr-CA'], true)).toBe('fr');
  expect(resolveLanguage(null, ['de-AT', 'en'], true)).toBe('de');
  expect(resolveLanguage(null, ['es-419'], true)).toBe('es');
  expect(resolveLanguage(null, ['pt-BR', 'ja'], true)).toBe('en');
  expect(resolveLanguage(null, [], true)).toBe('en');
});
test('normalizeChartPrefs drops an invalid language', () => {
  expect(normalizeChartPrefs({ language: 'xx' }).language).toBeNull();
  expect(normalizeChartPrefs({ language: 'it' }).language).toBe('it');
});
```

Add an AccountModal test: with `LANGUAGE_SWITCHING_ENABLED` false (the default), no `combobox` named /language/i is rendered. Use `vi.mock('../i18n/config', …)` set to true to assert it renders the five options labeled in their own language (`English`, `Français`, `Deutsch`, `Italiano`, `Español`), and that choosing one calls `update({ language })`.
- [ ] **Step 2: Run** `npx vitest run src/i18n src/components/AccountModal.test.tsx src/utils`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above. The language labels are endonyms and are *not* translated, so keep them as a constant `LANGUAGE_NAMES: Record<AppLanguage,string>` in `config.ts`.
- [ ] **Step 4: Run** the same command plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** "i18n: per-user language preference (switching off)".

### Task 3: Meta file and completeness checker (build gate)

**Files:**
- Create: `scripts/i18n/catalog.ts`, `scripts/i18n/check.ts`, `src/locales/.meta.json`
- Create: `src/i18n/completeness.test.ts`
- Modify: `package.json` scripts: `"i18n:check": "tsx scripts/i18n/check.ts"`; `"build": "npm run i18n:check && tsc --noEmit && vite build"`
- Test: `scripts/i18n/check.test.ts` (add `'scripts/**/*.test.ts'` to vitest `include` if not already picked up; `tsconfig` `include` gains `"scripts"`)

**Interfaces:**
- Produces (`scripts/i18n/catalog.ts`):
  - `type Catalogs = Record<string /*lng*/, Record<string /*ns*/, Record<string, string> /*flat dotted keys*/>>`
  - `type MetaEntry = { hash: string; status: 'machine' | 'reviewed' }`; `type Meta = Record<string /*lng*/, Record<string /*"ns:key"*/, MetaEntry>>`
  - `loadCatalogs(dir = 'src/locales'): Catalogs` (flattens nested JSON); `writeCatalogs(dir, catalogs)` (re-nests, writes with 2-space indent, sorted keys, trailing newline); `loadMeta(dir)`, `writeMeta(dir, meta)`
  - `hashEnglish(text: string): string`: sha256 hex, first 12 chars
  - `placeholders(text: string): string[]`: sorted unique `{{name}}` names, plus i18next plural suffix awareness (keys ending `_one`/`_other` compared as the same base)
  - `languagesFor(ns: string): string[]`: `report` → app languages + `pt`; everything else → app languages
- Produces (`scripts/i18n/check.ts`): `type Problem = { lng: string; key: string /*"ns:key"*/; kind: 'missing'|'stale'|'extra'|'empty'|'placeholders' }`; `checkCatalogs(c: Catalogs, m: Meta): Problem[]`. The CLI prints the problems grouped by kind, ending with "run `npm run i18n:translate`", and exits 1 if there are any.
- Plural forms: a language may need plural keys that English lacks (e.g. `_many` in fr/it/es). Those are not `extra` when their base exists in `en`.

- [ ] **Step 1: Write the failing tests** in `scripts/i18n/check.test.ts`, using in-memory catalogs:

```ts
const en = { common: { a: 'Hello {{pet}}' } };
const fresh = { hash: hashEnglish('Hello {{pet}}'), status: 'machine' as const };
test('clean catalogs have no problems', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{pet}}' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toEqual([]);
});
test('flags missing translation', () => {
  expect(checkCatalogs({ en, fr: { common: {} } }, {})).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'missing' });
});
test('flags stale translation when English changes', () => {
  const c = { en: { common: { a: 'Hi {{pet}}' } }, fr: { common: { a: 'Bonjour {{pet}}' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'stale' });
});
test('flags placeholder mismatch and empty', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{animal}}' } }, de: { common: { a: ' ' } } };
  const p = checkCatalogs(c, { fr: { 'common:a': fresh }, de: { 'common:a': fresh } });
  expect(p).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'placeholders' });
  expect(p).toContainEqual({ lng: 'de', key: 'common:a', kind: 'empty' });
});
test('reports keys missing from English as extra', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{pet}}', gone: 'x' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toContainEqual({ lng: 'fr', key: 'common:gone', kind: 'extra' });
});
test('extra plural forms of an English key are allowed', () => {
  const c = { en: { common: { n_one: '{{count}} tooth', n_other: '{{count}} teeth' } },
    fr: { common: { n_one: '{{count}} dent', n_many: '{{count}} dents', n_other: '{{count}} dents' } } };
  /* meta for all three fr keys hashed from their English base (_other for _many) */
  expect(checkCatalogs(c, metaFor(c)).filter(p => p.kind === 'extra')).toEqual([]);
});
```

`src/i18n/completeness.test.ts`: `expect(checkCatalogs(loadCatalogs(), loadMeta('src/locales'))).toEqual([])` runs the real catalogs inside the normal suite.
- [ ] **Step 2: Run** `npx vitest run scripts/i18n`. Expected: FAIL.
- [ ] **Step 3: Implement.** Seed `.meta.json` for Task 1's `common` keys (status `machine`, hashes from `hashEnglish`). A one-off `tsx` snippet is fine, or write Task 5's `--rehash` early.
- [ ] **Step 4: Run** `npx vitest run && npm run i18n:check && npm run build`. Expected: all PASS; `i18n:check` prints "0 problems".
- [ ] **Step 5: Prove the gate.** Temporarily delete `fr` `actions.save`, run `npm run build`, and expect exit code 1 with `fr common:actions.save missing`. Then restore it.
- [ ] **Step 6: Commit** "i18n: completeness checker gates build and test suite".

### Task 4: Clinical glossary

**Files:**
- Create: `src/locales/glossary.json`, `scripts/i18n/glossary.test.ts`

**Interfaces:**
- Produces: `glossary.json` shape `{ "terms": [{ "id": string, "en": string, "fr": string, "de": string, "it": string, "es": string, "note"?: string }] }`. Task 5 sends it with every request, and plan 4 derives voice keyterms from it.

- [ ] **Step 1: Write the failing test.** Every term has non-empty `en/fr/de/it/es`; `id`s are unique; at least 60 terms; the terms include the ids `mobility, recession, pocket, furcation, hyperplasia, calculus, gingivitis, periodontal_disease, extraction, incisor, canine_tooth, premolar, molar, deciduous, maxillary, mandibular, triadan, nerve_block, anesthesia, radiograph`.
- [ ] **Step 2: Run** `npx vitest run scripts/i18n/glossary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the glossary.** For fr/de/es, take the existing terms in `src/utils/ownerReportI18n.ts` (`fieldPlain`, tooth kinds, exam areas) as canonical. Add Italian, plus terms from `src/constants/voiceKeyterms.ts` and the AVDC procedure/diagnosis names used in `src/constants`. Use the `note` field for terms where the clinical term differs from the lay one (e.g. calculus: "tartre" for lay text, "calcul dentaire" for clinical text).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** "i18n: vet-dental glossary for fr/de/it/es".

### Task 5: Translate script (Claude)

**Files:**
- Create: `scripts/i18n/translate.ts`, `scripts/i18n/work.ts`, `scripts/i18n/claudeTranslator.ts`
- Modify: `package.json` scripts: `"i18n:translate": "tsx scripts/i18n/translate.ts"`
- Test: `scripts/i18n/work.test.ts`, `scripts/i18n/translate.test.ts`

**Interfaces:**
- Consumes: `loadCatalogs`, `writeCatalogs`, `loadMeta`, `writeMeta`, `hashEnglish`, `placeholders`, `languagesFor`, `checkCatalogs` (Task 3); `glossary.json` (Task 4).
- Produces:
  - `type WorkItem = { lng: string; key: string /*"ns:key"*/; english: string; previous?: string /*old translation if stale*/ }`
  - `findWork(c: Catalogs, m: Meta): { todo: WorkItem[]; remove: { lng: string; key: string }[] }` (missing + stale + empty + placeholder-mismatch → todo; extra → remove)
  - `type Translator = (lng: string, items: WorkItem[], glossary: GlossaryTerm[]) => Promise<Record<string /*key*/, string>>`
  - `applyTranslations(c, m, lng, results, items): { c: Catalogs; m: Meta; rejected: string[] }` (writes a result only if `placeholders(result)` equals `placeholders(english)`; sets meta `{hash: hashEnglish(english), status: 'machine'}`)
  - `runTranslate(dir: string, translator: Translator): Promise<{ translated: number; removed: number; failed: string[] }>`: batches of ≤ 40 items per language, retries rejected keys once in a second batch, writes files, and does nothing (no file writes) when there's no work.
  - CLI flags: `--check` (exit 1 if there's work, without calling the API); `--rehash` (stamp current English hashes onto existing translations without translating, for hand-written translations and for Claude sessions that wrote translations directly; it refuses keys with placeholder mismatch).
  - `claudeTranslator: Translator`, built with `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY`. It exits with a clear message if the key is unset. **Before writing it, load the `claude-api` skill** for current model IDs and structured-output usage. Use model `claude-sonnet-5-5` and JSON output keyed by item key. The system prompt says: translating UI for veterinary dental charting software used by vets and vet techs; use the glossary terms exactly; keep `{{placeholders}}`, HTML tags and codes (Triadan numbers, AVDC abbreviations) untouched; match the English register (short UI labels stay short); use formal address (vous / Sie / Lei / usted); produce i18next plural keys when the English key has `_one`/`_other`.

- [ ] **Step 1: Write failing tests**, using a fake `Translator` and a temp dir copy of small catalogs:

```ts
test('no work means no API call and no writes', async () => { /* translator spy not called; file mtimes unchanged */ });
test('translates missing and stale keys only', async () => { /* en has a,b; fr has a (fresh) and b (stale) → translator receives only b with previous */ });
test('rejects translation with mismatched placeholders', async () => {
  // fake returns 'Bonjour {{animal}}' on both attempts
  const r = await runTranslate(dir, fake);
  expect(r.failed).toEqual(['fr common:a']);
  expect(loadCatalogs(dir).fr.common.a).toBeUndefined();
});
test('retries once and accepts a corrected answer', async () => { /* first call wrong placeholder, second right → written, failed [] */ });
test('removes extra keys', async () => { /* fr has key not in en → removed from catalog and meta */ });
test('after a run the checker is clean', async () => { expect(checkCatalogs(loadCatalogs(dir), loadMeta(dir))).toEqual([]); });
test('--rehash stamps hashes without translating', async () => { /* … */ });
```

- [ ] **Step 2: Run** `npx vitest run scripts/i18n`. Expected: FAIL.
- [ ] **Step 3: Implement** `work.ts` (pure), `translate.ts` (I/O + CLI), and `claudeTranslator.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Live smoke test** (needs `ANTHROPIC_API_KEY`). Add `common.actions.duplicate: "Duplicate"` to `en`, run `npm run i18n:translate`, and expect four languages filled, `.meta.json` updated, and `npm run i18n:check` clean. Keep the key.
- [ ] **Step 6: Commit** "i18n: Claude translate script with placeholder validation".

### Task 6: Move the owner report onto catalogs, and add Italian

**Files:**
- Create: `src/locales/{en,fr,de,it,es,pt}/report.json`
- Modify: `src/utils/ownerReportI18n.ts`. `ReportStrings` and the exported API stay the same, but strings now come from `i18n.getFixedT(locale, 'report')`. Only the grammar composition (`toothName` word order and agreement per language) stays as TypeScript functions, reading their word lists (`sides`, `ordinals`, `kinds`, the deciduous marker) from the catalog.
- Modify: `REPORT_LOCALES` → `['en','es','fr','de','it','pt']`; `LOCALE_LABELS.it = 'Italiano (Italian)'`
- Test: extend `src/utils/ownerReport.test.ts`

**Interfaces:**
- Consumes: the `i18n` instance (Task 1), `languagesFor('report')` including `pt` (Task 3).
- Produces: unchanged exports `REPORT_LOCALES`, `ReportLocale`, `LOCALE_LABELS`, `isReportLocale`, `reportStrings`, `formatReportDate`. Interpolated strings use `{{pet}}`, `{{value}}`, `{{list}}`, `{{doctor}}`, `{{practice}}`. Pet-dependent headings get two keys each (`headings.diagram_named` / `headings.diagram_unnamed`) so each language words both cases naturally; this reproduces the current English and German behavior exactly.

- [ ] **Step 1: Write failing tests:**

```ts
test('Italian tooth names and report strings', () => {
  expect(toothLayName(309, true, 'it')).toBe('Primo molare inferiore sinistro (309)');
  expect(toothLayName(104, false, 'it')).toBe('Canino superiore destro');
  expect(toothLayName(504, false, 'it')).toBe('Canino superiore destro deciduo');
  expect(reportStrings('it').defaultTitle).toBe('Referto della visita odontoiatrica');
});
test('every report locale renders a PDF', async () => {
  for (const lng of REPORT_LOCALES) { /* buildOwnerReportPdfBytes(... language: lng) byteLength > 1000 */ }
});
test('report strings are WinAnsi-safe except the legend ✕', () => {
  for (const lng of REPORT_LOCALES) { /* walk all report.json strings: pdfSafe(s) === s || s.includes('✕') */ }
});
```

The existing English, French, German, Spanish and Portuguese assertions in `ownerReport.test.ts` must keep passing unchanged.
- [ ] **Step 2: Run** `npx vitest run src/utils/ownerReport`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Move every string from the EN/ES/FR/DE/PT tables into `report.json` verbatim, and write the Italian with the glossary. Italian tooth nouns are masculine (`incisivo`, `canino`, `premolare`, `molare`), the ordinals are `primo/secondo/terzo/quarto`, the sides are `superiore destro / superiore sinistro / inferiore sinistro / inferiore destro`, and the deciduous marker is `deciduo`. Stamp hashes with `npm run i18n:translate -- --rehash`, because these are existing human-written translations and not machine output. Keep status `machine` (no one has reviewed them yet).
- [ ] **Step 4: Run** `npx vitest run && npm run build`. Expected: PASS, with all English report tests byte-identical.
- [ ] **Step 5: Commit** "i18n: owner report strings move to catalogs; add Italian".

### Task 7: Literal-string lint (opt-in per file)

**Files:**
- Modify: `package.json` (devDeps `eslint`, `typescript-eslint`, `eslint-plugin-i18next`; script `"lint": "eslint"`; build becomes `npm run i18n:check && npm run lint && tsc --noEmit && vite build`)
- Create: `eslint.config.js`, `src/i18n/extracted.json` (an array of glob paths whose text is fully extracted; plan 2 grows it)
- Test: `scripts/i18n/lint.test.ts`

**Interfaces:**
- Produces: `eslint.config.js` applies `i18next/no-literal-string` (`mode: 'jsx-only'`, plus JSX attributes `title`, `placeholder`, `aria-label`, `alt`, `label`) only to files matched by `src/i18n/extracted.json`. It ignores `*.test.tsx` and the operator-only files in Global Constraints. Allowed literals are strings without letters, `className`, `data-testid`, `key`, `id`, `type`, `role`, and `href`. No other lint rules are enabled; this project has never had a linter and this plan doesn't add style rules. `extracted.json` starts as `["src/components/AccountModal.tsx"]`, and the Task 2 language picker is the first extracted UI there; convert AccountModal fully in this task (it's about 330 lines) so the list starts with a real file.

- [ ] **Step 1: Write the failing test.** Use the ESLint Node API (`new ESLint({ overrideConfigFile: 'eslint.config.js' }).lintText(src, { filePath })`). `<p>Hello</p>` in a file under `extracted.json` reports `i18next/no-literal-string`. The same text at a non-listed path reports nothing. `<div className="x" data-testid="y">{t('common:actions.save')}</div>` in a listed file reports nothing.
- [ ] **Step 2: Run** `npx vitest run scripts/i18n/lint.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the config, then extract `AccountModal.tsx`** into a new `account` namespace (append it to `NAMESPACES`). Run `npm run i18n:translate` to fill the other languages. If no API key is available, write the translations directly and run `--rehash`.
- [ ] **Step 4: Run** `npx vitest run && npm run build`. Expected: PASS, and `AccountModal.test.tsx` still passes (the English text is unchanged).
- [ ] **Step 5: Commit** "i18n: literal-string lint for extracted files; extract AccountModal".

### Task 8: Automation — CLAUDE.md rule and PR workflow

**Files:**
- Create or modify: `CLAUDE.md` (project root; none exists today)
- Create: `.github/workflows/i18n.yml`
- Modify: `supabase/templates/README.md` is not touched (plan 3).

**Interfaces:**
- Consumes: `npm run i18n:translate`, `i18n:check`, `lint` (Tasks 3, 5, 7).

- [ ] **Step 1: Write `CLAUDE.md` section "Translations":**
  - All user-facing text goes through `t()`. Add keys to `src/locales/en/<ns>.json` only.
  - Then run `npm run i18n:translate` (needs `ANTHROPIC_API_KEY`). If it's unavailable, write the fr/de/it/es translations yourself using `src/locales/glossary.json`, then `npm run i18n:translate -- --rehash`.
  - Changing English wording makes its translations stale. Re-run the script.
  - When a screen is fully extracted, add it to `src/i18n/extracted.json`.
  - `npm run build` fails on missing or stale translations. Never bypass it by deleting keys from other languages.
- [ ] **Step 2: Write `.github/workflows/i18n.yml`:**
  - Trigger: `pull_request` (types `opened`, `synchronize`, `reopened`).
  - Skip when `github.event.pull_request.head.repo.fork`, or when the head commit author is `github-actions[bot]` (prevents loops).
  - Steps: checkout the PR head ref with `persist-credentials: true`; setup-node 22 with npm cache; `npm ci`; `npm run i18n:translate` with env `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`; if `git status --porcelain src/locales` is non-empty, commit as `github-actions[bot]` with "i18n: translate new strings" and push to the head ref; then `npm run i18n:check`, `npm run lint`, `npx vitest run`.
  - `permissions: contents: write`.
- [ ] **Step 3: Validate the YAML.** `npx --yes @action-validator/cli .github/workflows/i18n.yml` should exit 0.
- [ ] **Step 4: Commit** "i18n: CLAUDE.md translation rule and PR auto-translate workflow".
- [ ] **Step 5: Owner action (report, don't do).** Tell the user to add the repo secret `ANTHROPIC_API_KEY` under Settings → Secrets → Actions on the `bazhip` repo. Verify on the first PR that the workflow ran and either committed nothing (already translated) or committed translations.

---

## Self-review notes

- Spec coverage for this plan: runtime, typed keys, fallback, preference, endonym picker hidden by flag, meta with status, glossary, translate script, build gate, lint, CLAUDE.md, GitHub Action, owner report migration with pt kept and Italian added. Deferred to plans 2–4 by design: screen extraction and enabling switching (2); PDFs, emails, auth templates, practice language, seeded defaults, legal notice (3); voice (4).
- Names used across tasks: `AppLanguage`, `isAppLanguage`, `LANGUAGE_SWITCHING_ENABLED`, `loadCatalogs`, `loadMeta`, `hashEnglish`, `placeholders`, `languagesFor`, `checkCatalogs`, `findWork`, `runTranslate`, `Translator`, `extracted.json`.
