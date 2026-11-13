# Project rules

## Translations

Languages: en (source), fr, de, it, es. Owner reports also have pt. Language switching is off (`LANGUAGE_SWITCHING_ENABLED` in `src/i18n/config.ts`) until every screen is extracted.

- All user-facing text goes through `t()`. Add keys to `src/locales/en/<ns>.json` only.
- Then run `npm run i18n:translate`. It fills missing and stale translations via Claude (and removes orphaned keys), and needs `ANTHROPIC_API_KEY` only when there are keys to translate. It never rewrites `en/*.json` or unchanged files. `--check` prints `todo=<n> remove=<m>` and exits 1 if any work exists, without calling the API.
- No API key? Write the fr/de/it/es translations yourself in `src/locales/<lng>/<ns>.json`, following `src/locales/glossary.json` and keeping `{{placeholders}}` identical. Then stamp them:
  - New keys: `npm run i18n:translate -- --rehash` (stamps only translations that have no meta entry yet).
  - English wording changed: the old translations are stale and plain `--rehash` will NOT stamp them (it only lists them). Fix them by hand, then name each one: `npm run i18n:translate -- --rehash fr:common:actions.save de:common:actions.save it:common:actions.save es:common:actions.save`.
- Changing English wording makes its translations stale. Re-run `npm run i18n:translate` (or hand-fix and `--rehash` the named keys as above).
- Plurals: use `_one`/`_other`; fr/it/es also require `_many`. `i18n:check` fails without it.
- `npm run build` runs `i18n:check` first, so missing, stale, empty or placeholder-mismatched translations fail the build and the Vercel deploy. Never bypass it by deleting keys from other languages.
- When a screen is fully extracted, add its file to `src/i18n/extracted.json`. On those files lint enforces `i18next/no-literal-string` (JSX text and text attributes) and forbids literal strings passed to `toast`, `friendlyError`, `alert`, `confirm`, `prompt`, and to `confirmDialog`/`promptDialog` options.
- Lint does NOT catch other non-JSX strings (a const or ternary that is rendered later). Route those through `t()` anyway.
- New namespace: create `src/locales/<lng>/<ns>.json` for en/fr/de/it/es, append it to `NAMESPACES` in `src/i18n/config.ts`, and add it to `src/i18n/i18next.d.ts`.
- CI (`.github/workflows/i18n.yml`) auto-translates missing strings on PRs and commits them back; the repo needs the `ANTHROPIC_API_KEY` Actions secret.
