# Chinese and Arabic implementation plan

**Goal:** Complete zh/ar support across the existing language experience.
**Spec:** ../specs/2026-11-18-chinese-arabic-design.md
**Architecture:** Extend the existing i18next catalogs, voice tables, email builders, and language registries; implement document direction and preserve clinical coordinate systems; extend lazy PDF fonts and script-aware text handling.
**Tech stack:** React, TypeScript, i18next, pdf-lib/fontkit, bidi-js, Supabase, Vitest.

- [x] Translate all Chinese catalogs; verify keys, placeholders and HTML.
- [x] Translate all Arabic catalogs with zero/one/two/few/many/other; verify semantics and placeholders.
- [x] Add regression tests and update language detection, registries, glossary, saved preferences, emails, extension packaging and migration.
- [x] Implement tested native Chinese/Arabic dictation numbers, terms, examples and fixtures without English drift.
- [x] Add tested RTL layout switching and preserve clinical LTR regions.
- [x] Implement and visually verify Chinese/Arabic PDF fonts, wrapping, shaping and bidi mixed content.
- [x] Stamp catalogs, regenerate emails, run full tests/build/replay, inspect screenshot matrix, and review results.

Review focus: Arabic mixed identifiers/numbers and switching back to LTR; Chinese text without spaces; Arabic zero/dual/count agreement; negative clinical findings and proposed versus performed extractions; practice/client language independence from UI language; searchable and readable PDF output. Do not change existing English voice outputs.

## Targeted rendered review

| Screen/state | Locales | Viewports | Findings |
| --- | --- | --- | --- |
| Landing and sign-in, configured auth without submitting credentials | zh, ar | 1440, 390, 320 | Localized labels and actions; no horizontal overflow |
| Account, long mixed-script clinician name, language/appearance selectors | zh, ar | 1440, 390, 320 | Readable Arabic UI font, natural name direction, visible focus |
| Owner template, native language and ISO date example | zh, ar | 1440, 390, 320 | Directional forms; ISO date order preserved; scrolling above footer |
| Expanded template actions | zh, ar | 390, 320 | Actions accessible and fit narrow viewports |
| Clinical patient form, long Chinese/Arabic/Romanian/Polish name | zh, ar | 1440, 390, 320 | Arabic navigation on right; input content uses automatic direction |
| Clinical tooth grid and diagnosis diagram | zh, ar | 1440, 390, 320 | Clinical LTR orientation retained; Arabic labels legible; no document overflow |
| Extension chart cards with mixed-script names | zh, ar | 390, 320 | Logical alignment follows locale; no overflow |
| Owner/clinical PDF samples, mixed names and native prose | zh, ar | Native PDF rendering | Joined Arabic, real cross-script glyphs, unspaced Chinese wraps, codes/dates retain order |

The Arabic clinical review discovered that the old physically offscreen skip
link enlarged the RTL document and made screenshots blank. It now hides above
the viewport and remains available on keyboard focus. Offscreen extension
pictures likewise use a logical inline offset. Browser checks confirm document
width equals viewport width in the covered states after this fix.

Screenshots and diagnostic logs are under `/tmp/languages-<zh|ar>-*`,
`/tmp/zh-ar-*-visual*.log`, and `/private/tmp/{owner,clinical}-{zh,ar}-white.png`.
Local sample props/mock rows were used for account, templates and extension
cards; no customer data or email delivery was needed.

This is targeted integration coverage, not a full UI review. Visual gaps:
populated/empty patient libraries, single/multiple prior visits, every settings
subsection, native iOS, real PDF photo/diagram combinations, and all continuation
page combinations. Automated coverage remains for existing flows. Live STT,
Claude extraction parity, and email delivery are not verified.

## Review fixes and implementation choices

- Native-number regressions cover Chinese decimals/ordinals, adjacent score and
  tooth numbers, Arabic vowel marks and Indic numerals, and clinical negation.
- PDF tests cover glyph coverage, searchable mixed names, every embedded subset
  outline, Arabic joining/bidi, dates/codes, Chinese wrapping and oversized mixed
  tokens. Font fallback preserves 张伟 محمد Ștefan Łukasz in either new locale.
- Arabic email documents carry RTL direction; links and verification codes are
  isolated LTR. Existing English email and voice snapshots remain unchanged.
- Licensed static Noto fonts load lazily. Chinese exports need the full CJK font
  data (large first-use chunks); Arabic-only exports omit CJK unless the document
  actually contains Han text. PDF files embed only used glyph subsets.
- A new migration extends language validation and patches only three installed
  reminder-language fallback fragments. Existing delivery/matching logic and
  grants are preserved by constructing the update from pg_get_functiondef.


## Final verification and deployment record

- `npm test`: 288 files, 3,063 tests passed.
- `npm run build`: passed i18n validation (zero problems), lint, TypeScript and
  production bundling. Large lazy CJK-font chunk warnings remain expected.
- `npm run build:extension`: passed; Chinese `_locales/zh_CN` and Arabic
  `_locales/ar` packaging verified.
- Offline replay for all nine languages: zero cleanup mismatches and zero
  dropped finding lines. This does not exercise live STT or model extraction.
- Following the user's established PR/migration workflow, migration `20261203`
  (`chinese_arabic`) was applied and recorded on ToothOps production,
  `ocjnngfzwyajhgqzicsf`. Verification confirmed hu/ro/zh/ar in the constraint,
  the exact three intended language fallback replacements, SECURITY DEFINER
  retained, and no execute permission for anon/authenticated roles.
- Generated email functions still require redeployment; no live email was sent.
