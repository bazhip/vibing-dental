begin;

create schema if not exists pims_private;
revoke all on schema pims_private from public, anon, authenticated, service_role;

create table if not exists public.pims_connections (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id),
  provider text not null check (provider in ('ezyvet','daysmart','instinct','pulse','rhapsody','shepherd','vetspire')),
  origin text not null,
  tenant_id text not null,
  state text not null default 'unverified' check (state in ('unverified','active','disabled')),
  revision integer not null default 1 check (revision > 0),
  generation integer not null default 0 check (generation >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  unique(id, practice_id),
  unique(practice_id, provider, origin, tenant_id)
);

create table if not exists public.pims_patient_groups (
  id uuid primary key,
  practice_id uuid not null references public.practices(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(id, practice_id)
);

create table if not exists public.pims_patient_links (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  patient_id text not null check (length(patient_id) between 1 and 200),
  patient_key uuid not null,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id),
  foreign key (patient_key, practice_id) references public.pims_patient_groups(id, practice_id),
  unique(connection_id, patient_id),
  unique(id, connection_id, practice_id, version)
);

create table if not exists public.pims_clinician_links (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  clinician_id text not null check (length(clinician_id) between 1 and 200),
  user_id uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id),
  unique(connection_id, clinician_id),
  unique(id, connection_id, practice_id, version)
);

create table if not exists public.pims_sync_runs (
  id uuid primary key,
  practice_id uuid not null,
  connection_id uuid not null,
  actor_id uuid not null references auth.users(id),
  connection_revision integer not null,
  generation integer not null,
  scope jsonb not null,
  scope_hash text not null,
  state text not null default 'capturing' check (state in ('capturing','saving','completed','abandoned','expired','interrupted')),
  completeness text not null default 'unknown' check (completeness in ('complete','partial','unknown')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  finished_at timestamptz,
  sealed_at timestamptz,
  chunk_count integer not null default 0,
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id),
  unique(connection_id, generation),
  unique(id, connection_id, practice_id)
);

create table if not exists public.pims_visits (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  appointment_id text not null,
  patient_link_id uuid not null,
  patient_link_version integer not null,
  clinician_link_id uuid not null,
  clinician_link_version integer not null,
  encounter_id text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  source_hash text not null,
  version integer not null default 1,
  last_seen_run_id uuid not null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  archive_kind text check (archive_kind in ('manual','source')),
  archive_reason text,
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id),
  foreign key (patient_link_id, connection_id, practice_id, patient_link_version) references public.pims_patient_links(id, connection_id, practice_id, version),
  foreign key (clinician_link_id, connection_id, practice_id, clinician_link_version) references public.pims_clinician_links(id, connection_id, practice_id, version),
  foreign key (last_seen_run_id, connection_id, practice_id) references public.pims_sync_runs(id, connection_id, practice_id),
  unique(connection_id, appointment_id)
);

create table if not exists public.pims_sync_chunks (
  request_id uuid primary key,
  practice_id uuid not null,
  connection_id uuid not null,
  run_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (run_id, connection_id, practice_id) references public.pims_sync_runs(id, connection_id, practice_id)
);

create table if not exists public.pims_sync_issues (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  run_id uuid not null,
  appointment_id text not null,
  reason text not null,
  visit_version integer not null,
  patient_link_version integer not null,
  clinician_link_version integer not null,
  proposal_hash text not null,
  proposed jsonb not null,
  resolution text check (resolution in ('retain','accept_schedule')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (run_id, connection_id, practice_id) references public.pims_sync_runs(id, connection_id, practice_id),
  unique(run_id, connection_id, appointment_id, reason, visit_version, patient_link_version, clinician_link_version, proposal_hash)
);

create index if not exists pims_patient_links_page_idx on public.pims_patient_links(connection_id,id);
create index if not exists pims_clinician_links_page_idx on public.pims_clinician_links(connection_id,id);
create index if not exists pims_visits_page_idx on public.pims_visits(connection_id,id);

create table if not exists public.pims_audit_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_id uuid not null,
  before_version integer,
  after_version integer not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id)
);

create or replace function public.pims_is_current_member(practice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.practice_members where practice_id=practice and user_id=auth.uid())
$$;
revoke all on function public.pims_is_current_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pims_is_current_member(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['pims_connections','pims_patient_groups','pims_patient_links','pims_clinician_links','pims_sync_runs','pims_visits','pims_sync_chunks','pims_sync_issues','pims_audit_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('drop policy if exists pims_member_read on public.%I', table_name);
    execute format('create policy pims_member_read on public.%I for select to authenticated using (public.pims_is_current_member(practice_id))', table_name);
  end loop;
end $$;

create or replace function pims_private.keys(payload jsonb, required text[], allowed text[]) returns void
language plpgsql set search_path = '' as $$
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or not (payload ?& required)
     or payload - allowed <> '{}'::jsonb or octet_length(payload::text) > 262144 then
    raise exception 'pims_invalid';
  end if;
end $$;

create or replace function pims_private.text_value(payload jsonb, field text) returns text
language plpgsql set search_path = '' as $$
declare result text := payload->>field;
begin
  if jsonb_typeof(payload->field) is distinct from 'string' or length(result) not between 1 and 200
     or result <> btrim(result) or result ~ '[[:cntrl:]]' then raise exception 'pims_invalid'; end if;
  return result;
end $$;

create or replace function pims_private.uuid_value(payload jsonb, field text) returns uuid
language plpgsql set search_path = '' as $$
declare result text := pims_private.text_value(payload, field);
begin
  if result !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'pims_invalid'; end if;
  return result::uuid;
end $$;

create or replace function pims_private.integer_value(payload jsonb, field text) returns integer
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(payload->field) is distinct from 'number' or (payload->>field) !~ '^[0-9]{1,9}$' then raise exception 'pims_invalid'; end if;
  return (payload->>field)::integer;
end $$;

create or replace function pims_private.instant(payload jsonb, field text) returns timestamptz
language plpgsql set search_path = '' as $$
declare value text := pims_private.text_value(payload, field);
begin
  if value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'pims_invalid'; end if;
  return value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'pims_invalid';
end $$;

create or replace function pims_private.scope(payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  day_value date;
  zone_value text;
  start_value timestamptz;
  end_value timestamptz;
begin
  perform pims_private.keys(payload, array['requested_date','timezone','window_start','window_end'], array['requested_date','timezone','window_start','window_end']);
  zone_value := pims_private.text_value(payload, 'timezone');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone_value) or
     pims_private.text_value(payload, 'requested_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'pims_invalid'; end if;
  day_value := (payload->>'requested_date')::date;
  start_value := pims_private.instant(payload, 'window_start');
  end_value := pims_private.instant(payload, 'window_end');
  if start_value is distinct from (day_value::timestamp at time zone zone_value)
     or end_value is distinct from ((day_value + 1)::timestamp at time zone zone_value)
     or end_value <= start_value or end_value-start_value > interval '26 hours' then raise exception 'pims_invalid'; end if;
  return jsonb_build_object('requested_date',day_value,'timezone',zone_value,'window_start',start_value,'window_end',end_value);
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'pims_invalid';
end $$;

create or replace function pims_private.hash(payload jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
$$;

create or replace function pims_private.require_member(practice uuid, owner_only boolean default false) returns void
language plpgsql set search_path = '' as $$
declare practice_owner uuid;
begin
  if auth.uid() is null then raise exception 'pims_forbidden'; end if;
  select owner into practice_owner from public.practices where id=practice for share;
  if not found then raise exception 'pims_forbidden'; end if;
  perform 1 from public.practice_members where practice_id=practice and user_id=auth.uid() for share;
  if not found or (owner_only and practice_owner is distinct from auth.uid()) then raise exception 'pims_forbidden'; end if;
end $$;

create or replace function pims_private.lock_connection(connection uuid, owner_only boolean default false) returns public.pims_connections
language plpgsql set search_path = '' as $$
declare result public.pims_connections;
begin
  select * into result from public.pims_connections where id=connection;
  if not found then raise exception 'pims_forbidden'; end if;
  perform pims_private.require_member(result.practice_id, owner_only);
  select * into result from public.pims_connections where id=connection for update;
  return result;
end $$;

create or replace function pims_private.audit(connection public.pims_connections, action_value text, entity uuid, before_value integer, after_value integer) returns void
language sql set search_path = '' as $$
  insert into public.pims_audit_events(practice_id,connection_id,actor_id,action,entity_id,before_version,after_version)
  values(connection.practice_id,connection.id,auth.uid(),action_value,entity,before_value,after_value)
$$;

create or replace function public.pims_configure_connection(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  connection public.pims_connections;
  practice uuid;
  provider_value text;
  origin_value text;
  tenant_value text;
  domain_pattern text;
begin
  perform pims_private.keys(payload, array['practice_id','provider','origin','tenant_id'], array['practice_id','provider','origin','tenant_id','connection_id','expected_revision']);
  practice := pims_private.uuid_value(payload, 'practice_id');
  perform pims_private.require_member(practice, true);
  provider_value := pims_private.text_value(payload, 'provider');
  origin_value := pims_private.text_value(payload, 'origin');
  tenant_value := pims_private.text_value(payload, 'tenant_id');
  domain_pattern := case provider_value
    when 'ezyvet' then 'ezyvet\.com' when 'daysmart' then 'vettersoftware\.com'
    when 'instinct' then 'instinctvet\.(cloud|com)' when 'pulse' then 'evetpractice\.com'
    when 'rhapsody' then 'rhapsody\.vet' when 'shepherd' then 'shepherd\.vet' when 'vetspire' then 'vetspire\.com' end;
  if domain_pattern is null or origin_value !~ ('^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*' || domain_pattern || '$') then raise exception 'pims_invalid'; end if;
  if payload ? 'connection_id' then
    connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'), true);
    if connection.practice_id <> practice then raise exception 'pims_forbidden'; end if;
    if connection.revision <> pims_private.integer_value(payload,'expected_revision') then raise exception 'pims_conflict'; end if;
    if (connection.provider <> provider_value or connection.origin <> origin_value or connection.tenant_id <> tenant_value)
       and (exists(select 1 from public.pims_patient_links where connection_id=connection.id)
            or exists(select 1 from public.pims_clinician_links where connection_id=connection.id)) then raise exception 'pims_conflict'; end if;
    update public.pims_sync_runs set state='interrupted',finished_at=clock_timestamp() where connection_id=connection.id and state in ('capturing','saving');
    update public.pims_connections set provider=provider_value,origin=origin_value,tenant_id=tenant_value,
      state='unverified',revision=revision+1,verified_at=null where id=connection.id returning * into connection;
    perform pims_private.audit(connection,'connection_changed',connection.id,connection.revision-1,connection.revision);
  else
    insert into public.pims_connections(practice_id,provider,origin,tenant_id,created_by)
      values(practice,provider_value,origin_value,tenant_value,auth.uid()) returning * into connection;
    perform pims_private.audit(connection,'connection_created',connection.id,null,1);
  end if;
  return to_jsonb(connection);
end $$;

create or replace function public.pims_verify_connection(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; observed timestamptz;
begin
  perform pims_private.keys(payload, array['connection_id','expected_revision','provider','origin','tenant_id','observed_at'], array['connection_id','expected_revision','provider','origin','tenant_id','observed_at']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  if connection.revision <> pims_private.integer_value(payload,'expected_revision') then raise exception 'pims_conflict'; end if;
  if pims_private.text_value(payload,'provider') <> connection.provider or pims_private.text_value(payload,'origin') <> connection.origin
     or pims_private.text_value(payload,'tenant_id') <> connection.tenant_id then raise exception 'pims_identity'; end if;
  observed := pims_private.instant(payload,'observed_at');
  if observed < clock_timestamp()-interval '5 minutes' or observed > clock_timestamp() then raise exception 'pims_stale'; end if;
  update public.pims_connections set state='active',verified_at=observed,revision=revision+1 where id=connection.id returning * into connection;
  perform pims_private.audit(connection,'browser_identity_confirmed',connection.id,connection.revision-1,connection.revision);
  return to_jsonb(connection);
end $$;

create or replace function public.pims_confirm_patient(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; link public.pims_patient_links; external_id text; internal_key uuid;
begin
  perform pims_private.keys(payload,array['connection_id','patient_id','patient_key'],array['connection_id','patient_id','patient_key']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  external_id := pims_private.text_value(payload,'patient_id');
  internal_key := pims_private.uuid_value(payload,'patient_key');
  insert into public.pims_patient_groups(id,practice_id,created_by) values(internal_key,connection.practice_id,auth.uid()) on conflict(id) do nothing;
  if not exists(select 1 from public.pims_patient_groups where id=internal_key and practice_id=connection.practice_id) then raise exception 'pims_forbidden'; end if;
  select * into link from public.pims_patient_links where connection_id=connection.id and patient_id=external_id;
  if found then
    if link.patient_key <> internal_key then raise exception 'pims_conflict'; end if;
    return to_jsonb(link);
  end if;
  insert into public.pims_patient_links(practice_id,connection_id,patient_id,patient_key,created_by)
    values(connection.practice_id,connection.id,external_id,internal_key,auth.uid()) returning * into link;
  perform pims_private.audit(connection,'patient_confirmed',link.id,null,1);
  return to_jsonb(link);
end $$;

create or replace function public.pims_link_clinician(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; link public.pims_clinician_links; external_id text; target_user uuid;
begin
  perform pims_private.keys(payload,array['connection_id','clinician_id','user_id'],array['connection_id','clinician_id','user_id']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  external_id := pims_private.text_value(payload,'clinician_id');
  target_user := pims_private.uuid_value(payload,'user_id');
  perform 1 from public.practice_members where practice_id=connection.practice_id and user_id=target_user for share;
  if not found then raise exception 'pims_forbidden'; end if;
  select * into link from public.pims_clinician_links where connection_id=connection.id and clinician_id=external_id;
  if found then
    if link.user_id <> target_user then raise exception 'pims_conflict'; end if;
    return to_jsonb(link);
  end if;
  insert into public.pims_clinician_links(practice_id,connection_id,clinician_id,user_id,created_by)
    values(connection.practice_id,connection.id,external_id,target_user,auth.uid()) returning * into link;
  perform pims_private.audit(connection,'clinician_confirmed',link.id,null,1);
  return to_jsonb(link);
end $$;

create or replace function public.pims_start_sync(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; run public.pims_sync_runs; scope_value jsonb; request uuid; started timestamptz;
begin
  perform pims_private.keys(payload,array['connection_id','request_id','scope'],array['connection_id','request_id','scope']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  if not (select pims_send_enabled from public.practices where id=connection.practice_id) then raise exception 'pims_disabled'; end if;
  if connection.state <> 'active' then raise exception 'pims_unverified'; end if;
  scope_value := pims_private.scope(payload->'scope');
  request := pims_private.uuid_value(payload,'request_id');
  select * into run from public.pims_sync_runs where id=request;
  if found then
    if run.connection_id <> connection.id or run.actor_id <> auth.uid() or run.scope <> scope_value or run.connection_revision <> connection.revision then raise exception 'pims_idempotency'; end if;
    return to_jsonb(run);
  end if;
  started := clock_timestamp();
  if exists(select 1 from public.pims_sync_runs where connection_id=connection.id and state in ('capturing','saving') and expires_at>started) then raise exception 'pims_busy'; end if;
  update public.pims_sync_runs set state='expired',finished_at=started where connection_id=connection.id and state in ('capturing','saving');
  update public.pims_connections set generation=generation+1 where id=connection.id returning * into connection;
  insert into public.pims_sync_runs(id,practice_id,connection_id,actor_id,connection_revision,generation,scope,scope_hash,started_at,expires_at)
    values(request,connection.practice_id,connection.id,auth.uid(),connection.revision,connection.generation,scope_value,pims_private.hash(scope_value),started,started+interval '5 minutes') returning * into run;
  return to_jsonb(run);
end $$;

create or replace function pims_private.lock_run(payload jsonb) returns public.pims_sync_runs
language plpgsql set search_path = '' as $$
declare connection public.pims_connections; run public.pims_sync_runs;
begin
  select * into run from public.pims_sync_runs where id=pims_private.uuid_value(payload,'run_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(run.connection_id);
  select * into run from public.pims_sync_runs where id=run.id for update;
  if run.actor_id <> auth.uid() then raise exception 'pims_forbidden'; end if;
  if not (select pims_send_enabled from public.practices where id=connection.practice_id) then raise exception 'pims_disabled'; end if;
  if connection.state <> 'active' or run.connection_revision <> connection.revision or run.generation <> connection.generation
     or run.generation <> pims_private.integer_value(payload,'generation') then raise exception 'pims_stale'; end if;
  return run;
end $$;

create or replace function public.pims_sync_baseline(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.pims_sync_runs; collection_value text; after_id uuid; entries jsonb; next_cursor text;
begin
  perform pims_private.keys(payload,array['run_id','generation','collection'],array['run_id','generation','collection','cursor']);
  run := pims_private.lock_run(payload);
  if run.state <> 'capturing' or run.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  collection_value := pims_private.text_value(payload,'collection');
  if collection_value not in ('patient_links','clinician_links','visits') then raise exception 'pims_invalid'; end if;
  if payload ? 'cursor' then after_id := pims_private.uuid_value(payload,'cursor'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('cursor',id,'external_id',external_id,'version',version) order by id),'[]'::jsonb) into entries
  from (
    select id,patient_id as external_id,version from public.pims_patient_links where collection_value='patient_links' and connection_id=run.connection_id and (after_id is null or id>after_id)
    union all
    select id,clinician_id as external_id,version from public.pims_clinician_links where collection_value='clinician_links' and connection_id=run.connection_id and (after_id is null or id>after_id)
    union all
    select id,appointment_id as external_id,version from public.pims_visits where collection_value='visits' and connection_id=run.connection_id and (after_id is null or id>after_id)
    order by id limit 1001
  ) candidates;
  if jsonb_array_length(entries)>1000 then next_cursor := entries->999->>'cursor'; end if;
  select coalesce(jsonb_agg(value-'cursor' order by ordinal),'[]'::jsonb) into entries
    from jsonb_array_elements(entries) with ordinality as page(value,ordinal) where ordinal<=1000;
  return jsonb_build_object('rows',entries,'next_cursor',next_cursor);
end $$;

create or replace function public.pims_submit_sync(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.pims_sync_runs;
  connection public.pims_connections;
  previous public.pims_sync_chunks;
  patient public.pims_patient_links;
  clinician public.pims_clinician_links;
  visit public.pims_visits;
  request uuid;
  captured timestamptz;
  normalized jsonb;
  entry jsonb;
  normalized_items jsonb := '[]'::jsonb;
  outcomes jsonb := '[]'::jsonb;
  result jsonb;
  issue_reason text;
  outcome text;
  source_hash text;
  starts timestamptz;
  ends timestamptz;
  expected integer;
begin
  perform pims_private.keys(payload,array['run_id','generation','request_id','captured_at','identity','scope','items'],array['run_id','generation','request_id','captured_at','identity','scope','items']);
  run := pims_private.lock_run(payload);
  select * into connection from public.pims_connections where id=run.connection_id;
  request := pims_private.uuid_value(payload,'request_id');
  captured := pims_private.instant(payload,'captured_at');
  perform pims_private.keys(payload->'identity',array['provider','origin','tenant_id','connection_revision'],array['provider','origin','tenant_id','connection_revision']);
  if pims_private.text_value(payload->'identity','provider') <> connection.provider or pims_private.text_value(payload->'identity','origin') <> connection.origin
     or pims_private.text_value(payload->'identity','tenant_id') <> connection.tenant_id
     or pims_private.integer_value(payload->'identity','connection_revision') <> connection.revision then raise exception 'pims_identity'; end if;
  if pims_private.scope(payload->'scope') <> run.scope then raise exception 'pims_invalid'; end if;
  if captured < run.started_at or captured > clock_timestamp() then raise exception 'pims_stale'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items')>100 then raise exception 'pims_invalid'; end if;
  for entry in select value from jsonb_array_elements(payload->'items') loop
    perform pims_private.keys(entry,array['appointment_id','patient_id','clinician_id','encounter_id','starts_at','ends_at','status','expected_version','patient_link_version','clinician_link_version'],array['appointment_id','patient_id','clinician_id','encounter_id','starts_at','ends_at','status','expected_version','patient_link_version','clinician_link_version']);
    perform pims_private.text_value(entry,'appointment_id');
    perform pims_private.text_value(entry,'patient_id');
    perform pims_private.text_value(entry,'clinician_id');
    if entry->'encounter_id' <> 'null'::jsonb then perform pims_private.text_value(entry,'encounter_id'); end if;
    if pims_private.text_value(entry,'status') not in ('active','cancelled','deleted','unknown') then raise exception 'pims_invalid'; end if;
    perform pims_private.integer_value(entry,'expected_version');
    perform pims_private.integer_value(entry,'patient_link_version');
    perform pims_private.integer_value(entry,'clinician_link_version');
    starts := pims_private.instant(entry,'starts_at'); ends := case when entry->'ends_at'='null'::jsonb then null else pims_private.instant(entry,'ends_at') end;
    if ends<=starts or ends-starts>interval '26 hours' or starts<(run.scope->>'window_start')::timestamptz
       or starts>=(run.scope->>'window_end')::timestamptz then raise exception 'pims_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(normalized_items) previous_item where previous_item->>'appointment_id'=entry->>'appointment_id') then raise exception 'pims_invalid'; end if;
    normalized_items := normalized_items || jsonb_build_array(entry || jsonb_build_object('starts_at',starts,'ends_at',ends));
  end loop;
  normalized := payload || jsonb_build_object('scope',run.scope,'captured_at',captured,'items',normalized_items);
  select * into previous from public.pims_sync_chunks where request_id=request;
  if found then
    if previous.run_id <> run.id or previous.payload_hash <> pims_private.hash(normalized) then raise exception 'pims_idempotency'; end if;
    return previous.result;
  end if;
  if run.state not in ('capturing','saving') or run.sealed_at is not null or clock_timestamp()>=run.expires_at then raise exception 'pims_stale'; end if;
  for entry in select value from jsonb_array_elements(normalized_items) loop
    issue_reason := null; outcome := 'skipped';
    select * into visit from public.pims_visits where connection_id=connection.id and appointment_id=entry->>'appointment_id';
    select * into patient from public.pims_patient_links where connection_id=connection.id and patient_id=entry->>'patient_id';
    select * into clinician from public.pims_clinician_links where connection_id=connection.id and clinician_id=entry->>'clinician_id';
    expected := (entry->>'expected_version')::integer;
    if entry->>'status' <> 'active' then issue_reason := 'status_requires_review';
    elsif patient.id is null then issue_reason := 'patient_unlinked';
    elsif clinician.id is null then issue_reason := 'clinician_unlinked';
    else
      perform 1 from public.practice_members where practice_id=connection.practice_id and user_id=clinician.user_id for share;
      if not found then issue_reason := 'clinician_unlinked';
      elsif patient.version <> (entry->>'patient_link_version')::integer or clinician.version <> (entry->>'clinician_link_version')::integer then issue_reason := 'link_version'; outcome := 'conflict';
      elsif coalesce(visit.version,0) <> expected then issue_reason := 'visit_version'; outcome := 'conflict';
      elsif visit.id is not null and (visit.patient_link_id <> patient.id or visit.clinician_link_id <> clinician.id or visit.encounter_id is distinct from (entry->>'encounter_id')) then issue_reason := 'identity_changed'; outcome := 'conflict';
      elsif visit.archived_at is not null then issue_reason := 'archived_requires_review';
      end if;
    end if;
    if issue_reason is not null then
      insert into public.pims_sync_issues(practice_id,connection_id,run_id,appointment_id,reason,visit_version,patient_link_version,clinician_link_version,proposal_hash,proposed)
        values(connection.practice_id,connection.id,run.id,entry->>'appointment_id',issue_reason,coalesce(visit.version,0),coalesce(patient.version,0),coalesce(clinician.version,0),pims_private.hash(entry),entry)
        on conflict(run_id,connection_id,appointment_id,reason,visit_version,patient_link_version,clinician_link_version,proposal_hash) do nothing;
      outcomes := outcomes || jsonb_build_array(jsonb_build_object('appointment_id',entry->>'appointment_id','outcome',outcome,'reason',issue_reason,'version',coalesce(visit.version,0)));
      continue;
    end if;
    source_hash := pims_private.hash(entry - array['expected_version','patient_link_version','clinician_link_version']);
    if visit.id is null then
      insert into public.pims_visits(practice_id,connection_id,appointment_id,patient_link_id,patient_link_version,clinician_link_id,clinician_link_version,encounter_id,starts_at,ends_at,source_hash,last_seen_run_id)
        values(connection.practice_id,connection.id,entry->>'appointment_id',patient.id,patient.version,clinician.id,clinician.version,entry->>'encounter_id',(entry->>'starts_at')::timestamptz,(entry->>'ends_at')::timestamptz,source_hash,run.id) returning * into visit;
      outcome := 'applied';
    elsif visit.source_hash = source_hash then
      update public.pims_visits set last_seen_run_id=run.id where id=visit.id;
      outcome := 'unchanged';
    else
      update public.pims_visits set starts_at=(entry->>'starts_at')::timestamptz,ends_at=(entry->>'ends_at')::timestamptz,
        source_hash=pims_private.hash(entry - array['expected_version','patient_link_version','clinician_link_version']),version=version+1,last_seen_run_id=run.id where id=visit.id returning * into visit;
      outcome := 'applied';
    end if;
    outcomes := outcomes || jsonb_build_array(jsonb_build_object('appointment_id',entry->>'appointment_id','outcome',outcome,'version',visit.version));
  end loop;
  if clock_timestamp()>=run.expires_at then raise exception 'pims_stale'; end if;
  result := jsonb_build_object('run_id',run.id,'request_id',request,'outcomes',outcomes);
  insert into public.pims_sync_chunks(request_id,practice_id,connection_id,run_id,payload_hash,result)
    values(request,connection.practice_id,connection.id,run.id,pims_private.hash(normalized),result);
  update public.pims_sync_runs set state='saving',chunk_count=chunk_count+1 where id=run.id;
  return result;
end $$;

create or replace function public.pims_finish_sync(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.pims_sync_runs; target_state text; completeness_value text;
begin
  perform pims_private.keys(payload,array['run_id','generation','state','completeness'],array['run_id','generation','state','completeness']);
  run := pims_private.lock_run(payload);
  target_state := pims_private.text_value(payload,'state');
  completeness_value := pims_private.text_value(payload,'completeness');
  if target_state not in ('completed','abandoned') or completeness_value not in ('complete','partial','unknown')
     or (target_state='abandoned' and completeness_value<>'unknown') then raise exception 'pims_invalid'; end if;
  if run.state in ('completed','abandoned') then
    if run.state <> target_state or run.completeness <> completeness_value then raise exception 'pims_idempotency'; end if;
    return to_jsonb(run);
  end if;
  if run.state not in ('capturing','saving') or run.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  if target_state='completed' and run.chunk_count=0 then raise exception 'pims_invalid'; end if;
  if target_state='completed' and run.sealed_at is not null and run.completeness<>completeness_value then raise exception 'pims_invalid'; end if;
  update public.pims_sync_runs set state=target_state,completeness=completeness_value,finished_at=clock_timestamp() where id=run.id returning * into run;
  return to_jsonb(run);
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$
declare function_name text;
begin
  foreach function_name in array array['pims_configure_connection','pims_verify_connection','pims_confirm_patient','pims_link_clinician','pims_start_sync','pims_sync_baseline','pims_submit_sync','pims_finish_sync'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;

commit;
