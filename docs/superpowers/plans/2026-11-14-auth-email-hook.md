# Localized Supabase Auth Emails via Send Email Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Supabase Auth's own emails (sign-up confirmation, password reset, email change, invite, magic link, reauthentication, and the security notifications) are sent by our edge function, `send-auth-email`, in the user's language. That covers the **subject**, which the dashboard template field can't localize (its 255-character limit can't hold five languages), and the body. Both come from the catalogs, the same way the other emails do.

**Why:** owner decision on 2026-11-14 to use a Send Email Hook rather than pasting templates. Templates no longer need pasting by hand, and they stay current automatically: `npm run i18n:emails` regenerates the strings and `i18n:check` guards against stale ones.

**Architecture:**
- Supabase Auth → Send Email Hook (HTTP, signed with Standard Webhooks) → `supabase/functions/send-auth-email/index.ts`.
- The function verifies the signature, picks the language from `user.user_metadata.language` (falling back to English), renders the email with the existing `renderBrandedEmail(e, lng)` and generated strings, and sends it through Resend with the existing `sendBrandedEmail`. The Resend key comes from `RESEND_API_KEY` or the `get_resend_key` RPC, as in `team-api`.
- **Strings:** the `authEmail` namespace (already in `src/locales/<lng>/authEmail.json`, from plan 3 task 5) is extended for every action type and generated into `supabase/functions/_shared/emailStrings.ts` alongside the `email` namespace. It reuses `scripts/i18n/gen-email-strings.ts` and the existing `i18n:check` staleness guard.
- The generated dashboard templates (`supabase/templates/*.html`, `subjects.md`) stay as a fallback for when the hook is disabled. `subjects.md` notes that the dashboard subject field holds English only, because of the 255-character limit.

**Spec:** `docs/superpowers/specs/2026-11-13-localization-design.md` (Supabase Auth emails row).

## Global Constraints
- **English must match today.** English subjects and bodies equal today's dashboard templates for signup, recovery and email change. That means the plan-3 English template text and the English subjects in `subjects.md` / README.
- Languages: en, fr, de, it, es. Use formal address and the glossary terms. Translations are hand-written, and `npm run i18n:translate -- --rehash` stamps them.
- **Security:** reject any request whose Standard Webhooks signature fails, with 401 and no email sent. Never log tokens, token hashes or full links. Never include `user_metadata` in responses.
- Deno is installed: `cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno check send-auth-email/index.ts`. Never deploy, set secrets or edit the dashboard. Those are owner actions.
- No API keys exist here. Tests never call Resend.
- `npm test` and `npm run build` pass. Stage files by path. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: send-auth-email hook function

**Files:**
- Create: `supabase/functions/_shared/authEmails.ts`. A pure module with no Deno globals, so vitest can import it.
  - `authEmailLanguage(userMetadata: unknown): EmailLanguage` → the language from `user_metadata.language`, else `'en'`.
  - `verifyLink(siteUrl: string, supabaseUrl: string, tokenHash: string, type: string, redirectTo: string): string` builds `${supabaseUrl}/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<redirect_to>` using URLSearchParams.
  - `buildAuthEmails(payload: { user: {...}; email_data: {...} }, supabaseUrl: string): Array<{ to: string; subject: string; html: string; text: string }>`. It returns one email for most types and two for secure email change. The pairing follows the Supabase docs: the current address `user.email` gets `token` + `token_hash_new`, and the new address `user.new_email` gets `token_new` + `token_hash`. When there's only one pair (secure change off), send one email to the new address. Content per `email_action_type`:
    - `signup`, `recovery` and `email_change`: today's templates' content, with a button and a fallback link. The 6-digit `token` is not shown, since today's templates don't show it.
    - `invite` and `magiclink`: new copy, same layout.
    - `reauthentication`: shows the 6-digit `token` as the code. There's no link.
    - `email`: treat like `magiclink`.
    - `*_notification` types: a short localized security notice with no link. If one is unknown, use the generic notice "Your ToothOps account was updated".
- Create: `supabase/functions/send-auth-email/index.ts`. A thin Deno handler:
  1. Read the raw body and headers.
  2. Verify with `standardwebhooks` using `SEND_EMAIL_HOOK_SECRET`, stripping the `v1,whsec_` prefix. On failure return 401 `{ error: { http_code: 401, message } }`.
  3. Call `buildAuthEmails`.
  4. Send each email with `sendBrandedEmail` or a raw Resend call using the prebuilt html and text. Reuse `_shared/email.ts`, extending it if needed so it can send prebuilt content.
  5. On a send failure, return 500 with `{ error: { http_code: 500, message: 'send failed' } }`. That makes Supabase report the failure.
  6. On success, return 200 `{}`.
- Modify: `src/locales/{en,fr,de,it,es}/authEmail.json` to add keys for invite, magiclink, reauthentication, the notifications and the generic notice. Modify `scripts/i18n/gen-email-strings.ts` so `emailStrings.ts` also carries `authEmail`. Regenerate with `npm run i18n:emails`.
- Modify: `supabase/templates/README.md` and `subjects.md`. Document the hook as the primary path and the templates as a fallback. Note that the dashboard subject field holds English only, because of the 255-character limit.
- Modify: the `AGENTS.md` emails section, to add the hook.
- Create: `docs/superpowers/plans/2026-11-14-auth-email-hook-owner-actions.md`. These steps must happen in order:
  1. Run `supabase secrets set SEND_EMAIL_HOOK_SECRET=…` with the secret generated in Dashboard → Authentication → Hooks → Send Email Hook.
  2. Deploy: `npx supabase functions deploy send-auth-email --no-verify-jwt --remote=<ref> --yes`.
  3. Enable the hook in the dashboard, pointing at the function URL.
  4. Test with a password reset on a test account in fr and en. If emails fail, disabling the hook reverts to SMTP and templates instantly.
- Test: `scripts/i18n/authHook.test.ts` (node env)

**Tests:**
- **English parity:** for signup, recovery and email_change in `en`, subject equals today's English subject. The rendered body text contains today's template sentences, after normalizing whitespace and comparing against the plan-3 English template text in `scripts/i18n/fixtures/auth-templates/`. The link equals `verifyLink(...)`.
- **French:** in `fr`, the subjects are the French ones from `authEmail.json`, and `<html lang="fr">`.
- **Language fallback:** metadata language `'xx'` or missing gives English.
- **Secure email change:** with two pairs, there are 2 emails to the right addresses with the right token_hash in each link. With one pair, there's 1 email to the new address.
- **Reauthentication** shows the token code. **Notification types** give a localized notice.
- **Never-throws coverage:** every `email_action_type` from the docs list produces at least one email without throwing.
- **Signature:** the handler's verify step is factored as `verifyHook(rawBody, headers, secret)`. Test it with a payload signed by `standardwebhooks` (test-only dependency, or esm import mocked): a valid signature passes, a tampered body fails. If the library can't run under vitest, test it under `deno test` and document that in the report.
- `npm run i18n:check` passes, and fails when `authEmail.json` changes without regenerating.

**Commit** "auth emails: Send Email Hook sends localized auth emails".
