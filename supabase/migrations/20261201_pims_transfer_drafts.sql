begin;

create table if not exists public.pims_drafts (
  id uuid primary key,
  chart_id uuid not null references public.charts(id) on delete cascade,
  practice_id uuid not null references public.practices(id),
  kind text not null check (kind in ('history','radiology')),
  language text not null check (language in ('en','fr','de','it','es')),
  body text not null check (length(btrim(body)) between 1 and 60000),
  source_hash text not null,
  source jsonb not null,
  version integer not null check (version > 0),
  reviewed_version integer,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((reviewed_version is null and reviewed_by is null and reviewed_at is null)
    or (reviewed_version=version and reviewed_by is not null and reviewed_at is not null))
);
create index if not exists pims_drafts_chart_idx on public.pims_drafts(chart_id, practice_id);

create table if not exists public.pims_draft_actions (
  request_id uuid primary key,
  chart_id uuid not null references public.charts(id) on delete cascade,
  practice_id uuid not null references public.practices(id),
  draft_id uuid not null references public.pims_drafts(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('save','review')),
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function public.pims_draft_readable(chart uuid, practice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.pims_is_current_member(practice) and exists (
    select 1 from public.charts where id=chart and practice_id=practice
  )
$$;
revoke all on function public.pims_draft_readable(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.pims_draft_readable(uuid,uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['pims_drafts','pims_draft_actions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('drop policy if exists pims_member_read on public.%I',table_name);
    execute format('create policy pims_member_read on public.%I for select to authenticated using (public.pims_draft_readable(chart_id,practice_id))',table_name);
  end loop;
end $$;

create or replace function pims_private.draft_source(chart uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare source_chart public.charts; result jsonb;
begin
  select * into source_chart from public.charts where id=chart;
  if not found or source_chart.practice_id is null then raise exception 'pims_forbidden'; end if;
  perform pims_private.require_member(source_chart.practice_id);
  select * into source_chart from public.charts where id=chart for update;
  if not found or source_chart.practice_id is null then raise exception 'pims_forbidden'; end if;
  perform pims_private.require_member(source_chart.practice_id);
  result := jsonb_build_object('chart_id',source_chart.id,'practice_id',source_chart.practice_id,
    'patient_name',source_chart.patient_name,'patient_number',source_chart.patient_number,
    'chart_date',source_chart.chart_date,'updated_at',source_chart.updated_at,'data',source_chart.data);
  return result || jsonb_build_object('hash',pims_private.hash(result));
end $$;

create or replace function public.pims_draft_context(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare source_value jsonb; drafts jsonb;
begin
  perform pims_private.keys(payload,array['chart_id'],array['chart_id']);
  source_value := pims_private.draft_source(pims_private.uuid_value(payload,'chart_id'));
  select coalesce(jsonb_agg(to_jsonb(draft) order by draft.created_at,draft.id),'[]'::jsonb) into drafts
    from public.pims_drafts draft where chart_id=(source_value->>'chart_id')::uuid and practice_id=(source_value->>'practice_id')::uuid;
  return jsonb_build_object('source',source_value,'drafts',drafts);
end $$;

create or replace function public.pims_draft_write(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare source_value jsonb; draft public.pims_drafts; previous public.pims_draft_actions;
  action_value text; request uuid; identifier uuid; expected integer; chart uuid; practice uuid;
  draft_exists boolean; result jsonb; body_value text; kind_value text; language_value text;
begin
  action_value := pims_private.text_value(payload,'action');
  if action_value='save' then
    perform pims_private.keys(payload,array['action','chart_id','draft_id','request_id','expected_version','kind','language','body','source_hash'],
      array['action','chart_id','draft_id','request_id','expected_version','kind','language','body','source_hash']);
  elsif action_value='review' then
    perform pims_private.keys(payload,array['action','chart_id','draft_id','request_id','expected_version'],array['action','chart_id','draft_id','request_id','expected_version']);
  else raise exception 'pims_invalid'; end if;
  chart := pims_private.uuid_value(payload,'chart_id');
  identifier := pims_private.uuid_value(payload,'draft_id');
  request := pims_private.uuid_value(payload,'request_id');
  expected := pims_private.integer_value(payload,'expected_version');
  perform pg_advisory_xact_lock(hashtextextended(request::text,0));
  source_value := pims_private.draft_source(chart);
  practice := (source_value->>'practice_id')::uuid;
  select * into previous from public.pims_draft_actions where request_id=request;
  if found then
    if previous.actor_id<>auth.uid() or previous.payload_hash<>pims_private.hash(payload) or previous.practice_id<>practice then raise exception 'pims_idempotency'; end if;
    if action_value='review' then
      if previous.result->>'source_hash'<>source_value->>'hash' then raise exception 'pims_stale'; end if;
      perform 1 from public.pims_drafts where id=identifier and version=(previous.result->>'version')::integer and reviewed_version=version;
      if not found then raise exception 'pims_conflict'; end if;
    end if;
    return previous.result;
  end if;
  select * into draft from public.pims_drafts where id=identifier for update;
  draft_exists := found;
  if draft_exists and (draft.chart_id<>chart or draft.practice_id<>practice) then raise exception 'pims_forbidden'; end if;
  if (draft_exists and draft.version<>expected) or (not draft_exists and expected<>0) then raise exception 'pims_conflict'; end if;
  if action_value='save' then
    body_value := payload->>'body';
    kind_value := pims_private.text_value(payload,'kind');
    language_value := pims_private.text_value(payload,'language');
    if jsonb_typeof(payload->'body') is distinct from 'string' or length(body_value)>60000
      or body_value !~ '[^[:space:]]' or body_value ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
      or kind_value not in ('history','radiology') or language_value not in ('en','fr','de','it','es') then raise exception 'pims_invalid'; end if;
    if pims_private.text_value(payload,'source_hash')<>source_value->>'hash' then raise exception 'pims_stale'; end if;
    if draft_exists then
      if draft.kind<>kind_value then raise exception 'pims_conflict'; end if;
      update public.pims_drafts set body=body_value,language=language_value,source_hash=source_value->>'hash',source=source_value-'data',
        version=version+1,reviewed_version=null,reviewed_by=null,reviewed_at=null,updated_by=auth.uid(),updated_at=clock_timestamp()
        where id=identifier returning * into draft;
    else
      if (select count(*) from public.pims_drafts where chart_id=chart and practice_id=practice)>=20 then raise exception 'pims_invalid'; end if;
      insert into public.pims_drafts(id,chart_id,practice_id,kind,language,body,source_hash,source,version,created_by,updated_by)
        values(identifier,chart,practice,kind_value,language_value,body_value,source_value->>'hash',source_value-'data',1,auth.uid(),auth.uid()) returning * into draft;
    end if;
  else
    if not draft_exists then raise exception 'pims_conflict'; end if;
    if draft.source_hash<>source_value->>'hash' then raise exception 'pims_stale'; end if;
    update public.pims_drafts set version=version+1,reviewed_version=version+1,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),
      updated_by=auth.uid(),updated_at=clock_timestamp() where id=identifier returning * into draft;
  end if;
  result := to_jsonb(draft);
  insert into public.pims_draft_actions(request_id,chart_id,practice_id,draft_id,actor_id,action,payload_hash,result)
    values(request,chart,practice,identifier,auth.uid(),action_value,pims_private.hash(payload),result);
  return result;
end $$;

create or replace function public.pims_draft_export(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare source_value jsonb; draft public.pims_drafts;
begin
  perform pims_private.keys(payload,array['chart_id','draft_id','expected_version'],array['chart_id','draft_id','expected_version']);
  source_value := pims_private.draft_source(pims_private.uuid_value(payload,'chart_id'));
  select * into draft from public.pims_drafts where id=pims_private.uuid_value(payload,'draft_id') for share;
  if not found or draft.chart_id<>(source_value->>'chart_id')::uuid or draft.practice_id<>(source_value->>'practice_id')::uuid then raise exception 'pims_forbidden'; end if;
  if draft.version<>pims_private.integer_value(payload,'expected_version') then raise exception 'pims_conflict'; end if;
  if draft.source_hash<>source_value->>'hash' then raise exception 'pims_stale'; end if;
  if draft.reviewed_version is distinct from draft.version then raise exception 'pims_unreviewed'; end if;
  return to_jsonb(draft);
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$
declare function_name text;
begin
  foreach function_name in array array['pims_draft_context','pims_draft_write','pims_draft_export'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;

commit;
