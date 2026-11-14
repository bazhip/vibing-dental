-- AI usage totals for the admin panel, computed in Postgres.
--
-- admin-api used to download every ai_usage row and add them up in the
-- edge function. PostgREST caps responses at the project's max-rows (1000
-- by default), so once there were more than 1000 AI calls the per-account
-- usage and the total cost silently stopped growing (new calls fell
-- outside the first 1000 rows). Same fix as admin_chart_counts.
--
-- One row per (account, model), aggregated into a single jsonb value:
-- [{"user_id", "model", "calls", "input_tokens", "output_tokens",
--   "cache_read_tokens", "cache_write_tokens"}, ...]
-- Rate-limit bookkeeping rows (deepgram-token, reminder-email, feedback)
-- aren't AI calls and are left out.
--
-- Service role only (admin-api re-checks the caller is an admin).
create or replace function public.admin_ai_usage_totals()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id,
           'model', model,
           'calls', calls,
           'input_tokens', input_tokens,
           'output_tokens', output_tokens,
           'cache_read_tokens', cache_read_tokens,
           'cache_write_tokens', cache_write_tokens)), '[]'::jsonb)
  from (
    select user_id, model,
           count(*) as calls,
           coalesce(sum(input_tokens), 0) as input_tokens,
           coalesce(sum(output_tokens), 0) as output_tokens,
           coalesce(sum(cache_read_tokens), 0) as cache_read_tokens,
           coalesce(sum(cache_write_tokens), 0) as cache_write_tokens
    from public.ai_usage
    where model not in ('deepgram-token', 'reminder-email', 'feedback')
    group by user_id, model
  ) t;
$$;
revoke all on function public.admin_ai_usage_totals() from public, anon, authenticated;
grant execute on function public.admin_ai_usage_totals() to service_role;
