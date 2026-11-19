begin;

alter table public.pims_visits alter column ends_at drop not null;

create table if not exists public.pims_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  practice_id uuid not null references public.practices(id),
  connection_id uuid not null,
  connection_revision integer not null,
  chart_id uuid not null references public.charts(id) on delete cascade,
  draft_id uuid not null references public.pims_drafts(id),
  draft_version integer not null,
  patient_id text not null,
  chart_link_version integer not null,
  location_id text not null,
  endpoint text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content_bytes integer not null check (content_bytes between 1 and 2097152),
  source_hash text not null,
  identity jsonb not null,
  payload_hash text not null,
  state text not null default 'prepared' check (state in ('prepared','unknown','confirmed')),
  file_id text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
  dispatched_at timestamptz,
  confirmed_at timestamptz,
  foreign key (connection_id,practice_id) references public.pims_connections(id,practice_id),
  unique(connection_id,draft_id,draft_version,patient_id,location_id),
  unique(connection_id,patient_id,location_id,content_hash),
  check ((state='prepared' and dispatched_at is null and confirmed_at is null and file_id is null)
    or (state='unknown' and dispatched_at is not null and confirmed_at is null and file_id is null)
    or (state='confirmed' and dispatched_at is not null and confirmed_at is not null and file_id is not null))
);
alter table public.pims_upload_attempts enable row level security;
revoke all on public.pims_upload_attempts from public, anon, authenticated, service_role;
grant select on public.pims_upload_attempts to authenticated;
drop policy if exists pims_member_read on public.pims_upload_attempts;
create policy pims_member_read on public.pims_upload_attempts for select to authenticated
  using (public.pims_draft_readable(chart_id,practice_id));

create or replace function pims_private.upload_fresh(attempt public.pims_upload_attempts) returns void
language plpgsql set search_path = '' as $$
declare connection public.pims_connections; draft jsonb; link public.pims_chart_links;
begin
  connection := pims_private.lock_connection(attempt.connection_id);
  if connection.practice_id<>attempt.practice_id then raise exception 'pims_forbidden'; end if;
  if connection.state<>'active' or connection.provider<>'instinct' then raise exception 'pims_unverified'; end if;
  if connection.revision<>attempt.connection_revision or attempt.identity<>jsonb_build_object('provider',connection.provider,
    'origin',connection.origin,'tenant_id',connection.tenant_id,'connection_revision',connection.revision) then raise exception 'pims_identity'; end if;
  if not (select pims_send_enabled from public.practices where id=connection.practice_id) then raise exception 'pims_disabled'; end if;
  draft := public.pims_draft_export(jsonb_build_object('chart_id',attempt.chart_id,'draft_id',attempt.draft_id,'expected_version',attempt.draft_version));
  if draft->>'source_hash'<>attempt.source_hash then raise exception 'pims_stale'; end if;
  select * into link from public.pims_chart_links where connection_id=connection.id and chart_id=attempt.chart_id for share;
  if not found or link.patient_id<>attempt.patient_id or link.version<>attempt.chart_link_version then raise exception 'pims_identity'; end if;
end $$;

create or replace function public.pims_prepare_upload(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_upload_attempts; previous public.pims_upload_attempts; connection public.pims_connections; draft jsonb;
begin
  perform pims_private.keys(payload,array['request_id','connection_id','connection_revision','chart_id','draft_id','draft_version','patient_id','chart_link_version','location_id','endpoint','content_hash','content_bytes'],
    array['request_id','connection_id','connection_revision','chart_id','draft_id','draft_version','patient_id','chart_link_version','location_id','endpoint','content_hash','content_bytes']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  attempt.request_id := pims_private.uuid_value(payload,'request_id');
  perform pg_advisory_xact_lock(hashtextextended(attempt.request_id::text,0));
  attempt.connection_id := connection.id;
  attempt.practice_id := connection.practice_id;
  attempt.connection_revision := pims_private.integer_value(payload,'connection_revision');
  attempt.chart_id := pims_private.uuid_value(payload,'chart_id');
  attempt.draft_id := pims_private.uuid_value(payload,'draft_id');
  attempt.draft_version := pims_private.integer_value(payload,'draft_version');
  attempt.patient_id := pims_private.text_value(payload,'patient_id');
  attempt.chart_link_version := pims_private.integer_value(payload,'chart_link_version');
  attempt.location_id := pims_private.text_value(payload,'location_id');
  attempt.endpoint := pims_private.text_value(payload,'endpoint');
  if attempt.endpoint !~ '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*instinctvet\.(cloud|com)/[a-zA-Z0-9/_-]*$' then raise exception 'pims_invalid'; end if;
  attempt.content_hash := pims_private.text_value(payload,'content_hash');
  attempt.content_bytes := pims_private.integer_value(payload,'content_bytes');
  if attempt.content_hash !~ '^[a-f0-9]{64}$' or attempt.content_bytes not between 1 and 2097152 then raise exception 'pims_invalid'; end if;
  attempt.identity := jsonb_build_object('provider',connection.provider,'origin',connection.origin,'tenant_id',connection.tenant_id,'connection_revision',connection.revision);
  draft := public.pims_draft_export(jsonb_build_object('chart_id',attempt.chart_id,'draft_id',attempt.draft_id,'expected_version',attempt.draft_version));
  if (draft->>'practice_id')::uuid<>connection.practice_id then raise exception 'pims_forbidden'; end if;
  attempt.source_hash := draft->>'source_hash';
  perform pims_private.upload_fresh(attempt);
  select * into previous from public.pims_upload_attempts where request_id=attempt.request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.payload_hash<>pims_private.hash(payload) then raise exception 'pims_idempotency'; end if;
    return jsonb_build_object('created',false,'attempt',to_jsonb(previous));
  end if;
  select * into previous from public.pims_upload_attempts where connection_id=connection.id and patient_id=attempt.patient_id and location_id=attempt.location_id
    and ((draft_id=attempt.draft_id and draft_version=attempt.draft_version) or content_hash=attempt.content_hash) order by created_at limit 1;
  if found then
    if not public.pims_draft_readable(previous.chart_id,previous.practice_id) then raise exception 'pims_forbidden'; end if;
    return jsonb_build_object('created',false,'attempt',to_jsonb(previous));
  end if;
  insert into public.pims_upload_attempts(request_id,practice_id,connection_id,connection_revision,chart_id,draft_id,draft_version,
    patient_id,chart_link_version,location_id,endpoint,content_hash,content_bytes,source_hash,identity,payload_hash,actor_id)
  values(attempt.request_id,attempt.practice_id,attempt.connection_id,attempt.connection_revision,attempt.chart_id,attempt.draft_id,attempt.draft_version,
    attempt.patient_id,attempt.chart_link_version,attempt.location_id,attempt.endpoint,attempt.content_hash,attempt.content_bytes,attempt.source_hash,attempt.identity,pims_private.hash(payload),auth.uid()) returning * into attempt;
  perform pims_private.audit(connection,'upload_prepared',attempt.id,0,1);
  return jsonb_build_object('created',true,'attempt',to_jsonb(attempt));
end $$;

create or replace function public.pims_dispatch_upload(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_upload_attempts; connection public.pims_connections;
begin
  perform pims_private.keys(payload,array['attempt_id'],array['attempt_id']);
  select * into attempt from public.pims_upload_attempts where id=pims_private.uuid_value(payload,'attempt_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(attempt.connection_id);
  select * into attempt from public.pims_upload_attempts where id=attempt.id for update;
  if attempt.actor_id<>auth.uid() then raise exception 'pims_forbidden'; end if;
  perform pims_private.require_member(attempt.practice_id);
  if attempt.state<>'prepared' then return jsonb_build_object('execute',false,'attempt',to_jsonb(attempt)); end if;
  if attempt.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  perform pims_private.upload_fresh(attempt);
  update public.pims_upload_attempts set state='unknown',dispatched_at=clock_timestamp() where id=attempt.id returning * into attempt;
  perform pims_private.audit(connection,'upload_dispatched',attempt.id,1,2);
  return jsonb_build_object('execute',true,'attempt',to_jsonb(attempt));
end $$;

create or replace function public.pims_confirm_upload(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_upload_attempts; connection public.pims_connections; file_value text;
begin
  perform pims_private.keys(payload,array['attempt_id','file_id','patient_id','content_hash'],array['attempt_id','file_id','patient_id','content_hash']);
  select * into attempt from public.pims_upload_attempts where id=pims_private.uuid_value(payload,'attempt_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(attempt.connection_id);
  select * into attempt from public.pims_upload_attempts where id=attempt.id for update;
  if attempt.actor_id<>auth.uid() then raise exception 'pims_forbidden'; end if;
  perform pims_private.upload_fresh(attempt);
  file_value := pims_private.text_value(payload,'file_id');
  if attempt.patient_id<>pims_private.text_value(payload,'patient_id') or attempt.content_hash<>pims_private.text_value(payload,'content_hash') then raise exception 'pims_identity'; end if;
  if attempt.state='confirmed' and attempt.file_id=file_value then return to_jsonb(attempt); end if;
  if attempt.state<>'unknown' then raise exception 'pims_conflict'; end if;
  update public.pims_upload_attempts set state='confirmed',file_id=file_value,confirmed_at=clock_timestamp() where id=attempt.id returning * into attempt;
  perform pims_private.audit(connection,'upload_confirmed',attempt.id,2,3);
  return to_jsonb(attempt);
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$ declare function_name text; begin
  foreach function_name in array array['pims_prepare_upload','pims_dispatch_upload','pims_confirm_upload'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;
commit;
