# Auth email templates

Supabase Auth sends three emails itself; these are their branded bodies.
(Team invites and reminders are sent by our edge functions via Resend.)

| Supabase template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your ToothOps account | `confirm-signup.html` |
| Reset password | Reset your ToothOps password | `reset-password.html` |
| Change email address | Confirm your new email for ToothOps | `change-email.html` |

Paste each into Dashboard → Authentication → Emails → Templates.

For them to come from ToothOps (not Supabase), set custom SMTP in
Dashboard → Authentication → Emails → SMTP Settings:

- Sender email: `noreply@toothops.app` · Sender name: `ToothOps`
- Host: `smtp.resend.com` · Port: `465` · Username: `resend`
- Password: the Resend API key (same one in Vault as `resend_api_key`)

Custom SMTP also lifts Supabase's built-in limit of a few auth emails
per hour. Raise "Rate limit for sending emails" under Authentication →
Rate Limits once SMTP is on.
