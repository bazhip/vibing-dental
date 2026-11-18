begin;

alter table public.pims_connections add column if not exists binding_mode text not null default 'provider_observed'
  check (binding_mode in ('provider_observed','user_confirmed'));
alter table public.pims_connections add column if not exists confirmed_at timestamptz;

create or replace function pims_private.reset_connection_confirmation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.state='unverified' or (new.verified_at is not null and new.verified_at is distinct from old.verified_at) then
    new.binding_mode := 'provider_observed';
    new.confirmed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists pims_reset_connection_confirmation on public.pims_connections;
create trigger pims_reset_connection_confirmation before update on public.pims_connections
  for each row execute function pims_private.reset_connection_confirmation();

-- This acknowledges an owner-configured practice. It does not attest to the provider's active clinic.
create or replace function public.pims_confirm_configured_connection(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; previous_revision integer;
begin
  perform pims_private.keys(payload,array['connection_id','expected_revision','acknowledged'],array['connection_id','expected_revision','acknowledged']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  if payload->'acknowledged' is distinct from 'true'::jsonb then raise exception 'pims_invalid'; end if;
  if connection.revision<>pims_private.integer_value(payload,'expected_revision') then raise exception 'pims_conflict'; end if;
  if connection.provider not in ('ezyvet','daysmart','pulse','shepherd') then raise exception 'pims_invalid'; end if;
  if connection.state='disabled' then raise exception 'pims_disabled'; end if;
  previous_revision := connection.revision;
  update public.pims_sync_runs set state='interrupted',finished_at=clock_timestamp()
    where connection_id=connection.id and state in ('capturing','saving');
  update public.pims_connections set state='active',binding_mode='user_confirmed',verified_at=null,
    confirmed_at=clock_timestamp(),revision=revision+1 where id=connection.id returning * into connection;
  perform pims_private.audit(connection,'configured_practice_confirmed',connection.id,previous_revision,connection.revision);
  return to_jsonb(connection);
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
    'revision',revision,'state',state,'binding_mode',binding_mode) order by provider,origin,tenant_id),'[]') into connections
    from public.pims_connections where practice_id=practice;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id) order by user_id),'[]') into members from public.practice_members where practice_id=practice;
  return jsonb_build_object('connections',connections,'members',members);
end $$;

revoke all on function pims_private.reset_connection_confirmation() from public,anon,authenticated,service_role;
revoke all on function public.pims_confirm_configured_connection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pims_confirm_configured_connection(jsonb) to authenticated;
commit;
