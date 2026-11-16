-- Send to PIMS (ezyVet Chrome extension). Additive and idempotent.
--   charts.pims_sent_at        when the record note was last sent to the PIMS
--                              (mark-pims-sent stamps it, service role)
--   profiles.pims_field_map    the vet's saved ezyVet field mapping
--   practices.pims_send_enabled  per-practice release gate (admin-api set_feature)
-- Run AFTER 20261111_protect_practice_billing.sql and 20261124_owner_report_sent_at.sql.
alter table public.charts add column if not exists pims_sent_at timestamptz;
alter table public.profiles add column if not exists pims_field_map jsonb;
alter table public.practices add column if not exists pims_send_enabled boolean not null default false;

-- Practice owners must not flip the flag from the browser.
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
  or new.pims_send_enabled     is distinct from old.pims_send_enabled
  then
    raise exception 'Billing, ownership and feature settings can only be changed by ToothOps.'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- Stamping a sent-at column is bookkeeping, not an edit: keep updated_at so
-- recording a send doesn't make the chart look modified (stale-note checks,
-- "last edited" ordering). Any other changed column bumps it as before.
create or replace function public.charts_touch_updated_at_fn()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - '{pims_sent_at,owner_report_sent_at,updated_at}'::text[])
     = (to_jsonb(old) - '{pims_sent_at,owner_report_sent_at,updated_at}'::text[]) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists charts_touch_updated_at on public.charts;
create trigger charts_touch_updated_at
  before update on public.charts
  for each row execute function public.charts_touch_updated_at_fn();
