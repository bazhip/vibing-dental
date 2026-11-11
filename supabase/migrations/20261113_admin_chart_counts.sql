-- Chart counts for the admin panel, computed in Postgres.
--
-- admin-api used to download every charts row (created_by, practice_id)
-- and count in the edge function. PostgREST caps responses at the
-- project's max-rows (1000 by default), so past 1000 charts the
-- per-account and per-practice counts silently came up short.
--
-- This returns one row per (creator, practice) pair, aggregated into a
-- single jsonb value so the response is one row no matter how many
-- accounts exist: [{"created_by": uuid, "practice_id": uuid|null, "n": int}, ...]
--
-- Service role only (admin-api re-checks the caller is an admin).
create or replace function public.admin_chart_counts()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'created_by', created_by,
           'practice_id', practice_id,
           'n', n)), '[]'::jsonb)
  from (
    select created_by, practice_id, count(*) as n
    from public.charts
    group by created_by, practice_id
  ) t;
$$;
revoke all on function public.admin_chart_counts() from public, anon, authenticated;
grant execute on function public.admin_chart_counts() to service_role;
