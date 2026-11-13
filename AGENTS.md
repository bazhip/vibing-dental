# Project rules

Read by Codex directly and by Claude Code via `CLAUDE.md` (`@AGENTS.md`). Edit rules here only.

## Before every commit and merge

Run `npm test` and `npm run build`; both must pass. Vercel runs `npm run build` on every PR preview, so a failure there is a red check on the PR.

## Translations

Languages: en (source), fr, de, it, es. Owner reports also have pt. Language switching is on (`LANGUAGE_SWITCHING_ENABLED` in `src/i18n/config.ts`): signed in, the language is an account setting (Account dialog); signed out, the `LanguageSwitcher` on the landing and sign-in pages remembers it on the device.

- All user-facing text goes through `t()`. Add keys to `src/locales/en/<ns>.json` only.
- In the same change, write the fr/de/it/es translations yourself in `src/locales/<lng>/<ns>.json` (formal address: vous / Sie / Lei / usted; Italian capitalises the courtesy forms: Lei, Suo, Sua), following `src/locales/glossary.json` and keeping `{{placeholders}}` identical. Nothing else translates them — there is no CI translation step. Then stamp them:
  - New keys: `npm run i18n:translate -- --rehash` (stamps only translations that have no meta entry yet).
  - English wording changed: the old translations are stale and plain `--rehash` will NOT stamp them (it only lists them). Fix them by hand, then name each one: `npm run i18n:translate -- --rehash fr:common:actions.save de:common:actions.save it:common:actions.save es:common:actions.save`.
- `npm run i18n:translate -- --check` lists outstanding work (`todo=<n> remove=<m>`) without calling any API. Plain `npm run i18n:translate` can fill translations via Claude only if `ANTHROPIC_API_KEY` is set locally (optional; it also removes orphaned keys and never rewrites `en/*.json`).
- Plurals: use `_one`/`_other`; fr/it/es also require `_many`. `i18n:check` fails without it.
- `npm run build` runs `i18n:check` first, so missing, stale, empty or placeholder-mismatched translations fail the build and the Vercel deploy. Never bypass it by deleting keys from other languages.
- New files are linted automatically: every `src/**/*.{ts,tsx}` file is in scope unless `src/i18n/lint-scope.json` exempts it, and exempting one needs a reason there. Lint enforces `i18next/no-literal-string` (JSX text and text attributes) and forbids literal strings passed to `toast`, `friendlyError`, `alert`, `confirm`, `prompt`, and to `confirmDialog`/`promptDialog` options.
- The props lint skips as non-text (the `jsx-attributes` exclude list in `eslint.config.js`: `on*` handlers, `mode`, `kind`, `tool`, `rowClass`, `cloud`, `markMode`, `defaultTool`, `initialAuth`, plus `className`, `id`, `key`, `type`, `role`, `href`, `data-testid`) must never carry user-visible text. Don't add a text prop with one of those names.
- Every new screen needs a pseudo-locale test (`installPseudoLocale` + `findUntranslated` from `src/i18n/testing/pseudo.ts`) in a `*.i18n.test.tsx` that imports it. `npm test` fails if a file in `src/components/`, `src/EntryGrid.tsx` or `src/App.tsx` is imported by none (`scripts/i18n/pseudo-coverage.test.ts`).
- Lint does NOT catch other non-JSX strings (a const or ternary that is rendered later). Route those through `t()` anyway.
- New namespace: create `src/locales/<lng>/<ns>.json` for en/fr/de/it/es, append it to `NAMESPACES` in `src/i18n/config.ts`, and add it to `src/i18n/i18next.d.ts`.
