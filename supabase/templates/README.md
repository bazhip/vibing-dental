# Auth email templates

Supabase Auth sends three emails itself; these are their branded bodies.
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
the whole `.html` file into Message body and the matching block from
`subjects.md` into Subject heading. Nothing is deployed automatically.

For them to come from ToothOps (not Supabase), set custom SMTP in
Dashboard → Authentication → Emails → SMTP Settings:

- Sender email: `noreply@toothops.app` · Sender name: `ToothOps`
- Host: `smtp.resend.com` · Port: `465` · Username: `resend`
- Password: the Resend API key (same one in Vault as `resend_api_key`)

Custom SMTP also lifts Supabase's built-in limit of a few auth emails
per hour. Raise "Rate limit for sending emails" under Authentication →
Rate Limits once SMTP is on.
