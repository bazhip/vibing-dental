-- Filter and aggregate AI usage in Postgres. The report returns aggregates
-- in one response and does not depend on PostgREST's raw-row limit.
create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at);

create or replace function public.admin_ai_usage_query(
  from_date date, to_date date, filter_kind text, filter_model text, daily boolean
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with filtered as (
    select user_id, model, coalesce(nullif(kind, ''), 'live') as kind,
           case when daily then (created_at at time zone 'UTC')::date end as day,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
    from public.ai_usage
    where model not in ('deepgram-token', 'reminder-email', 'owner-report-email', 'feedback')
      and (from_date is null or created_at >= from_date::timestamp at time zone 'UTC')
      and (to_date is null or created_at < (to_date + 1)::timestamp at time zone 'UTC')
      and (filter_kind is null or coalesce(nullif(kind, ''), 'live') = filter_kind)
      and (filter_model is null or model = filter_model)
  ), by_user as (
    select user_id, model, count(*) as calls,
           sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
           sum(cache_read_tokens) as cache_read_tokens, sum(cache_write_tokens) as cache_write_tokens
    from filtered
    group by user_id, model
  ), breakdown as (
    select kind, model, day, count(*) as calls,
           sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
           sum(cache_read_tokens) as cache_read_tokens, sum(cache_write_tokens) as cache_write_tokens
    from filtered
    group by kind, model, day
  )
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(by_user) from by_user), '[]'::jsonb),
    'breakdown', coalesce((select jsonb_agg(breakdown) from breakdown), '[]'::jsonb),
    'models', coalesce((select jsonb_agg(model order by model) from (
      select distinct model from public.ai_usage
      where model not in ('deepgram-token', 'reminder-email', 'owner-report-email', 'feedback', '')
    ) logged_models), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_ai_usage_query(date, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_ai_usage_query(date, date, text, text, boolean) to service_role;
