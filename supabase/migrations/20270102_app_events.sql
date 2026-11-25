-- App-wide outcome events, so failures anywhere in the product can be found
-- and fixed: dictation, chart saves, AI calls, sign-in and crashes.
-- Readable by database operators only. Events never carry transcript, patient
-- or free text: only counts, durations, field names and short machine codes
-- (enforced by telemetry.app_event_detail_valid below).
create schema if not exists telemetry;
revoke all on schema telemetry from public, anon, authenticated, service_role;

create table if not exists telemetry.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  area text not null check (area ~ '^[a-z][a-z_]{0,29}$'),
  stage text not null check (stage ~ '^[a-z][a-z_]{0,39}$'),
  outcome text not null check (outcome in ('ok', 'fail', 'info')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table telemetry.app_events enable row level security;
revoke all on table telemetry.app_events from public, anon, authenticated, service_role;
create index if not exists app_events_created_at_idx on telemetry.app_events (created_at);
create index if not exists app_events_area_stage_idx on telemetry.app_events (area, stage, created_at);
create index if not exists app_events_user_created_at_idx on telemetry.app_events (user_id, created_at);

-- Only scalars and short string lists, so free text cannot be smuggled in.
create or replace function telemetry.app_event_detail_valid(detail jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry record;
  item jsonb;
begin
  if detail is null or jsonb_typeof(detail) <> 'object' or length(detail::text) > 1500 then
    return false;
  end if;
  for entry in select key, value from jsonb_each(detail) loop
    if entry.key !~ '^[a-z][a-z_0-9]{0,39}$' then return false; end if;
    if jsonb_typeof(entry.value) in ('number', 'boolean') then
      continue;
    elsif jsonb_typeof(entry.value) = 'string' then
      if length(entry.value #>> '{}') > 80 then return false; end if;
    elsif jsonb_typeof(entry.value) = 'array' then
      if jsonb_array_length(entry.value) > 20 then return false; end if;
      for item in select value from jsonb_array_elements(entry.value) loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 40 then return false; end if;
      end loop;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.log_app_event(
  p_session_id uuid,
  p_area text,
  p_stage text,
  p_outcome text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or auth.jwt()->>'is_anonymous' = 'true' then
    raise insufficient_privilege;
  end if;
  if p_area is null or p_area !~ '^[a-z][a-z_]{0,29}$'
    or p_stage is null or p_stage !~ '^[a-z][a-z_]{0,39}$'
    or p_outcome not in ('ok', 'fail', 'info')
    or not telemetry.app_event_detail_valid(coalesce(p_detail, '{}'::jsonb)) then
    raise exception 'invalid app event';
  end if;

  -- A runaway client must not fill the table: drop events past the daily cap.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 20270102));
  if (
    select count(*) from telemetry.app_events
    where user_id = v_user_id and created_at > now() - interval '24 hours'
  ) >= 3000 then
    return;
  end if;

  insert into telemetry.app_events (user_id, session_id, area, stage, outcome, detail)
  values (v_user_id, p_session_id, p_area, p_stage, p_outcome, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function telemetry.app_event_detail_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.log_app_event(uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.log_app_event(uuid, text, text, text, jsonb)
  to authenticated;

-- Keep 90 days: long enough to compare releases, short enough to stay small.
select cron.schedule(
  'purge-app-events',
  '17 3 * * *',
  $job$delete from telemetry.app_events where created_at < now() - interval '90 days'$job$
);

-- ---------------------------------------------------------------------------
-- Dictation analytics: one row per dictation, then rollups over it.
-- Everything reads the `summary` events the app emits once per dictation
-- (see src/utils/dictationTelemetry.ts). Operators only, like the table.
-- ---------------------------------------------------------------------------

-- One row per dictation. `outcome` is what it amounted to for the user:
--   applied, review_abandoned, nothing_extracted, no_speech, capture_failed,
--   extract_failed, superseded, closed.
create or replace view telemetry.dictation_sessions as
select
  e.session_id,
  e.user_id,
  e.created_at,
  e.detail->>'flow' as flow,
  e.detail->>'outcome' as outcome,
  e.detail->>'provider' as provider,
  e.detail->>'lang' as lang,
  e.detail->>'target' as target,
  coalesce((e.detail->>'seeded')::boolean, false) as seeded,
  coalesce((e.detail->>'resumed')::boolean, false) as resumed,
  (e.detail->>'total_ms')::int as total_ms,
  coalesce((e.detail->>'capture_ms')::int, 0) as capture_ms,
  coalesce((e.detail->>'chars')::int, 0) as chars,
  coalesce((e.detail->>'segments')::int, 0) as segments,
  coalesce((e.detail->>'chunks')::int, 0) as chunks,
  case when coalesce((e.detail->>'chunks')::int, 0) > 0
       then (e.detail->>'chunk_ms')::numeric / (e.detail->>'chunks')::int end as avg_chunk_ms,
  coalesce((e.detail->>'actions')::int, 0) as actions,
  coalesce((e.detail->>'direct')::int, 0) as direct_actions,
  coalesce((e.detail->>'final_checks')::int, 0) as final_checks,
  coalesce((e.detail->>'final_raised')::int, 0) as final_raised,
  coalesce((e.detail->>'proposed')::int, 0) as proposed_fields,
  coalesce((e.detail->>'applied_fields')::int, 0) as applied_fields,
  e.detail->>'apply_mode' as apply_mode,
  coalesce((e.detail->>'low_confidence')::int, 0) as low_confidence_fields,
  coalesce((e.detail->>'review_shown')::int, 0) as review_shown,
  coalesce((e.detail->>'review_abandoned')::int, 0) as review_abandoned,
  coalesce((e.detail->>'interrupted')::int, 0) as interrupted,
  coalesce((e.detail->>'never_live')::int, 0) as never_live,
  coalesce((e.detail->>'capture_fail')::int, 0) as capture_failures,
  e.detail->>'capture_code' as capture_code,
  coalesce((e.detail->>'token_fail')::int, 0) as token_failures,
  e.detail->>'token_code' as token_code,
  e.detail->>'fallback' as fallback,
  coalesce((e.detail->>'extract_fail')::int, 0) as extract_failures,
  e.detail->>'extract_code' as extract_code,
  coalesce((e.detail->>'final_fail')::int, 0) as final_check_failures,
  coalesce((e.detail->>'apply_fail')::int, 0) as apply_failures
from telemetry.app_events e
where e.area = 'dictation' and e.stage = 'summary';

-- The funnel by day: how often dictation works, and how it fails when it does not.
create or replace view telemetry.dictation_daily as
select
  date_trunc('day', created_at)::date as day,
  flow,
  count(*) as dictations,
  count(distinct user_id) as users,
  round(100.0 * count(*) filter (where outcome = 'applied') / count(*), 1) as pct_applied,
  round(100.0 * count(*) filter (where outcome = 'no_speech') / count(*), 1) as pct_no_speech,
  round(100.0 * count(*) filter (where outcome = 'capture_failed') / count(*), 1) as pct_capture_failed,
  round(100.0 * count(*) filter (where outcome = 'extract_failed') / count(*), 1) as pct_extract_failed,
  round(100.0 * count(*) filter (where outcome = 'nothing_extracted') / count(*), 1) as pct_nothing_extracted,
  round(100.0 * count(*) filter (where outcome = 'review_abandoned') / count(*), 1) as pct_review_abandoned,
  round(100.0 * count(*) filter (where token_failures > 0) / count(*), 1) as pct_token_failed,
  round(100.0 * count(*) filter (where interrupted > 0) / count(*), 1) as pct_interrupted,
  (percentile_cont(0.5) within group (order by avg_chunk_ms))::int as median_chunk_ms
from telemetry.dictation_sessions
group by 1, 2;

-- What is going wrong, ranked: failures by where they happen and the code they carry.
create or replace view telemetry.dictation_failure_causes as
select
  e.detail->>'flow' as flow,
  e.detail->>'where' as failed_in,
  e.detail->>'code' as code,
  e.detail->>'reason' as reason,
  e.detail->>'provider' as provider,
  count(*) as events,
  count(distinct e.user_id) as users,
  min(e.created_at) as first_seen,
  max(e.created_at) as last_seen
from telemetry.app_events e
where e.area = 'dictation' and e.stage = 'failure'
group by 1, 2, 3, 4, 5;

-- Who is struggling: users whose recent dictations mostly did not land.
create or replace view telemetry.dictation_user_health as
select
  user_id,
  count(*) as dictations,
  count(*) filter (where outcome = 'applied') as applied,
  count(*) filter (where outcome in ('no_speech', 'capture_failed', 'extract_failed')) as failed,
  max(created_at) as last_dictation,
  mode() within group (order by coalesce(capture_code, token_code, extract_code)) as most_common_failure
from telemetry.dictation_sessions
where created_at > now() - interval '14 days'
group by 1;

-- Is the AI right? How often the clinician keeps, edits or removes what it did.
create or replace view telemetry.dictation_quality as
select
  date_trunc('day', created_at)::date as day,
  e.detail->>'flow' as flow,
  e.stage,
  coalesce(e.detail->>'choice', e.detail->>'decision') as decision,
  count(*) as events
from telemetry.app_events e
where e.area = 'dictation' and e.stage in ('review_decision', 'check_decision')
group by 1, 2, 3, 4;

revoke all on all tables in schema telemetry from public, anon, authenticated, service_role;
