-- send_due_reminders(): NULL-safe placeholders + practice-name fallback in the
-- practice's client language. Run by hand in the SQL Editor (owner action).
--
-- This function lived only in the database. BEFORE applying, compare with the
-- live definition:
--   select pg_get_functiondef('public.send_due_reminders'::regproc);
-- The header below assumes `security definer set search_path = public`; if the
-- live function was NOT security definer, drop those attributes here to match.
--
-- Changes vs. the exported 2026-11-13 body (everything else is identical):
--   * coalesce(patient_name / owner_name / recall_date, '') inside replace(), so
--     a NULL cannot null the whole subject/body.
--   * practice-name fallback per practices.client_language (en/fr/de/it/es/pt).
--   * English subject/body fallbacks stay only as a last resort; the app now
--     persists localized text when auto-send is on.

create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; k text; subj text; bod text;
begin
  k := public.get_resend_key();
  if k is null then return; end if;
  for r in
    select c.id, c.patient_name, c.owner_name, c.owner_email, c.recall_date,
           coalesce(nullif(p.reminder_subject,''), 'Time for {{patient}}''s dental recheck') as subject,
           coalesce(nullif(p.reminder_body,''), 'Hi {{owner}}, {{patient}} is due for a dental recheck.') as bodytmpl,
           coalesce(nullif(p.name,''), case p.client_language
             when 'fr' then 'Votre clinique vétérinaire'
             when 'de' then 'Ihre Tierarztpraxis'
             when 'it' then 'Il Suo studio veterinario'
             when 'es' then 'Su clínica veterinaria'
             when 'pt' then 'Sua clínica veterinária'
             else 'Your veterinary practice' end) as pname,
           coalesce(p.reminder_auto, false) as auto
    from public.charts c
    join public.practices p on p.id = c.practice_id
    where c.owner_email <> ''
      and c.reminder_sent_at is null
      and coalesce(p.reminder_auto, false)
      and c.recall_date = to_char((now() at time zone 'utc')::date + coalesce(p.reminder_lead_days, 0), 'YYYY-MM-DD')
  loop
    subj := replace(replace(replace(replace(r.subject, '{{patient}}', coalesce(r.patient_name,'')), '{{owner}}', coalesce(r.owner_name,'')), '{{practice}}', r.pname), '{{recheck_date}}', coalesce(r.recall_date,''));
    bod  := replace(replace(replace(replace(r.bodytmpl, '{{patient}}', coalesce(r.patient_name,'')), '{{owner}}', coalesce(r.owner_name,'')), '{{practice}}', r.pname), '{{recheck_date}}', coalesce(r.recall_date,''));
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', r.pname || ' <noreply@toothops.app>', 'to', jsonb_build_array(r.owner_email), 'subject', subj, 'text', bod));
    update public.charts set reminder_sent_at = now() where id = r.id;
  end loop;
end
$$;
