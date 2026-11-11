-- Run AFTER 20260719_owner_report_flag.sql and 20261111_owner_report_config.sql
-- (the trigger references their columns).
--
-- Practice owners may update their practice row from the browser (name,
-- logo). They must NOT be able to change billing state, ownership or
-- feature flags that way — e.g. setting subscription_status = 'comped'
-- or plan = 'pro' themselves. Those columns change only through the
-- edge functions (service role): stripe-webhook, billing-api, admin-api,
-- team-api.
create or replace function public.protect_practice_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.plan                  is distinct from old.plan
  or new.account_type          is distinct from old.account_type
  or new.subscription_status   is distinct from old.subscription_status
  or new.billing_period_end    is distinct from old.billing_period_end
  or new.stripe_customer_id    is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.frozen_at             is distinct from old.frozen_at
  or new.owner                 is distinct from old.owner
  or new.owner_report_enabled  is distinct from old.owner_report_enabled
  or new.owner_report_config   is distinct from old.owner_report_config
  then
    raise exception 'Billing, ownership and feature settings can only be changed by ToothOps.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_practice_privileged_columns on public.practices;
create trigger protect_practice_privileged_columns
  before update on public.practices
  for each row execute function public.protect_practice_privileged_columns();
