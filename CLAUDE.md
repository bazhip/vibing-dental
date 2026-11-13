# Project rules

## Translations

Languages: en (source), fr, de, it, es. Owner reports also have pt. Language switching is off (`LANGUAGE_SWITCHING_ENABLED` in `src/i18n/config.ts`) until every screen is extracted.

- All user-facing text goes through `t()`. Add keys to `src/locales/en/<ns>.json` only.
- In the same change, write the fr/de/it/es translations yourself in `src/locales/<lng>/<ns>.json` (formal address: vous / Sie / Lei / usted), following `src/locales/glossary.json` and keeping `{{placeholders}}` identical. Nothing else translates them — there is no CI translation step. Then stamp them:
  - New keys: `npm run i18n:translate -- --rehash` (stamps only translations that have no meta entry yet).
  - English wording changed: the old translations are stale and plain `--rehash` will NOT stamp them (it only lists them). Fix them by hand, then name each one: `npm run i18n:translate -- --rehash fr:common:actions.save de:common:actions.save it:common:actions.save es:common:actions.save`.
- `npm run i18n:translate -- --check` lists outstanding work (`todo=<n> remove=<m>`) without calling any API. Plain `npm run i18n:translate` can fill translations via Claude only if `ANTHROPIC_API_KEY` is set locally (optional; it also removes orphaned keys and never rewrites `en/*.json`).
- Plurals: use `_one`/`_other`; fr/it/es also require `_many`. `i18n:check` fails without it.
- `npm run build` runs `i18n:check` first, so missing, stale, empty or placeholder-mismatched translations fail the build and the Vercel deploy. Never bypass it by deleting keys from other languages.
- When a screen is fully extracted, add its file to `src/i18n/extracted.json`. On those files lint enforces `i18next/no-literal-string` (JSX text and text attributes) and forbids literal strings passed to `toast`, `friendlyError`, `alert`, `confirm`, `prompt`, and to `confirmDialog`/`promptDialog` options.
- Lint does NOT catch other non-JSX strings (a const or ternary that is rendered later). Route those through `t()` anyway.
- New namespace: create `src/locales/<lng>/<ns>.json` for en/fr/de/it/es, append it to `NAMESPACES` in `src/i18n/config.ts`, and add it to `src/i18n/i18next.d.ts`.
