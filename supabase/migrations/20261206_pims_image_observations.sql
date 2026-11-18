begin;

alter table public.pims_image_attempts add column if not exists review_version integer not null default 0 check (review_version>=0);
create index if not exists pims_image_review_page_idx on public.pims_image_attempts(chart_id,practice_id,id) where state='unknown';

create table if not exists public.pims_image_observations (
  request_id uuid primary key,
  attempt_id uuid not null references public.pims_image_attempts(id) on delete cascade,
  version integer not null check (version>0),
  observation text not null check (observation in ('present','not_found','uncertain')),
  note text not null check (length(note) between 1 and 200 and note=btrim(note) and note !~ '[[:cntrl:]]'),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  payload_hash text not null,
  unique(attempt_id,version)
);
alter table public.pims_image_observations enable row level security;
revoke all on public.pims_image_observations from public, anon, authenticated, service_role;
grant select on public.pims_image_observations to authenticated;
drop policy if exists pims_member_read on public.pims_image_observations;
create policy pims_member_read on public.pims_image_observations for select to authenticated
  using (exists(select 1 from public.pims_image_attempts attempt where attempt.id=attempt_id
    and public.pims_draft_readable(attempt.chart_id,attempt.practice_id)));

create or replace function pims_private.image_observation_json(observation public.pims_image_observations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('request_id',observation.request_id,'attempt_id',observation.attempt_id,
    'chart_id',attempt.chart_id,'version',observation.version,'observation',observation.observation,
    'note',observation.note,'actor_id',observation.actor_id,'created_at',observation.created_at)
  from public.pims_image_attempts attempt where attempt.id=observation.attempt_id
$$;

create or replace function public.pims_image_review_page(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare chart_value uuid; practice_value uuid; cursor_value uuid; rows_value jsonb;
begin
  perform pims_private.keys(payload,array['chart_id'],array['chart_id','cursor']);
  chart_value := pims_private.uuid_value(payload,'chart_id');
  if payload ? 'cursor' then cursor_value := pims_private.uuid_value(payload,'cursor'); end if;
  select practice_id into practice_value from public.charts where id=chart_value;
  perform pims_private.require_member(practice_value);
  perform 1 from public.charts where id=chart_value and practice_id=practice_value for share;
  if not found then raise exception 'pims_forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind','image','id',attempt.id,'chart_id',attempt.chart_id,
    'connection_id',attempt.connection_id,'connection_revision',attempt.connection_revision,'identity',attempt.identity,
    'patient_id',attempt.patient_id,'encounter_id',attempt.encounter_id,'destination',attempt.destination,
    'document_generation',attempt.document_generation,'image_id',attempt.image_id,
    'content_hash',attempt.content_hash,'dispatched_at',attempt.dispatched_at,'state',attempt.state,
    'review_version',attempt.review_version,
    'observation',(select pims_private.image_observation_json(review_entry) from public.pims_image_observations review_entry
      where review_entry.attempt_id=attempt.id and review_entry.version=attempt.review_version)) order by attempt.id),'[]'::jsonb)
  into rows_value from (select * from public.pims_image_attempts where chart_id=chart_value and practice_id=practice_value
    and state='unknown' and (cursor_value is null or id>cursor_value) order by id limit 51) attempt;
  return jsonb_build_object('rows',case when jsonb_array_length(rows_value)>50 then rows_value-50 else rows_value end,
    'next_cursor',case when jsonb_array_length(rows_value)>50 then rows_value->49->>'id' else null end);
end $$;

create or replace function public.pims_record_image_observation(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_image_attempts; connection public.pims_connections;
  receipt public.pims_image_observations; request_value uuid; expected integer; observation_value text; note_value text;
begin
  perform pims_private.keys(payload,array['chart_id','attempt_id','request_id','expected_version','observation','note'],
    array['chart_id','attempt_id','request_id','expected_version','observation','note']);
  request_value := pims_private.uuid_value(payload,'request_id');
  expected := pims_private.integer_value(payload,'expected_version');
  observation_value := pims_private.text_value(payload,'observation');
  note_value := pims_private.text_value(payload,'note');
  if observation_value not in ('present','not_found','uncertain') then raise exception 'pims_invalid'; end if;
  select * into attempt from public.pims_image_attempts where id=pims_private.uuid_value(payload,'attempt_id')
    and chart_id=pims_private.uuid_value(payload,'chart_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(attempt.connection_id);
  select * into attempt from public.pims_image_attempts where id=attempt.id for update;
  if not found or attempt.practice_id<>connection.practice_id then raise exception 'pims_forbidden'; end if;
  perform 1 from public.charts where id=attempt.chart_id and practice_id=attempt.practice_id for share;
  if not found then raise exception 'pims_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_value::text,0));
  select * into receipt from public.pims_image_observations where request_id=request_value;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.payload_hash<>pims_private.hash(payload) then raise exception 'pims_idempotency'; end if;
    return pims_private.image_observation_json(receipt);
  end if;
  if attempt.state<>'unknown' or attempt.review_version<>expected then raise exception 'pims_conflict'; end if;
  insert into public.pims_image_observations(request_id,attempt_id,version,observation,note,actor_id,payload_hash)
    values(request_value,attempt.id,expected+1,observation_value,note_value,auth.uid(),pims_private.hash(payload)) returning * into receipt;
  update public.pims_image_attempts set review_version=receipt.version where id=attempt.id;
  perform pims_private.audit(connection,'image_manually_reviewed',attempt.id,expected,receipt.version);
  return pims_private.image_observation_json(receipt);
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$ declare function_name text; begin
  foreach function_name in array array['pims_image_review_page','pims_record_image_observation'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;
commit;
