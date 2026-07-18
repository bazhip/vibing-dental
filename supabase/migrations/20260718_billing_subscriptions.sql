-- Stripe billing: subscription state on practices, freeze → purge
-- lifecycle, and grandfathering for pre-billing practices.
-- Apply to the ToothOps project (ocjnngfzwyajhgqzicsf) BEFORE deploying
-- the updated admin-api/team-api and the new billing-api/stripe-webhook
-- functions — they select the columns added here.

alter table public.practices add column if not exists plan text not null default 'basic';
alter table public.practices add column if not exists account_type text not null default 'individual';
alter table public.practices add column if not exists stripe_customer_id text not null default '';
alter table public.practices add column if not exists stripe_subscription_id text not null default '';
alter table public.practices add column if not exists subscription_status text not null default 'none';
alter table public.practices add column if not exists billing_period_end timestamptz;
alter table public.practices add column if not exists frozen_at timestamptz;

create index if not exists practices_stripe_customer_idx
  on public.practices (stripe_customer_id) where stripe_customer_id <> '';

-- Grandfather every practice that predates billing: complimentary
-- access, practice-level seats (some already have teams).
update public.practices
  set subscription_status = 'comped', account_type = 'practice'
  where subscription_status = 'none';

-- Purge practices frozen for 30+ days: storage objects, member accounts
-- (never admins; auth cascade removes profiles/charts/templates/
-- attachment rows), then the practice row itself.
create or replace function public.purge_lapsed_practices()
returns void
language plpgsql
security definer set search_path = public as $$
declare
  prac record;
begin
  for prac in
    select id from public.practices
    where subscription_status in ('past_due', 'canceled', 'unpaid', 'incomplete_expired', 'paused')
      and frozen_at is not null
      and frozen_at < now() - interval '30 days'
  loop
    delete from storage.objects o
      where o.bucket_id = 'attachments'
        and (storage.foldername(o.name))[1] in (
          select m.user_id::text from public.practice_members m where m.practice_id = prac.id);
    delete from storage.objects o
      where o.bucket_id = 'logos'
        and ((storage.foldername(o.name))[1] = prac.id::text
          or (storage.foldername(o.name))[1] in (
            select m.user_id::text from public.practice_members m where m.practice_id = prac.id));
    delete from auth.users u
      where u.id in (select m.user_id from public.practice_members m where m.practice_id = prac.id)
        and coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin';
    delete from public.practices where id = prac.id;
  end loop;
end $$;

-- Daily purge at 03:30 UTC (idempotent re-schedule).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-billing-purge') then
    perform cron.unschedule('daily-billing-purge');
  end if;
  perform cron.schedule('daily-billing-purge', '30 3 * * *', 'select public.purge_lapsed_practices()');
end $$;
