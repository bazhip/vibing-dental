-- Non-payment never deletes accounts or data.
--
-- purge_lapsed_practices(), run nightly by the 'daily-billing-purge' cron
-- job, deleted any practice frozen 30+ days after its subscription lapsed:
-- every member's auth account (even members of other, healthy practices),
-- their photos and logos, and the practice. Product rule: a lapsed or
-- cancelled subscription drops to the free plan and keeps everything. Only
-- an explicit, user-initiated deletion removes data.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-billing-purge') then
    perform cron.unschedule('daily-billing-purge');
  end if;
end $$;

drop function if exists public.purge_lapsed_practices();
