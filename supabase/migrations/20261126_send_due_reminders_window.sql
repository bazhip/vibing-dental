-- send_due_reminders(): send reminders that are due (not only on the exact
-- day), and skip a recheck date a later visit has superseded.
--
-- Run by hand in the SQL Editor (owner action). As with
-- 20261123_send_due_reminders_safety.sql, BEFORE applying compare with the
-- live definition and diff the whole body:
--   select pg_get_functiondef('public.send_due_reminders'::regproc);
-- The live function should equal 20261123's body; keep its header lines
-- (security definer, search_path) exactly as live.
--
-- Changes vs. 20261123 (everything else is identical):
--   * recall_date matched against a window (today - 2 days .. today + lead
--     days, UTC) instead of exactly today + lead days, which never sent a
--     reminder if the job missed that day or the UTC date ran ahead.
--   * a chart is skipped when the same patient (same practice; patient
--     number, else name) has a later-dated visit.
--   NOTE: reminders still due in the last 2 days that were never sent will
--   go out on the first run after this is applied.

create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public, extensions
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
      -- Due within the lead time, and at most 2 days past: a day the job
      -- didn't run (or a UTC date ahead of the practice's) no longer means
      -- the reminder is never sent. reminder_sent_at still sends it once.
      and c.recall_date between to_char((now() at time zone 'utc')::date - 2, 'YYYY-MM-DD')
                            and to_char((now() at time zone 'utc')::date + coalesce(p.reminder_lead_days, 0), 'YYYY-MM-DD')
      -- Superseded: the patient has a later visit (normally the recheck
      -- itself). Same patient rule as the app (number, else name).
      and not exists (
        select 1 from public.charts n
         where n.practice_id = c.practice_id
           and n.id <> c.id
           and n.chart_date > c.chart_date
           and case when trim(c.patient_number) <> ''
                    then lower(trim(n.patient_number)) = lower(trim(c.patient_number))
                    else trim(n.patient_number) = '' and lower(trim(n.patient_name)) = lower(trim(c.patient_name))
               end)
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

-- Only the cron job (running as the job owner) should call this; the app never does.
revoke execute on function public.send_due_reminders() from public, anon, authenticated;
