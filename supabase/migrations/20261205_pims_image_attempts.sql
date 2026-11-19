begin;

create table if not exists public.pims_image_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  practice_id uuid not null references public.practices(id),
  connection_id uuid not null,
  connection_revision integer not null,
  chart_id uuid not null references public.charts(id),
  chart_link_version integer not null,
  image_id uuid not null,
  image_snapshot jsonb not null,
  source_hash text not null,
  patient_id text not null,
  encounter_id text not null,
  destination text not null,
  document_generation text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content_bytes integer not null check (content_bytes between 24 and 2097152),
  identity jsonb not null,
  payload_hash text not null,
  actor_id uuid not null references auth.users(id),
  state text not null default 'prepared' check (state in ('prepared','expired','unknown','confirmed')),
  resource_id text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
  dispatched_at timestamptz,
  confirmed_at timestamptz,
  foreign key (connection_id,practice_id) references public.pims_connections(id,practice_id),
  check ((state in ('prepared','expired') and dispatched_at is null and confirmed_at is null and resource_id is null)
    or (state='unknown' and dispatched_at is not null and confirmed_at is null and resource_id is null)
    or (state='confirmed' and dispatched_at is not null and confirmed_at is not null and resource_id is not null))
);
create unique index if not exists pims_image_attempts_active_target on public.pims_image_attempts
  (connection_id,patient_id,encounter_id,destination,content_hash) where state<>'expired';
alter table public.pims_image_attempts enable row level security;
revoke all on public.pims_image_attempts from public, anon, authenticated, service_role;
grant select on public.pims_image_attempts to authenticated;
drop policy if exists pims_member_read on public.pims_image_attempts;
create policy pims_member_read on public.pims_image_attempts for select to authenticated
  using (public.pims_draft_readable(chart_id,practice_id));

create or replace function pims_private.image_transfer_fresh(attempt public.pims_image_attempts) returns void
language plpgsql set search_path = '' as $$
declare connection public.pims_connections; source jsonb; link public.pims_chart_links; image public.attachments;
begin
  connection := pims_private.lock_connection(attempt.connection_id);
  if connection.practice_id<>attempt.practice_id then raise exception 'pims_forbidden'; end if;
  if connection.state<>'active' or connection.provider<>'ezyvet' then raise exception 'pims_unverified'; end if;
  if connection.revision<>attempt.connection_revision or attempt.identity<>jsonb_build_object('provider',connection.provider,
    'origin',connection.origin,'tenant_id',connection.tenant_id,'connection_revision',connection.revision) then raise exception 'pims_identity'; end if;
  if not (select pims_send_enabled from public.practices where id=connection.practice_id) then raise exception 'pims_disabled'; end if;
  source := pims_private.draft_source(attempt.chart_id);
  if source->>'practice_id'<>attempt.practice_id::text then raise exception 'pims_forbidden'; end if;
  if source->>'hash'<>attempt.source_hash then raise exception 'pims_stale'; end if;
  select * into link from public.pims_chart_links where connection_id=connection.id and chart_id=attempt.chart_id for share;
  if not found or link.patient_id<>attempt.patient_id or link.version<>attempt.chart_link_version then raise exception 'pims_identity'; end if;
  select * into image from public.attachments where id=attempt.image_id and chart_id=attempt.chart_id for share;
  if not found or to_jsonb(image)<>attempt.image_snapshot then raise exception 'pims_stale'; end if;
end $$;

create or replace function public.pims_prepare_image_transfer(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_image_attempts; previous public.pims_image_attempts; connection public.pims_connections; image public.attachments;
begin
  perform pims_private.keys(payload,
    array['request_id','connection_id','connection_revision','chart_id','chart_link_version','image_id','source_hash','patient_id','encounter_id','destination','document_generation','content_hash','content_bytes'],
    array['request_id','connection_id','connection_revision','chart_id','chart_link_version','image_id','source_hash','patient_id','encounter_id','destination','document_generation','content_hash','content_bytes']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  attempt.request_id := pims_private.uuid_value(payload,'request_id');
  perform pg_advisory_xact_lock(hashtextextended(attempt.request_id::text,0));
  attempt.practice_id := connection.practice_id;
  attempt.connection_id := connection.id;
  attempt.connection_revision := pims_private.integer_value(payload,'connection_revision');
  attempt.chart_id := pims_private.uuid_value(payload,'chart_id');
  attempt.chart_link_version := pims_private.integer_value(payload,'chart_link_version');
  attempt.image_id := pims_private.uuid_value(payload,'image_id');
  attempt.source_hash := pims_private.text_value(payload,'source_hash');
  attempt.patient_id := pims_private.text_value(payload,'patient_id');
  attempt.encounter_id := pims_private.text_value(payload,'encounter_id');
  attempt.destination := pims_private.text_value(payload,'destination');
  attempt.document_generation := pims_private.text_value(payload,'document_generation');
  attempt.content_hash := pims_private.text_value(payload,'content_hash');
  attempt.content_bytes := pims_private.integer_value(payload,'content_bytes');
  if attempt.content_hash!~'^[a-f0-9]{64}$' or attempt.content_bytes not between 24 and 2097152 then raise exception 'pims_invalid'; end if;
  attempt.identity := jsonb_build_object('provider',connection.provider,'origin',connection.origin,'tenant_id',connection.tenant_id,'connection_revision',connection.revision);
  perform pims_private.draft_source(attempt.chart_id);
  select * into image from public.attachments where id=attempt.image_id and chart_id=attempt.chart_id for share;
  if not found or image.path!~'^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$'
    or split_part(image.path,'/',2)<>attempt.chart_id::text or image.path is not distinct from image.original_path
    or image.kind not in ('photo','xray') then raise exception 'pims_invalid'; end if;
  attempt.image_snapshot := to_jsonb(image);
  perform pims_private.image_transfer_fresh(attempt);
  select * into previous from public.pims_image_attempts where request_id=attempt.request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.payload_hash<>pims_private.hash(payload) then raise exception 'pims_idempotency'; end if;
    return jsonb_build_object('created',false,'attempt',to_jsonb(previous));
  end if;
  select * into previous from public.pims_image_attempts where connection_id=connection.id and patient_id=attempt.patient_id
    and encounter_id=attempt.encounter_id and destination=attempt.destination and content_hash=attempt.content_hash and state<>'expired' for update;
  if found then
    if not public.pims_draft_readable(previous.chart_id,previous.practice_id) then raise exception 'pims_forbidden'; end if;
    if previous.state='prepared' and previous.dispatched_at is null and previous.expires_at<=clock_timestamp() then
      update public.pims_image_attempts set state='expired' where id=previous.id;
      perform pims_private.audit(connection,'image_expired',previous.id,1,2);
    else
      return jsonb_build_object('created',false,'attempt',to_jsonb(previous));
    end if;
  end if;
  insert into public.pims_image_attempts(request_id,practice_id,connection_id,connection_revision,chart_id,chart_link_version,image_id,image_snapshot,
    source_hash,patient_id,encounter_id,destination,document_generation,content_hash,content_bytes,identity,payload_hash,actor_id)
  values(attempt.request_id,attempt.practice_id,attempt.connection_id,attempt.connection_revision,attempt.chart_id,attempt.chart_link_version,attempt.image_id,attempt.image_snapshot,
    attempt.source_hash,attempt.patient_id,attempt.encounter_id,attempt.destination,attempt.document_generation,attempt.content_hash,attempt.content_bytes,attempt.identity,pims_private.hash(payload),auth.uid()) returning * into attempt;
  perform pims_private.audit(connection,'image_prepared',attempt.id,0,1);
  return jsonb_build_object('created',true,'attempt',to_jsonb(attempt));
end $$;

create or replace function public.pims_dispatch_image_transfer(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_image_attempts; connection public.pims_connections;
begin
  perform pims_private.keys(payload,array['attempt_id'],array['attempt_id']);
  select * into attempt from public.pims_image_attempts where id=pims_private.uuid_value(payload,'attempt_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(attempt.connection_id);
  select * into attempt from public.pims_image_attempts where id=attempt.id for update;
  if attempt.actor_id<>auth.uid() then raise exception 'pims_forbidden'; end if;
  perform pims_private.require_member(attempt.practice_id);
  if not public.pims_draft_readable(attempt.chart_id,attempt.practice_id) then raise exception 'pims_forbidden'; end if;
  if attempt.state<>'prepared' then return jsonb_build_object('execute',false,'attempt',to_jsonb(attempt)); end if;
  if attempt.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  perform pims_private.image_transfer_fresh(attempt);
  update public.pims_image_attempts set state='unknown',dispatched_at=clock_timestamp() where id=attempt.id returning * into attempt;
  perform pims_private.audit(connection,'image_dispatched',attempt.id,1,2);
  return jsonb_build_object('execute',true,'attempt',to_jsonb(attempt));
end $$;

create or replace function public.pims_confirm_image_transfer(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.pims_image_attempts; connection public.pims_connections; resource_value text;
begin
  perform pims_private.keys(payload,array['attempt_id','resource_id','content_hash'],array['attempt_id','resource_id','content_hash']);
  select * into attempt from public.pims_image_attempts where id=pims_private.uuid_value(payload,'attempt_id');
  if not found then raise exception 'pims_forbidden'; end if;
  connection := pims_private.lock_connection(attempt.connection_id);
  select * into attempt from public.pims_image_attempts where id=attempt.id for update;
  if attempt.actor_id<>auth.uid() then raise exception 'pims_forbidden'; end if;
  perform pims_private.image_transfer_fresh(attempt);
  resource_value := pims_private.text_value(payload,'resource_id');
  if attempt.content_hash<>pims_private.text_value(payload,'content_hash') then raise exception 'pims_identity'; end if;
  if attempt.state='confirmed' and attempt.resource_id=resource_value then return to_jsonb(attempt); end if;
  if attempt.state<>'unknown' then raise exception 'pims_conflict'; end if;
  update public.pims_image_attempts set state='confirmed',resource_id=resource_value,confirmed_at=clock_timestamp() where id=attempt.id returning * into attempt;
  perform pims_private.audit(connection,'image_confirmed',attempt.id,2,3);
  return to_jsonb(attempt);
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$ declare function_name text; begin
  foreach function_name in array array['pims_prepare_image_transfer','pims_dispatch_image_transfer','pims_confirm_image_transfer'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;
commit;
