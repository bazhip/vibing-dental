-- One-off product-update emails ("What's new"): who has opted out, and which
-- accounts already got a given campaign so a re-run never double-sends.
-- Both tables are service-role only (RLS on, no policies).
create table if not exists public.marketing_opt_outs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  opted_out_at timestamptz not null default now()
);
create table if not exists public.marketing_sends (
  campaign text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (campaign, user_id)
);
alter table public.marketing_opt_outs enable row level security;
alter table public.marketing_sends enable row level security;
grant select, insert, update, delete on public.marketing_opt_outs to service_role;
grant select, insert, update, delete on public.marketing_sends to service_role;
