begin;

-- Extend configured-practice confirmation to the existing Instinct capture contract.
create or replace function public.pims_confirm_configured_connection(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.pims_connections; previous_revision integer;
begin
  perform pims_private.keys(payload,array['connection_id','expected_revision','acknowledged'],array['connection_id','expected_revision','acknowledged']);
  connection := pims_private.lock_connection(pims_private.uuid_value(payload,'connection_id'),true);
  if payload->'acknowledged' is distinct from 'true'::jsonb then raise exception 'pims_invalid'; end if;
  if connection.revision<>pims_private.integer_value(payload,'expected_revision') then raise exception 'pims_conflict'; end if;
  if connection.provider not in ('ezyvet','daysmart','instinct','pulse','shepherd') then raise exception 'pims_invalid'; end if;
  if connection.state='disabled' then raise exception 'pims_disabled'; end if;
  previous_revision := connection.revision;
  update public.pims_sync_runs set state='interrupted',finished_at=clock_timestamp()
    where connection_id=connection.id and state in ('capturing','saving');
  update public.pims_connections set state='active',binding_mode='user_confirmed',verified_at=null,
    confirmed_at=clock_timestamp(),revision=revision+1 where id=connection.id returning * into connection;
  perform pims_private.audit(connection,'configured_practice_confirmed',connection.id,previous_revision,connection.revision);
  return to_jsonb(connection);
end $$;

revoke all on function public.pims_confirm_configured_connection(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pims_confirm_configured_connection(jsonb) to authenticated;
commit;
