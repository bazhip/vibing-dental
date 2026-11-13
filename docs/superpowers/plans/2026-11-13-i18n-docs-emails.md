# Clinical PDF, Emails, Practice Language, Server Errors — Implementation Plan (3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining English surfaces: the clinical chart PDF, emails the app sends (team invites, invite reminders, recheck reminders), the Supabase sign-up/reset/change-email templates, the practice's default reminder text and first owner-report template, raw server error messages, and the legal "English version governs" notice. Each one should appear in the right person's language.

**Architecture:** Builds on plans 1–2 (react-i18next catalogs in `src/locales`, `i18n:check` gate, lint-scope coverage, pseudo-locale tests, `AGENTS.md`). This plan adds:
- **Practice client-communication language:** a new `practices.client_language` column. It decides what pet owners receive: reminder default text and owner-report default template.
- **Generated email strings for edge functions:** a script turns `src/locales/<lng>/email.json` into `supabase/functions/_shared/emailStrings.ts`, which Deno can import. A test fails if the generated file is stale.
- **Generated Supabase auth templates:** the same approach produces one HTML file per template, branching on `{{ if eq .Data.language "fr" }}`.
- **Error codes:** edge functions return stable `code` values, and the client maps them to translated text.
- **Clinical PDF:** it takes a language. It uses the generating user's app language, so a French vet prints a French clinical record.

**Tech Stack:** React 19, TypeScript, Vitest, i18next, pdf-lib (standard Helvetica/WinAnsi), Supabase (Postgres migrations, Deno edge functions, Auth email templates), tsx scripts.

**Spec:** `docs/superpowers/specs/2026-11-13-localization-design.md` (Surfaces table: clinical PDF, emails, Supabase auth emails, practice-stored text, server errors, legal).
**Follow-ups carried in:** `docs/superpowers/plans/2026-11-13-i18n-foundation-followups.md`, `docs/superpowers/plans/2026-11-13-i18n-screens-followups.md`.

## Global Constraints

- App languages: `en`, `fr`, `de`, `it`, `es`. Owner-report and client-facing text also supports `pt` (`REPORT_LOCALES`).
- English output must stay **identical** to today: PDF text content, email subjects and bodies, auth templates for English users, error messages. Existing tests keep their English assertions.
- Translations are hand-written (no API key). Use formal address (vous / Sie / Lei with capital Suo/Sua / usted) and the glossary terms. Use `chart_record` for "chart" meaning the patient record and `dental_chart` for the tooth diagram. Keep placeholders identical. Use plurals with `_many` for fr/it/es. Stamp with `npm run i18n:translate -- --rehash` and name stale keys `lng:ns:key`.
- New namespaces go in `NAMESPACES`, `i18next.d.ts` and all language folders. `email` and `pdf` are app namespaces; `client` (owner-facing defaults) also has `pt`. Use `languagesFor`.
- **Saved data:** text the app writes into charts stays English, as plan 2 ruled (grid comments, custom anesthesia defaults). This plan only localizes how that data is *presented*. The one exception is owner-facing defaults, which are written in the practice's client language when a practice saves them (Task 2).
- **PDFs:** keep standard Helvetica (WinAnsi). fr/de/it/es/pt fit. Characters it can't encode go through the existing `pdfSafe` / `safeFont`.
- **Operator-only surfaces stay English:** `admin-api`, `signup-alert`, `send-feedback`, `stripe-webhook` logs, and the admin screens.
- **Database changes** are new files in `supabase/migrations/` plus the matching `supabase/schema.sql` lines. **Nobody runs migrations, deploys functions or edits the Supabase dashboard.** Those steps are listed for the owner in each task's report and in the PR.
- `npm test` and `npm run build` pass after every task. Stage files by path. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A French vet invites an English colleague.** The invite email must be in the *recipient's* language when known (an existing account's saved language), otherwise the inviter's → Task 4 test `invite uses recipient language when known, else inviter's`.
2. **Auto-reminders sent by the database cron with an empty template.** The cron must still send text in the practice's client language, so the default is persisted on save when auto-send is on → Task 2 test `enabling auto-send persists localized default`.
3. **The clinical PDF for an English user is byte-for-byte the same text as before** → Task 3 test comparing extracted text runs for a fixture chart at `en` against a stored snapshot taken before the change.
4. **Stale generated artifacts.** Someone edits `email.json` but doesn't regenerate the edge-function strings or auth templates → Tasks 4–5 tests fail when the generated file differs from what the script produces.
5. **Unknown server errors** still show something translated around the raw detail ("Couldn't save (details: …)"), never a bare English sentence as the whole message → Task 6 test.

---

### Task 1: Practice client-communication language

**Files:**
- Create: `supabase/migrations/20261122_practice_client_language.sql`. Adds `alter table public.practices add column if not exists client_language text check (client_language is null or client_language in ('en','fr','de','it','es','pt'));` Null means the owner's app language at the time defaults are used.
- Modify: `supabase/schema.sql` (the matching line, with a comment).
- Create: `src/hooks/usePracticeLanguage.ts`
- Modify: `src/components/PracticeSettingsModal.tsx`. Owners get a "Language for pet owners" select of `REPORT_LOCALES` labelled in their own language; members see it read-only.
- Modify: `src/utils/ownerReportConfig.ts`. `defaultConfig(language?: ReportLocale)` seeds its default template in that language. Callers pass the practice client language, falling back to `appReportLocale()`.
- Test: `src/hooks/usePracticeLanguage.test.ts`, extend `src/components/settings.i18n.test.tsx`, `src/utils/ownerReportConfig.test.ts`

**Interfaces (produced):**
- `usePracticeLanguage(practiceId: string | null): { language: ReportLocale; explicit: boolean; loaded: boolean; save(lng: ReportLocale | null): Promise<void> }`. `language` is `client_language` if set, else `appReportLocale()`.
- `clientLanguageOf(row: { client_language?: string | null } | null, fallback: ReportLocale): ReportLocale`. A pure function, also used by tasks 2 and 4.
- If the column is missing (migration not yet applied), the hook falls back silently, the same way `useChartSettings` handles a missing column.

- [ ] **Step 1: Write failing tests.**
  - `clientLanguageOf({client_language:'de'},'en')` → `'de'`; `null` → fallback; `'xx'` → fallback.
  - The settings modal renders the select for owners, read-only for members, and calls `save('fr')`.
  - `defaultConfig('es').templates[0].language === 'es'`, and its title is the Spanish default title.
  - `defaultConfig()` is unchanged from today (`en`).
- [ ] **Step 2: Run** `npx vitest run src/hooks/usePracticeLanguage.test.ts src/utils/ownerReportConfig.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Wire the owner-report path that seeds a missing config (search for `defaultConfig(` / `normalizeConfig(` callers) to pass the practice language.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** "i18n: practice language for pet-owner communication". **Owner action (report):** apply the migration.

### Task 2: Owner-facing defaults in the client language (`client` namespace)

**Files:**
- Create: `src/locales/{en,fr,de,it,es,pt}/client.json`. Holds `reminder.subject`, `reminder.body`, `reminder.fallback.pet|owner|practice` and `sample.*` (the owner-report sample data in `src/utils/ownerReportSample.ts`).
- Modify: `src/hooks/useReminderTemplate.ts`. `DEFAULT_REMINDER` becomes `defaultReminder(lng: ReportLocale): ReminderTemplate`, whose English must equal today's text exactly. `fillTemplate(text, vars, lng)` uses language fallbacks. When the DB fields are empty, the hook shows the practice-language default. `save()` persists the shown default text whenever `auto` is on and the subject or body would otherwise be saved empty, so the cron job `send_due_reminders()` (which only reads `practices.reminder_subject/body`) sends localized text.
- Modify: `src/components/RemindersModal.tsx`, `ReminderModal.tsx` (pass the practice language through), `src/utils/ownerReportSample.ts` (sample from catalog in the template's language).
- Modify: `scripts/i18n/catalog.ts`. `languagesFor('client')` includes `pt`.
- Test: `src/hooks/useReminderTemplate.test.ts` (new or extended), extend `library.i18n.test.tsx` and `reportui.i18n.test.tsx`. Remove the narrow allow-list entries those tests carried for the stored default text.

**Tests:**
- `defaultReminder('en')` deep-equals the old `DEFAULT_REMINDER`.
- `defaultReminder('fr').subject` contains `{{patient}}`.
- `fillTemplate` with empty vars in `de` uses German fallbacks.
- `enabling auto-send persists localized default`: practice language `it`, empty DB fields, `save({...shown, auto:true})` → the update payload has the Italian subject and body.
- Saving with auto off and untouched defaults keeps the DB fields empty, as today.
- The sample report in `pt` uses Portuguese sample text.

**Commit** "i18n: reminder default and owner-report sample in the practice's client language".

### Task 3: Clinical chart PDF (`pdf` namespace)

**Files:**
- Modify: `src/utils/pdfGenerator.ts`, `src/utils/pdf/sections.ts`, `draw.ts`, `layout.ts`, `styles.ts` (display names only), `parser.ts` (only user-visible text; parsing of English labels from previously exported PDFs must keep working, so add translated labels as extra accepted aliases and never remove English).
- Modify: `src/components/PdfPreviewModal.tsx` (pass `lng`).
- Remove the `pdfGenerator.ts` / `src/utils/pdf/**` entries from `src/i18n/lint-scope.json`.
- Test: `src/utils/pdf/i18n.test.ts`

**Interfaces:**
- `buildDentalChartPDFBytes(..., options: { …existing, lng?: AppLanguage })`, which defaults to `'en'`. `generateDentalChartPDF` passes `i18n.language`.
- Section headings, field labels, legends, column headers (`columnLabel(key, lng)`), code legend (`codeDefinition(code, lng)`), exam and anesthesia labels, nerve-block table and footer all come from `pdf` keys or the existing catalogs, read with `getFixedT(lng, ns)`.
- Saved free text and the English-generated grid comments print as stored.

**Tests:**
- **English snapshot:** before changing code, generate the PDF for a rich fixture chart (all sections, codes, nerve blocks, images off). Extract its text runs (draw-call capture, or pdf-lib content parsing like the existing PDF tests) into `src/utils/pdf/__snapshots__/en-text.json`. After the change, the `en` output must equal it.
- In `fr`, the headings and the "Mobility" column header appear as the French glossary terms, and the code legend uses the French definitions.
- `parser.ts` still parses a PDF produced before the change (existing parser tests) and also one produced in `de`.
- Every `pdf` catalog string is WinAnsi-safe (`pdfSafe(s) === s`) or explicitly listed.

**Commit** "i18n: clinical chart PDF in the user's language".

### Task 4: Transactional emails from edge functions (`email` namespace + generated strings)

**Files:**
- Create: `src/locales/{en,fr,de,it,es}/email.json`. Holds team invite, existing-account invite, invite reminder (normal and final) and shared footer/button strings, copied from today's English in `supabase/functions/team-api/index.ts` and `invite-reminders/index.ts`.
- Create: `scripts/i18n/gen-email-strings.ts`. It writes `supabase/functions/_shared/emailStrings.ts`, exporting `EMAIL_STRINGS: Record<'en'|'fr'|'de'|'it'|'es', {...}>` and `emailT(lng, key, vars)` with `{{var}}` interpolation. The file starts with a "generated — run npm run i18n:emails" header. Add an `i18n:emails` script, and make `i18n:check` also verify the file is current.
- Modify: `supabase/functions/_shared/email.ts`. `renderBrandedEmail(e, lng = 'en')` sets `<html lang>` and localizes footer and fallback-link text.
- Modify: `supabase/functions/team-api/index.ts`, `invite-reminders/index.ts`.
- Modify: the client callers of team-api's invite action (`src/hooks/useTeam.ts`), which send `lang: i18n.language`.
- Test: `scripts/i18n/emails.test.ts`. The test imports the generated TS, which has no Deno-only APIs.

**Rules:**
- **Invite language:** if the invitee already has an account with a saved language (`profiles.chart_prefs.language`), use it. Otherwise use the `lang` sent by the inviter. Otherwise use `en`.
- New invitees get `user_metadata.language = lang` on the invite (the `inviteUserByEmail` / `generateLink` options `data`). The invite-reminder cron reads `user_metadata.language`.
- `send-reminder` sends the practice-authored subject and body as written. Only its system text, if any, is localized.

**Tests:**
- Generated file is current: running the generator in memory equals the committed file.
- `emailT('en', …)` equals today's literal subjects and bodies for each email.
- `renderBrandedEmail(…, 'fr')` has `lang="fr"` and French footer text, and `'en'` output is byte-identical to before (snapshot taken first).
- `invite uses recipient language when known, else inviter's`: extract the choice into a pure `chooseInviteLanguage(existingPrefs, inviterLang)` and unit-test it.
- `i18n:check` fails when `email.json` changes without regenerating. Prove it with a temp edit, then revert.

**Commit** "i18n: transactional emails in the recipient's language". **Owner action (report):** deploy the `team-api` and `invite-reminders` functions.

### Task 5: Supabase auth email templates (generated, `authEmail` namespace)

**Files:**
- Create: `src/locales/{en,fr,de,it,es}/authEmail.json`. Covers confirm-signup, reset-password and change-email: subject, title, body, button, fallback-link line and ignore line. Copy today's English verbatim from `supabase/templates/*.html` and `README.md`.
- Create: `scripts/i18n/gen-auth-templates.ts`. It writes the three `supabase/templates/*.html` files. Each has one shared layout with `{{ if eq .Data.language "fr" }}…{{ else if … }}…{{ else }}<English>{{ end }}` around every text run, and keeps the Go placeholders (`{{ .Email }}`, `{{ .ConfirmationURL }}`). It also writes `supabase/templates/subjects.md`, listing the per-language subject lines to paste, since the Supabase subject field also accepts Go templates. Hook it into `i18n:emails` / `i18n:check` like Task 4.
- Modify: `src/components/Login.tsx`. `signUp` passes `options.data.language = i18n.language`.
- Modify: `src/components/AccountModal.tsx` / `src/i18n/useAppLanguage.ts`. When a signed-in user changes language, call `supabase.auth.updateUser({ data: { language } })`. Fire and forget, with errors ignored.
- Modify: `supabase/templates/README.md`. Explain that the templates are generated and how to paste them.
- Test: `scripts/i18n/authTemplates.test.ts`

**Tests:**
- Generated templates are current.
- The English branch of each template, rendered by substituting `.Data.language = ""` with a minimal Go-template evaluator in the test or by extracting the `else` branch, equals today's file text once whitespace is normalized.
- Every branch keeps every Go placeholder that the English uses.
- `signUp` is called with `options.data.language`.
- Changing language in AccountModal calls `updateUser`.

**Commit** "i18n: Supabase auth emails per language". **Owner action (report):** paste the three templates and subjects into Dashboard → Authentication → Emails.

### Task 6: Server error codes and raw-message fallback (`errors` keys in `common`)

**Files:**
- Modify: `supabase/functions/team-api/index.ts`, `billing-api/index.ts`, `send-reminder/index.ts`, `ai-autofill/index.ts`, `deepgram-token/index.ts`. Every user-facing `{ error: '…' }` gains a stable `code` (e.g. `already_member`, `invite_failed`, `daily_reminder_limit`, `message_too_long`, `chart_required`, `not_owner`, `seat_limit`). The English `error` text stays for older clients.
- Create: `src/utils/apiErrors.ts`. `apiErrorMessage(body: { error?: string; code?: string } | unknown, fallbackKey: string): string` maps `code` to `common:errors.api.<code>`. An unknown code with an `error` string returns `t('common:errors.withDetail', { detail })`, e.g. "Something went wrong (details: …)", and nothing at all falls back to `fallbackKey`.
- Modify: the client call sites that surface those bodies (`useTeam.ts`, `useBilling.ts`, `RemindersModal`/`ReminderModal` send path, voice token fetch, AI autofill), `friendlyError` in `src/components/ui/dialogs.tsx` (raw unmatched messages are wrapped with `errors.withDetail`, not shown bare), `friendlyAuthError` in `Login.tsx` (extend the mapping to the common Supabase auth codes: `weak_password`, `email_address_invalid`, `user_already_exists`, `over_email_send_rate_limit`, `same_password`, `email_not_confirmed`), and the raw Supabase passthroughs in `src/hooks/useAttachments.ts`.
- Test: `src/utils/apiErrors.test.ts`, plus updates to the area tests that hit these paths.

**Tests:**
- Each code maps to its key in `fr`.
- An unknown code in `de` gives the German wrapper containing the raw detail.
- English output for every code equals the current English `error` string exactly.
- `friendlyError(new Error('weird backend text'))` in `fr` returns the French wrapper.
- `friendlyError` keeps its existing English outputs.

**Commit** "i18n: server errors by code, translated wrapper for anything raw". **Owner action:** deploy the changed functions.

### Task 7: Legal notice and glossary completion

**Files:**
- Modify: `src/components/LegalNotice.tsx` and the auth/landing places that link to the Terms, Privacy and DPA. For non-English languages, add one translated sentence: "These documents are in English; the English version governs." (`auth:legal.englishGoverns`). English shows nothing new. Terms acceptance (`src/utils/terms.ts`, `TERMS_VERSION`) is unchanged.
- Modify: `src/locales/glossary.json`. Add `pt` to every term (the plan-1 follow-up), and make `scripts/i18n/glossary.test.ts` require it.
- Modify: `scripts/i18n/claudeTranslator.ts`. The glossary passed for `pt` uses the `pt` values.
- Test: extend `src/components/auth.i18n.test.tsx` (the notice is present in `fr`, absent in `en`) and `scripts/i18n/glossary.test.ts`.

**Commit** "i18n: English-governs legal notice; Portuguese glossary".

### Task 8: Plan-wide sweep and docs

- Re-run the whole-repo lint and pseudo-coverage. Every surface this plan touched must be covered.
- Update `AGENTS.md` with:
  - "emails: edit `src/locales/<lng>/email.json` or `authEmail.json`, then run `npm run i18n:emails`. `i18n:check` fails if generated files are stale."
  - "client-facing defaults use the practice client language (`usePracticeLanguage`)."
  - "edge-function errors return a `code` mapped by `apiErrorMessage`."
- Update the spec's Surfaces table status column.
- List every owner action (migration, function deploys, dashboard templates) in one checklist at `docs/superpowers/plans/2026-11-13-i18n-docs-emails-owner-actions.md`.
- **Commit** "i18n: plan 3 docs and owner-action checklist".

---

## Self-review notes
- Spec coverage: clinical PDF (T3), edge-function emails (T4), Supabase auth emails (T5), practice-stored text and seeded defaults (T1–T2), server errors (T6), legal (T7). Voice is plan 4.
- Names used across tasks: `clientLanguageOf`, `usePracticeLanguage`, `defaultReminder`, `emailT`, `chooseInviteLanguage`, `apiErrorMessage`, `i18n:emails`.
