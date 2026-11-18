# Hungarian and Romanian implementation plan

**Goal:** Add complete hu/ro support alongside the existing app languages.

**Architecture:** Extend existing catalogs and registries; preserve existing language and client-language resolution. Add Unicode PDF fonts and provider-supported speech configuration for the new locales.

**Tech stack:** React, TypeScript, i18next, pdf-lib, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-hungarian-romanian-design.md`

## Constraints

- Translate all 25 catalogs, keep placeholders, formal address, and clinical codes intact.
- Preserve English voice snapshots and existing locale behavior.
- No UI redesign, deployment, or commit requested.

## Tasks

- [x] Translate Hungarian catalogs; verify source keys and placeholders.
- [x] Translate Romanian catalogs with `_few` plurals; verify source keys and placeholders.
- [x] Add hu/ro voice numbers, terms, few-shot examples, configurations and fixtures; test native normalization and offline replay.
- [x] Add failing language recognition, persistence, picker, report, and Unicode PDF tests. Extend language registries, translated language labels, glossary, email locales, extension packaging and database validation.
- [x] Embed licensed fonts in new-language PDFs, preserve diacritics, and verify extracted PDF text.
- [x] Stamp translations, regenerate emails, run complete tests and build, inspect rendered desktop/phone screens, review the final diff.

## Review focus

Regional browser tags must resolve to hu/ro; saved preferences must survive normalization; Romanian counts 1/2/20 need appropriate plural forms; reports must follow practice language and preserve tooth-name grammar; PDFs must retain ő/ű/ș/ț in body text and form appearances. Check expanded language controls and long translated labels on phones. Disclose any live-provider or signed-in-state verification gaps.


## Validation record

- All 25 catalogs for each new language are translated; catalog, placeholder,
  plural-form, HTML, and metadata checks pass. Romanian pending-review plural
  semantics have a dedicated regression test.
- Focused tests cover regional language resolution, persisted settings,
  native switching, native tooth-name grammar, code definitions before the
  practice language has been loaded, Unicode glyph coverage and PDF text
  extraction in all three font families, and long report headers.
- Offline replay across all seven languages: zero cleanup mismatches and zero
  dropped finding lines. English voice snapshots pass.
- Final `npm test`: 282 files, 3,004 tests passed.
- Production and extension builds pass. Extension packaging contains hu/ro
  `_locales` assets. The production build reports a large-chunk warning;
  font data and the font encoder are lazy chunks used only by hu/ro PDFs.

## Rendered coverage (targeted language integration review)

| Screen/state | Languages | Viewports | Result |
| --- | --- | --- | --- |
| Landing, selected language | hu, ro | 1440, 390, 320 | Readable wrapping; no horizontal overflow; native selector |
| Sign-in, configured email/password/Google auth | hu, ro | 1440, 390, 320 | Labels and actions fit; language choice persists |
| Account, long accented clinician name, language control | hu, ro | 1440, 390, 320 | Focus ring visible; inputs scroll naturally; phone controls 44px |
| Owner-report template, selected native language | hu, ro | 1440, 390, 320 | Labels wrap; content scrolls above fixed footer |
| Template actions expanded | hu, ro | 390, 320 | Actions accessible in disclosure; no overflow |
| Owner-report PDF, sample clinical findings and accented names | hu, ro | 900px rendered PDF | Diacritics retained; long Romanian practice header stacks without overlap |

Screenshots are in `/tmp/languages-<hu|ro>-<state>-<width>.png` and
`/tmp/languages-<hu|ro>-owner-pdf.png`. Account/template screens use real
components with local sample props; authentication was viewed without signing
in or submitting credentials.

This is not a full UI review. Untested visual states include the complete
charting workflow, populated/empty patient libraries, single/multiple visits,
every settings subsection, all clinical PDF styles, and native iOS. Existing
automated coverage remains in place. Live speech recognition, Claude extraction
parity and email delivery were not exercised; the SQL migration was applied
and verified in the follow-up described below.

## Deployment

`supabase/migrations/20261202_hungarian_romanian.sql` was applied and recorded
as version `20261202` on ToothOps production (`ocjnngfzwyajhgqzicsf`). The
migration patches only three language fallback fragments in the installed
reminder function, preserving independent delivery and patient-matching changes.
Post-apply checks confirmed the hu/ro constraint, unchanged SECURITY DEFINER
and role permissions, and the exact expected function definition. Redeploy
email functions consuming `_shared/emailStrings.ts` (including send-auth-email)
so generated Hungarian/Romanian email content reaches production. The user authorized a PR and the database migration; email functions have not
been redeployed.
