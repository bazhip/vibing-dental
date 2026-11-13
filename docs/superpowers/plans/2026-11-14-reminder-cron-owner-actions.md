# Reminder cron: owner actions (2026-11-14)

1. Pre-check. In the Supabase SQL Editor run:
   `select prosecdef, proconfig, pg_get_function_result(oid) from pg_proc where proname = 'send_due_reminders';`
   Compare with the migration header: `prosecdef` true (security definer), `proconfig` search_path, result `void`.
   - If `prosecdef` is false, delete the `security definer` line from the migration.
   - If `proconfig` shows a different search_path (e.g. `public, extensions`), copy it exactly into the `set search_path` line.
   Then run `select pg_get_functiondef('public.send_due_reminders'::regproc);` and diff its body against the migration before applying.
2. Paste the whole of `supabase/migrations/20261123_send_due_reminders_safety.sql` into the SQL Editor and run it.
3. Verify:
   - Re-run `select pg_get_functiondef('public.send_due_reminders'::regproc);` and confirm it contains `coalesce(r.patient_name,'')` and the `case p.client_language` practice-name fallback. The migration also revokes execute from public/anon/authenticated (pg_cron runs as the job owner and is unaffected).
   - Optional smoke test: for a practice with auto-send on and a chart due today (+ lead days), run `select public.send_due_reminders();` only if you want it to actually send; otherwise wait for the next scheduled run and check `reminder_sent_at` on that chart.
4. Practices with auto-send on and empty reminder text get their localized default stored the next time the owner opens Reminders settings or changes the client language.
