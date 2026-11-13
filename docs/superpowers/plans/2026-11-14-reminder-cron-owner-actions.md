# Reminder cron: owner actions (2026-11-14)

1. Compare the live function with the migration header assumptions. In the Supabase SQL Editor run:
   `select pg_get_functiondef('public.send_due_reminders'::regproc);`
   If it is not `security definer` / `set search_path = public`, remove those lines from the migration first.
2. Paste the whole of `supabase/migrations/20261123_send_due_reminders_safety.sql` into the SQL Editor and run it.
3. Verify:
   - Re-run `select pg_get_functiondef('public.send_due_reminders'::regproc);` and confirm it contains `coalesce(r.patient_name,'')` and the `case p.client_language` practice-name fallback.
   - Optional smoke test: for a practice with auto-send on and a chart due today (+ lead days), run `select public.send_due_reminders();` only if you want it to actually send; otherwise wait for the next scheduled run and check `reminder_sent_at` on that chart.
4. Practices with auto-send on and empty reminder text get their localized default stored the next time the owner opens Reminders settings or changes the client language.
