# Plan 3 (clinical PDF, emails, practice language, server errors): owner actions

Nobody in the implementation sessions ran migrations, deployed functions or
touched the Supabase dashboard. Do these steps yourself, **in this order**:

## 1. Database migration (first)

- [ ] Apply `supabase/migrations/20261122_practice_client_language.sql`
      (adds `practices.client_language`; the matching lines are already in
      `supabase/schema.sql`).

The app works without the column: `usePracticeLanguage` and `useProfile`
treat a failed `select('client_language')` as "not set" and use the app
language. Until the migration is applied, saving the practice's client
language in Practice settings fails with an error. No edge function reads
the column, so step 2 doesn't depend on it.

## 2. Edge functions (next)

- [ ] `supabase functions deploy team-api`
- [ ] `supabase functions deploy invite-reminders`
- [ ] `supabase functions deploy billing-api`
- [ ] `supabase functions deploy send-reminder`
- [ ] `supabase functions deploy ai-autofill`
- [ ] `supabase functions deploy deepgram-token`

They bundle `supabase/functions/_shared/{apiErrors,email,emailStrings,inviteEmails}.ts`.

Why a new app with old functions is safe (checked against the code):
- **`lang` sent by the client** (`add_member` / `resend_invite` in
  `src/hooks/useTeam.ts`): the deployed `team-api` reads named fields
  (`body.email`, `body.redirectTo`, …) and never looks at `body.lang`, so it
  ignores it and sends the English invite as before.
- **`code` read by the client** (`apiErrorFromBody` in
  `src/utils/apiErrors.ts`, called from `src/utils/edgeFunctions.ts`): the
  old functions return only `{ error }`. With no known `code` the client
  throws a plain `Error(error)`. `friendlyError` then shows that text bare in
  English, exactly as today, and inside the translated "Something went wrong
  (details: …)" in other languages.
- The reverse (new functions, old cached client) is also safe: the new
  functions still send the English `error` next to `code`, and a missing
  `lang` falls back to English (`chooseInviteLanguage` → `emailLanguage`).

## 3. Supabase Auth email templates (any time)

In Dashboard → Authentication → Emails → Templates, for each template:

- [ ] Confirm signup: paste `supabase/templates/confirm-signup.html` into
      **Message body** and the "Confirm signup" block from
      `supabase/templates/subjects.md` into **Subject heading**.
- [ ] Reset password: `supabase/templates/reset-password.html` plus its
      subject block.
- [ ] Change email address: `supabase/templates/change-email.html` plus its
      subject block.

These steps can go in any order. Users with no `language` metadata get
English, which is today's text. The app writes the metadata at signup and
whenever the account language changes. Repeat this step after every
`npm run i18n:emails` that changes these files (see
`supabase/templates/README.md`).
