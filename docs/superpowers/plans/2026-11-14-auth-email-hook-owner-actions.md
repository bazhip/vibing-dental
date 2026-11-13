# Owner actions: localized auth emails via the Send Email Hook

The `send-auth-email` edge function sends Supabase Auth's emails (sign-up
confirmation, password reset, email change, invite, magic link,
reauthentication code, security notices) in the user's language through
Resend. Nothing is live until these steps are done. **Do them in this order**:
enabling the hook before the function and its secret exist makes every auth
email fail.

1. **Create the hook secret and store it.** In Dashboard → Authentication →
   Hooks → Send Email Hook, choose HTTPS and generate a secret (it looks like
   `v1,whsec_…`). Don't enable the hook yet. Then:

   ```
   npx supabase secrets set SEND_EMAIL_HOOK_SECRET='v1,whsec_…' --project-ref <ref>
   ```

   The function also needs the Resend key: `RESEND_API_KEY`, or the Vault
   `resend_api_key` that team-api already uses (nothing to do if team invites
   send today).

2. **Deploy the function** (JWT verification off: Supabase Auth signs the
   request with the hook secret instead of sending a JWT):

   ```
   npx supabase functions deploy send-auth-email --no-verify-jwt --remote=<ref> --yes
   ```

3. **Enable the hook** in Dashboard → Authentication → Hooks → Send Email
   Hook, with the URL `https://<ref>.supabase.co/functions/v1/send-auth-email`
   and the secret from step 1. From now on Supabase stops sending auth email
   over SMTP.

4. **Test.** On a test account, request a password reset with the account
   language set to French, then to English. Check the subject and body
   language, and that the link resets the password. Optionally also test
   sign-up confirmation and an email change.

   If emails fail or look wrong, **disable the hook**: Supabase reverts to
   SMTP and the dashboard templates instantly. Keep those templates pasted
   (see `supabase/templates/README.md`) so this fallback is ready. Function
   logs (Dashboard → Edge Functions → send-auth-email → Logs) say which
   action type failed; they never contain tokens or links.

After any later change to `src/locales/<lng>/authEmail.json`: run
`npm run i18n:emails`, commit, and redeploy `send-auth-email` (step 2).
