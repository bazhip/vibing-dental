-- Make the timestamp used by conditional writes strictly advance on a
-- chart edit. Bookkeeping-only writes still preserve the current version.
create or replace function public.charts_touch_updated_at_fn()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - '{pims_sent_at,owner_report_sent_at,reminder_sent_at,updated_at}'::text[])
     = (to_jsonb(old) - '{pims_sent_at,owner_report_sent_at,reminder_sent_at,updated_at}'::text[]) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;

-- Scope private chart invalidations exactly as chart reads are scoped.
-- A notification carries no patient fields, chart ids, or clinical data.
create policy "receive chart invalidations"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = (select realtime.topic())
    and case
      when (select realtime.topic()) = 'charts:user:' || (select auth.uid())::text then true
      when (select realtime.topic()) ~ '^charts:practice:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member_of(split_part((select realtime.topic()), ':', 3)::uuid)
      else false
    end
  );

create function public.notify_chart_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_topic text;
  current_topic text;
begin
  if tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at
    and new.practice_id is not distinct from old.practice_id
    and new.created_by is not distinct from old.created_by then
    return null;
  end if;
  if tg_op <> 'INSERT' then
    previous_topic := coalesce('charts:practice:' || old.practice_id::text, 'charts:user:' || old.created_by::text);
  end if;
  if tg_op <> 'DELETE' then
    current_topic := coalesce('charts:practice:' || new.practice_id::text, 'charts:user:' || new.created_by::text);
  end if;
  if current_topic is not null then
    perform realtime.send('{}'::jsonb, 'chart-changed', current_topic, true);
  end if;
  if previous_topic is not null and previous_topic is distinct from current_topic then
    perform realtime.send('{}'::jsonb, 'chart-changed', previous_topic, true);
  end if;
  return null;
exception when others then
  -- A transient notification outage must never roll back the chart save.
  -- Clients reconcile periodically and when they return to the foreground.
  raise warning 'Chart change notification failed (%)', sqlstate;
  return null;
end;
$$;

revoke all on function public.notify_chart_changed() from public, anon, authenticated;

create trigger charts_notify_changed
  after insert or update or delete on public.charts
  for each row execute function public.notify_chart_changed();
