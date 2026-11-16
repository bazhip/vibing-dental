-- Stamping reminder_sent_at (send-reminder, the daily cron) is bookkeeping,
-- like pims_sent_at and owner_report_sent_at: keep updated_at. Bumping it
-- made a chart open on someone's screen look "changed by someone else" at
-- its next save, and a dismissed conflict question then blocked saving.
create or replace function public.charts_touch_updated_at_fn()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - '{pims_sent_at,owner_report_sent_at,reminder_sent_at,updated_at}'::text[])
     = (to_jsonb(old) - '{pims_sent_at,owner_report_sent_at,reminder_sent_at,updated_at}'::text[]) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;
