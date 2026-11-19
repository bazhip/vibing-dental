begin;

create table if not exists public.pims_chart_links (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null,
  connection_id uuid not null,
  chart_id uuid not null references public.charts(id) on delete cascade,
  patient_id text not null,
  version integer not null default 1 check (version > 0),
  reason text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id,practice_id) references public.pims_connections(id,practice_id),
  foreign key (connection_id,patient_id) references public.pims_patient_links(connection_id,patient_id),
  unique(connection_id,chart_id)
);

create table if not exists public.pims_setup_actions (
  request_id uuid primary key,
  connection_id uuid not null,
  practice_id uuid not null references public.practices(id),
  chart_id uuid not null references public.charts(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id,practice_id) references public.pims_connections(id,practice_id)
);

do $$ declare table_name text; begin
  foreach table_name in array array['pims_chart_links','pims_setup_actions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('drop policy if exists pims_member_read on public.%I',table_name);
    execute format('create policy pims_member_read on public.%I for select to authenticated using (public.pims_draft_readable(chart_id,practice_id))',table_name);
  end loop;
end $$;

create or replace function public.pims_setup_context(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare practice uuid; connections jsonb; members jsonb;
begin
  perform pims_private.keys(payload,array['practice_id'],array['practice_id']);
  practice := pims_private.uuid_value(payload,'practice_id');
  perform pims_private.require_member(practice,true);
  if (select count(*) from public.pims_connections where practice_id=practice)>100
    or (select count(*) from public.practice_members where practice_id=practice)>200 then raise exception 'pims_limit'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'provider',provider,'origin',origin,'tenant_id',tenant_id,
    'revision',revision,'state',state) order by provider,origin,tenant_id),'[]') into connections from public.pims_connections where practice_id=practice;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id) order by user_id),'[]') into members from public.practice_members where practice_id=practice;
  return jsonb_build_object('connections',connections,'members',members);
end $$;

create or replace function public.pims_setup_page(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; collection text; cursor_value text; rows_value jsonb; next_value text;
begin
  perform pims_private.keys(payload,array['connection_id','collection'],array['connection_id','collection','cursor']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  collection := pims_private.text_value(payload,'collection');
  cursor_value := case when payload ? 'cursor' then pims_private.text_value(payload,'cursor') else '' end;
  if collection='patients' then
    select coalesce(jsonb_agg(to_jsonb(selected) order by selected.patient_id),'[]') into rows_value from (
      select patient_id,patient_key,version from public.pims_patient_links where connection_id=connection.id
        and patient_id>cursor_value order by patient_id limit 51
    ) selected;
    if jsonb_array_length(rows_value)>50 then next_value := rows_value->49->>'patient_id'; end if;
  elsif collection='clinicians' then
    select coalesce(jsonb_agg(to_jsonb(selected) order by selected.clinician_id),'[]') into rows_value from (
      select clinician_id,user_id,version from public.pims_clinician_links where connection_id=connection.id
        and clinician_id>cursor_value order by clinician_id limit 51
    ) selected;
    if jsonb_array_length(rows_value)>50 then next_value := rows_value->49->>'clinician_id'; end if;
  elsif collection='charts' then
    if cursor_value<>'' then perform pims_private.uuid_value(payload,'cursor'); end if;
    select coalesce(jsonb_agg(to_jsonb(selected) order by selected.chart_id),'[]') into rows_value from (
      select chart.id as chart_id,chart.patient_name,chart.patient_number,chart.chart_date,
        pims_private.draft_source(chart.id)->>'hash' as source_hash,link.patient_id,coalesce(link.version,0) as version
      from public.charts chart left join public.pims_chart_links link on link.chart_id=chart.id and link.connection_id=connection.id
      where chart.practice_id=connection.practice_id and (cursor_value='' or chart.id>nullif(cursor_value,'')::uuid)
      order by chart.id limit 51
    ) selected;
    if jsonb_array_length(rows_value)>50 then next_value := rows_value->49->>'chart_id'; end if;
  else raise exception 'pims_invalid'; end if;
  if jsonb_array_length(rows_value)>50 then rows_value := rows_value - 50; end if;
  return jsonb_build_object('rows',rows_value,'next_cursor',next_value);
end $$;

create or replace function public.pims_link_chart(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; source_value jsonb; link public.pims_chart_links;
  receipt public.pims_setup_actions; request uuid; chart uuid; external_patient text; expected integer; reason_value text;
begin
  perform pims_private.keys(payload,array['connection_id','chart_id','patient_id','expected_version','source_hash','request_id','reason'],
    array['connection_id','chart_id','patient_id','expected_version','source_hash','request_id','reason']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  chart := pims_private.uuid_value(payload,'chart_id');
  request := pims_private.uuid_value(payload,'request_id');
  external_patient := pims_private.text_value(payload,'patient_id');
  expected := pims_private.integer_value(payload,'expected_version');
  reason_value := pims_private.text_value(payload,'reason');
  source_value := pims_private.draft_source(chart);
  if (source_value->>'practice_id')::uuid<>connection.practice_id then raise exception 'pims_forbidden'; end if;
  select * into receipt from public.pims_setup_actions where request_id=request;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.connection_id<>connection.id or receipt.payload_hash<>pims_private.hash(payload) then raise exception 'pims_idempotency'; end if;
    return receipt.result;
  end if;
  if source_value->>'hash'<>pims_private.text_value(payload,'source_hash') then raise exception 'pims_stale'; end if;
  if not exists(select 1 from public.pims_patient_links where connection_id=connection.id and patient_id=external_patient) then raise exception 'pims_identity'; end if;
  select * into link from public.pims_chart_links where connection_id=connection.id and chart_id=chart for update;
  if coalesce(link.version,0)<>expected then raise exception 'pims_conflict'; end if;
  if link.id is null then
    insert into public.pims_chart_links(practice_id,connection_id,chart_id,patient_id,reason,updated_by)
      values(connection.practice_id,connection.id,chart,external_patient,reason_value,auth.uid()) returning * into link;
  else
    update public.pims_chart_links set patient_id=external_patient,version=version+1,reason=reason_value,updated_by=auth.uid(),updated_at=clock_timestamp()
      where id=link.id returning * into link;
  end if;
  perform pims_private.audit(connection,'chart_linked',link.id,expected,link.version);
  insert into public.pims_setup_actions(request_id,connection_id,practice_id,chart_id,actor_id,payload_hash,result)
    values(request,connection.id,connection.practice_id,chart,auth.uid(),pims_private.hash(payload),to_jsonb(link));
  return to_jsonb(link);
end $$;

revoke all on function public.pims_setup_context(jsonb),public.pims_setup_page(jsonb),public.pims_link_chart(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pims_setup_context(jsonb),public.pims_setup_page(jsonb),public.pims_link_chart(jsonb) to authenticated;
commit;
