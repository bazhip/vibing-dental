-- AI model per feature.
--
-- app_config.ai_model was one model for every AI call. Live dictation is
-- by far the most frequent call (one per spoken phrase, ~75% of spend on
-- Sonnet), while the end-of-dictation review and owner reports run once
-- each. ai_models lets the admin panel pick a model per feature:
--   {"live": ..., "review": ..., "owner_report": ...}
-- Missing keys fall back to ai-autofill's defaults (live = Haiku 5.5,
-- review / owner_report = Sonnet 5.5). ai_model is left in place, unused.
alter table public.app_config
  add column if not exists ai_models jsonb not null default '{}'::jsonb;

-- Live dictation moves to Haiku 5.5; review and owner reports keep the
-- model the site was already using.
update public.app_config
set ai_models = jsonb_build_object(
      'live', 'claude-haiku-5-5',
      'review', coalesce(nullif(ai_model, ''), 'claude-sonnet-5-5'),
      'owner_report', coalesce(nullif(ai_model, ''), 'claude-sonnet-5-5')),
    updated_at = now()
where id = 1 and ai_models = '{}'::jsonb;

-- Spend by feature and model since a given time, for the admin panel.
-- Rows logged before ai_usage.kind existed have kind '' — those were all
-- live dictation calls. Warm-ups prime the live prompt cache.
-- Service role only (admin-api re-checks the caller is an admin).
create or replace function public.admin_ai_usage_by_feature(since timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind,
           'model', model,
           'calls', calls,
           'input_tokens', input_tokens,
           'output_tokens', output_tokens,
           'cache_read_tokens', cache_read_tokens,
           'cache_write_tokens', cache_write_tokens)), '[]'::jsonb)
  from (
    select coalesce(nullif(kind, ''), 'live') as kind, model,
           count(*) as calls,
           coalesce(sum(input_tokens), 0) as input_tokens,
           coalesce(sum(output_tokens), 0) as output_tokens,
           coalesce(sum(cache_read_tokens), 0) as cache_read_tokens,
           coalesce(sum(cache_write_tokens), 0) as cache_write_tokens
    from public.ai_usage
    where model not in ('deepgram-token', 'reminder-email', 'owner-report-email', 'feedback')
      and created_at >= since
    group by 1, 2
  ) t;
$$;
revoke all on function public.admin_ai_usage_by_feature(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_usage_by_feature(timestamptz) to service_role;
