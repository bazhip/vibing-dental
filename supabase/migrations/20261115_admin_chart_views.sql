-- Audit log of admins viewing another practice's chart (admin-api
-- view_chart). Patient records are the practice's data; every admin read
-- is recorded: who, which chart, which practice, when.
--
-- Service role only: no RLS policies, so no app user can read or write
-- it — admin-api inserts with the service key.
create table if not exists public.admin_chart_views (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete cascade,
  chart_id uuid not null,
  practice_id uuid,
  viewed_at timestamptz not null default now()
);
create index if not exists admin_chart_views_chart_idx on public.admin_chart_views (chart_id, viewed_at desc);
alter table public.admin_chart_views enable row level security;
revoke all on table public.admin_chart_views from public, anon, authenticated;
