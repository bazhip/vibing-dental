begin;

create table if not exists public.pims_review_actions (
  request_id uuid primary key,
  practice_id uuid not null,
  connection_id uuid not null,
  actor_id uuid not null references auth.users(id),
  payload_hash text not null,
  reason text,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (connection_id, practice_id) references public.pims_connections(id, practice_id)
);
alter table public.pims_review_actions enable row level security;
revoke all on public.pims_review_actions from public, anon, authenticated, service_role;
grant select on public.pims_review_actions to authenticated;
drop policy if exists pims_member_read on public.pims_review_actions;
create policy pims_member_read on public.pims_review_actions for select to authenticated using (public.pims_is_current_member(practice_id));

create or replace function pims_private.review_replay(connection public.pims_connections, payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare previous public.pims_review_actions;
begin
  select * into previous from public.pims_review_actions where request_id=pims_private.uuid_value(payload,'request_id');
  if found then
    if previous.connection_id<>connection.id or previous.actor_id<>auth.uid() or previous.payload_hash<>pims_private.hash(payload) then raise exception 'pims_idempotency'; end if;
    return previous.result;
  end if;
  return null;
end $$;

create or replace function pims_private.record_review(connection public.pims_connections, payload jsonb, result jsonb) returns void
language sql set search_path = '' as $$
  insert into public.pims_review_actions(request_id,practice_id,connection_id,actor_id,payload_hash,reason,result)
  values(pims_private.uuid_value(payload,'request_id'),connection.practice_id,connection.id,auth.uid(),pims_private.hash(payload),payload->>'reason',result)
$$;

create or replace function public.pims_review_visit(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; visit public.pims_visits; result jsonb; action_value text; reason_value text; old_version integer;
begin
  perform pims_private.keys(payload,array['connection_id','visit_id','request_id','expected_version','action','reason'],array['connection_id','visit_id','request_id','expected_version','action','reason']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  action_value := pims_private.text_value(payload,'action');
  reason_value := pims_private.text_value(payload,'reason');
  if action_value not in ('archive','restore') then raise exception 'pims_invalid'; end if;
  result := pims_private.review_replay(connection,payload);
  if result is not null then return result; end if;
  select * into visit from public.pims_visits where id=pims_private.uuid_value(payload,'visit_id') and connection_id=connection.id for update;
  if not found then raise exception 'pims_forbidden'; end if;
  if visit.version<>pims_private.integer_value(payload,'expected_version') then raise exception 'pims_conflict'; end if;
  old_version := visit.version;
  if (action_value='archive' and visit.archived_at is null) or (action_value='restore' and visit.archived_at is not null) then
    update public.pims_visits set version=version+1,
      archived_at=case when action_value='archive' then clock_timestamp() end,
      archived_by=case when action_value='archive' then auth.uid() end,
      archive_kind=case when action_value='archive' then 'manual' end,
      archive_reason=case when action_value='archive' then reason_value end
      where id=visit.id returning * into visit;
    perform pims_private.audit(connection,action_value,visit.id,old_version,visit.version);
  end if;
  result := to_jsonb(visit);
  perform pims_private.record_review(connection,payload,result);
  return result;
end $$;

create or replace function public.pims_resolve_issue(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; issue public.pims_sync_issues; visit public.pims_visits;
  patient public.pims_patient_links; clinician public.pims_clinician_links; run public.pims_sync_runs;
  action_value text; result jsonb; old_version integer;
begin
  perform pims_private.keys(payload,array['connection_id','issue_id','request_id','expected_version','action'],array['connection_id','issue_id','request_id','expected_version','action']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  action_value := pims_private.text_value(payload,'action');
  if action_value not in ('retain','accept_schedule') then raise exception 'pims_invalid'; end if;
  result := pims_private.review_replay(connection,payload);
  if result is not null then return result; end if;
  select * into issue from public.pims_sync_issues where id=pims_private.uuid_value(payload,'issue_id') and connection_id=connection.id for update;
  if not found then raise exception 'pims_forbidden'; end if;
  select * into visit from public.pims_visits where connection_id=connection.id and appointment_id=issue.appointment_id for update;
  if issue.resolution is not null or coalesce(visit.version,0)<>pims_private.integer_value(payload,'expected_version') then raise exception 'pims_conflict'; end if;
  old_version := coalesce(visit.version,0);
  if action_value='accept_schedule' then
    select * into run from public.pims_sync_runs where id=issue.run_id;
    select * into patient from public.pims_patient_links where id=visit.patient_link_id;
    select * into clinician from public.pims_clinician_links where id=visit.clinician_link_id;
    if visit.id is null or visit.appointment_id is distinct from (issue.proposed->>'appointment_id') or patient.patient_id is distinct from (issue.proposed->>'patient_id')
      or clinician.clinician_id is distinct from (issue.proposed->>'clinician_id') or visit.encounter_id is distinct from (issue.proposed->>'encounter_id')
      or patient.version<>issue.patient_link_version or clinician.version<>issue.clinician_link_version then raise exception 'pims_identity'; end if;
    perform 1 from public.practice_members where practice_id=connection.practice_id and user_id=clinician.user_id for share;
    if not found then raise exception 'pims_identity'; end if;
    if connection.state<>'active' or connection.revision<>run.connection_revision or connection.generation<>run.generation
       or visit.archived_at is not null or issue.proposed->>'status' is distinct from 'active' then raise exception 'pims_conflict'; end if;
    update public.pims_visits set starts_at=pims_private.instant(issue.proposed,'starts_at'),ends_at=pims_private.instant(issue.proposed,'ends_at'),
      source_hash=pims_private.hash(issue.proposed-array['expected_version','patient_link_version','clinician_link_version']),version=version+1
      where id=visit.id returning * into visit;
  end if;
  update public.pims_sync_issues set resolution=action_value,resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=issue.id;
  perform pims_private.audit(connection,action_value,issue.id,old_version,coalesce(visit.version,0));
  result := jsonb_build_object('id',issue.id,'resolution',action_value,'visit_version',coalesce(visit.version,0));
  perform pims_private.record_review(connection,payload,result);
  return result;
end $$;

create or replace function public.pims_review_connections(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare practice_filter uuid; result jsonb;
begin
  perform pims_private.keys(payload,array[]::text[],array['practice_id']);
  if auth.uid() is null then raise exception 'pims_forbidden'; end if;
  if payload ? 'practice_id' then practice_filter := pims_private.uuid_value(payload,'practice_id'); perform pims_private.require_member(practice_filter); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',connection.id,'provider',connection.provider,'tenant_id',connection.tenant_id,'state',connection.state,'practice_name',practice.name) order by connection.id),'[]'::jsonb) into result
    from public.pims_connections connection join public.practices practice on practice.id=connection.practice_id
    where public.pims_is_current_member(connection.practice_id) and (practice_filter is null or connection.practice_id=practice_filter);
  return result;
end $$;

create or replace function public.pims_review_page(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; collection_value text; after_id uuid; entries jsonb; next_cursor text;
begin
  perform pims_private.keys(payload,array['connection_id','collection'],array['connection_id','collection','cursor']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'));
  collection_value := pims_private.text_value(payload,'collection');
  if collection_value not in ('active','archived','issues') then raise exception 'pims_invalid'; end if;
  if payload ? 'cursor' then after_id := pims_private.uuid_value(payload,'cursor'); end if;
  if collection_value='issues' then
    select coalesce(jsonb_agg(row_data order by id),'[]'::jsonb) into entries from (
      select issue.id, to_jsonb(issue) || jsonb_build_object('current',case when visit.id is null then null else to_jsonb(visit) || jsonb_build_object('patient_id',patient.patient_id,'clinician_id',clinician.clinician_id) end) as row_data
      from public.pims_sync_issues issue left join public.pims_visits visit on visit.connection_id=issue.connection_id and visit.appointment_id=issue.appointment_id
      left join public.pims_patient_links patient on patient.id=visit.patient_link_id left join public.pims_clinician_links clinician on clinician.id=visit.clinician_link_id
      where issue.connection_id=connection.id and issue.resolution is null and (after_id is null or issue.id>after_id) order by issue.id limit 51
    ) page;
  else
    select coalesce(jsonb_agg(row_data order by id),'[]'::jsonb) into entries from (
      select visit.id,to_jsonb(visit) || jsonb_build_object('patient_id',patient.patient_id,'clinician_id',clinician.clinician_id) as row_data
      from public.pims_visits visit join public.pims_patient_links patient on patient.id=visit.patient_link_id join public.pims_clinician_links clinician on clinician.id=visit.clinician_link_id
      where visit.connection_id=connection.id and (visit.archived_at is not null)=(collection_value='archived') and (after_id is null or visit.id>after_id) order by visit.id limit 51
    ) page;
  end if;
  if jsonb_array_length(entries)>50 then next_cursor := entries->49->>'id'; entries := entries-50; end if;
  return jsonb_build_object('rows',entries,'next_cursor',next_cursor);
end $$;

create or replace function public.pims_seal_capture(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.pims_sync_runs; completeness_value text;
begin
  perform pims_private.keys(payload,array['run_id','generation','completeness'],array['run_id','generation','completeness']);
  run := pims_private.lock_run(payload);
  completeness_value := pims_private.text_value(payload,'completeness');
  if completeness_value not in ('complete','partial','unknown') or run.chunk_count=0 then raise exception 'pims_invalid'; end if;
  if run.state not in ('capturing','saving') or run.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  if run.sealed_at is not null then
    if run.completeness<>completeness_value then raise exception 'pims_idempotency'; end if;
  else
    update public.pims_sync_runs set sealed_at=clock_timestamp(),completeness=completeness_value where id=run.id returning * into run;
  end if;
  return to_jsonb(run);
end $$;

create or replace function pims_private.has_explicit_status(run public.pims_sync_runs, visit public.pims_visits, status_value text default null) returns boolean
language sql set search_path = '' as $$
  select exists(select 1 from public.pims_sync_issues issue
    join public.pims_patient_links patient on patient.id=visit.patient_link_id
    join public.pims_clinician_links clinician on clinician.id=visit.clinician_link_id
    where issue.run_id=run.id and issue.appointment_id=visit.appointment_id and issue.reason='status_requires_review' and issue.resolution is null
      and issue.proposed->>'expected_version'=visit.version::text
      and issue.proposed->>'status' in ('cancelled','deleted') and (status_value is null or issue.proposed->>'status'=status_value)
      and issue.proposed->>'patient_id'=patient.patient_id and issue.proposed->>'clinician_id'=clinician.clinician_id
      and (issue.proposed->>'encounter_id') is not distinct from visit.encounter_id
      and issue.proposed->>'patient_link_version'=visit.patient_link_version::text
      and issue.proposed->>'clinician_link_version'=visit.clinician_link_version::text)
$$;

create or replace function pims_private.is_reconcile_candidate(run public.pims_sync_runs, visit public.pims_visits) returns boolean
language sql set search_path = '' as $$
  select visit.connection_id=run.connection_id and (
    pims_private.has_explicit_status(run,visit)
    or (run.completeness='complete' and visit.starts_at>=(run.scope->>'window_start')::timestamptz and visit.starts_at<(run.scope->>'window_end')::timestamptz
      and not exists(select 1 from public.pims_sync_chunks chunk cross join lateral jsonb_array_elements(chunk.result->'outcomes') outcome where chunk.run_id=run.id and outcome->>'appointment_id'=visit.appointment_id))
  )
$$;

create or replace function public.pims_reconcile_candidates(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.pims_sync_runs; after_id uuid; entries jsonb; next_cursor text;
begin
  perform pims_private.keys(payload,array['run_id','generation'],array['run_id','generation','cursor']);
  run := pims_private.lock_run(payload);
  if run.sealed_at is null or run.state not in ('capturing','saving') or run.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  if payload ? 'cursor' then after_id := pims_private.uuid_value(payload,'cursor'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('cursor',id,'appointment_id',appointment_id,'version',version,'patient_link_version',patient_link_version,'clinician_link_version',clinician_link_version) order by id),'[]'::jsonb) into entries
    from (select * from public.pims_visits visit where visit.connection_id=run.connection_id and visit.archived_at is null
      and (after_id is null or visit.id>after_id) and pims_private.is_reconcile_candidate(run,visit) order by visit.id limit 101) page;
  if jsonb_array_length(entries)>100 then next_cursor := entries->99->>'cursor'; end if;
  select coalesce(jsonb_agg(value-'cursor' order by ordinal),'[]'::jsonb) into entries from jsonb_array_elements(entries) with ordinality as page(value,ordinal) where ordinal<=100;
  return jsonb_build_object('rows',entries,'next_cursor',next_cursor);
end $$;

create or replace function public.pims_reconcile_status(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.pims_sync_runs; connection public.pims_connections; visit public.pims_visits; patient public.pims_patient_links;
  clinician public.pims_clinician_links; result jsonb; status_value text; reason_value text; outcome_value text := 'skipped';
  captured timestamptz; old_version integer; appointment jsonb; starts timestamptz; ends timestamptz;
begin
  perform pims_private.keys(payload,array['run_id','generation','request_id','captured_at','identity','appointment_id','expected_version','patient_link_version','clinician_link_version','status'],array['run_id','generation','request_id','captured_at','identity','appointment_id','expected_version','patient_link_version','clinician_link_version','status','appointment']);
  run := pims_private.lock_run(payload);
  select * into connection from public.pims_connections where id=run.connection_id;
  perform pims_private.keys(payload->'identity',array['provider','origin','tenant_id','connection_revision'],array['provider','origin','tenant_id','connection_revision']);
  if payload->'identity'<>jsonb_build_object('provider',connection.provider,'origin',connection.origin,'tenant_id',connection.tenant_id,'connection_revision',connection.revision) then raise exception 'pims_identity'; end if;
  result := pims_private.review_replay(connection,payload);
  if result is not null then return result; end if;
  captured := pims_private.instant(payload,'captured_at');
  if run.sealed_at is null or run.state not in ('capturing','saving') or run.expires_at<=clock_timestamp()
    or captured<run.started_at or captured>clock_timestamp() then raise exception 'pims_stale'; end if;
  status_value := pims_private.text_value(payload,'status');
  if status_value not in ('active','cancelled','deleted','unknown') then raise exception 'pims_invalid'; end if;
  if status_value='active' then
    appointment := payload->'appointment';
    perform pims_private.keys(appointment,array['appointment_id','patient_id','clinician_id','encounter_id','starts_at','ends_at','status'],array['appointment_id','patient_id','clinician_id','encounter_id','starts_at','ends_at','status','expected_version','patient_link_version','clinician_link_version']);
    perform pims_private.text_value(appointment,'appointment_id');
    perform pims_private.text_value(appointment,'patient_id');
    perform pims_private.text_value(appointment,'clinician_id');
    if appointment->'encounter_id'<>'null'::jsonb then perform pims_private.text_value(appointment,'encounter_id'); end if;
    starts := pims_private.instant(appointment,'starts_at'); ends := pims_private.instant(appointment,'ends_at');
    if appointment->>'status' is distinct from 'active' or ends<=starts or ends-starts>interval '26 hours' then raise exception 'pims_invalid'; end if;
  end if;
  select * into visit from public.pims_visits where connection_id=connection.id and appointment_id=pims_private.text_value(payload,'appointment_id') for update;
  if not found or not pims_private.is_reconcile_candidate(run,visit) then raise exception 'pims_invalid'; end if;
  if captured<run.sealed_at and not pims_private.has_explicit_status(run,visit,status_value) then raise exception 'pims_stale'; end if;
  select * into patient from public.pims_patient_links where id=visit.patient_link_id;
  select * into clinician from public.pims_clinician_links where id=visit.clinician_link_id;
  old_version := visit.version;
  if visit.version<>pims_private.integer_value(payload,'expected_version') then reason_value := 'visit_version'; outcome_value := 'conflict';
  elsif visit.patient_link_version<>pims_private.integer_value(payload,'patient_link_version') or visit.clinician_link_version<>pims_private.integer_value(payload,'clinician_link_version') then reason_value := 'link_version'; outcome_value := 'conflict';
  elsif visit.archived_at is not null then reason_value := 'archived_requires_review';
  elsif status_value='unknown' then reason_value := 'status_unknown';
  else
    perform 1 from public.practice_members where practice_id=connection.practice_id and user_id=clinician.user_id for share;
    if not found then reason_value := 'clinician_unlinked'; end if;
  end if;
  if reason_value is null and status_value='active' then
    if appointment->>'appointment_id' is distinct from visit.appointment_id or appointment->>'patient_id' is distinct from patient.patient_id
      or appointment->>'clinician_id' is distinct from clinician.clinician_id or appointment->>'encounter_id' is distinct from visit.encounter_id
      or appointment->>'status' is distinct from 'active' then reason_value := 'identity_changed'; outcome_value := 'conflict';
    else
      if starts=visit.starts_at and ends=visit.ends_at then outcome_value := 'unchanged';
      else
        update public.pims_visits set starts_at=starts,ends_at=ends,version=version+1,
          source_hash=pims_private.hash((appointment-array['expected_version','patient_link_version','clinician_link_version'])||jsonb_build_object('starts_at',starts,'ends_at',ends)),last_seen_run_id=run.id
          where id=visit.id returning * into visit;
        outcome_value := 'applied';
      end if;
    end if;
  elsif reason_value is null and status_value in ('cancelled','deleted') then
    update public.pims_visits set archived_at=clock_timestamp(),archived_by=auth.uid(),archive_kind='source',archive_reason=status_value,version=version+1 where id=visit.id returning * into visit;
    outcome_value := 'applied';
  end if;
  if reason_value is not null then
    insert into public.pims_sync_issues(practice_id,connection_id,run_id,appointment_id,reason,visit_version,patient_link_version,clinician_link_version,proposal_hash,proposed)
      values(connection.practice_id,connection.id,run.id,visit.appointment_id,reason_value,visit.version,visit.patient_link_version,visit.clinician_link_version,pims_private.hash(payload),coalesce(appointment,payload-'identity')) on conflict do nothing;
  end if;
  if visit.version<>old_version then perform pims_private.audit(connection,'reconcile_'||status_value,visit.id,old_version,visit.version); end if;
  if run.expires_at<=clock_timestamp() then raise exception 'pims_stale'; end if;
  result := jsonb_build_object('appointment_id',visit.appointment_id,'outcome',outcome_value,'version',visit.version);
  if reason_value is not null then result := result||jsonb_build_object('reason',reason_value); end if;
  perform pims_private.record_review(connection,payload,result);
  return result;
end $$;

revoke all on all functions in schema pims_private from public, anon, authenticated, service_role;
do $$
declare function_name text;
begin
  foreach function_name in array array['pims_review_visit','pims_resolve_issue','pims_review_connections','pims_review_page','pims_seal_capture','pims_reconcile_candidates','pims_reconcile_status'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated, service_role',function_name);
    execute format('grant execute on function public.%I(jsonb) to authenticated',function_name);
  end loop;
end $$;

commit;
