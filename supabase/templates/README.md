# Auth email templates

**Primary path: the Send Email Hook.** With the hook enabled (Dashboard →
Authentication → Hooks → Send Email Hook → `send-auth-email`), Supabase Auth
stops sending email itself and calls our edge function
`supabase/functions/send-auth-email`, which sends every auth email (sign-up
confirmation, password reset, email change, invite, magic link,
reauthentication code, security notices) through Resend, with subject and
body in the user's language. Its text comes from the same
`src/locales/<lng>/authEmail.json`, generated into
`supabase/functions/_shared/emailStrings.ts` by `npm run i18n:emails`; there is
nothing to paste. Setup: `docs/superpowers/plans/2026-11-14-auth-email-hook-owner-actions.md`.

**Fallback: these dashboard templates.** If the hook is disabled, Supabase
goes back to sending its three main emails over SMTP with the templates
below. Keep them pasted so that switch is instant. The Subject heading field
holds English only (it is capped at 255 characters, too short for five
languages), so with the hook off the bodies are localized but the subjects
are English.
(Team invites and reminders are sent by our edge functions via Resend.)

**The templates are generated — do not edit the `.html` files or `subjects.md` by hand.**
The text lives in `src/locales/<lng>/authEmail.json` (en, fr, de, it, es); run
`npm run i18n:emails` after changing it. `npm run i18n:check` (and so the build)
fails when the generated files are stale.

Each file is one shared layout with a Go-template chain around every text run:
`{{ if eq $lang "fr" }}…{{ else }}English{{ end }}`. `$lang` comes from the
user's `language` metadata (`.Data.language`), which the app sets at signup and
whenever the account language changes. Users without it get English.

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | see `subjects.md` |
| Reset password | `reset-password.html` | see `subjects.md` |
| Change email address | `change-email.html` | see `subjects.md` |

To install (Owner action, after each change to the templates): in
Dashboard → Authentication → Emails → Templates, open each template and paste
the whole `.html` file into Message body and the matching English subject from
`subjects.md` into Subject heading. Nothing is deployed automatically.

For the fallback to come from ToothOps (not Supabase), set custom SMTP in
Dashboard → Authentication → Emails → SMTP Settings:

- Sender email: `noreply@toothops.app` · Sender name: `ToothOps`
- Host: `smtp.resend.com` · Port: `465` · Username: `resend`
- Password: the Resend API key (same one in Vault as `resend_api_key`)

Custom SMTP also lifts Supabase's built-in limit of a few auth emails
per hour. Raise "Rate limit for sending emails" under Authentication →
Rate Limits once SMTP is on.
