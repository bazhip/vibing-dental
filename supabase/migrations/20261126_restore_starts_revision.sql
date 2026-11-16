-- Restoring an earlier version always starts a new history revision.
--
-- One person's continuous editing is merged into one revision (see
-- 20261117_chart_revisions). A restore is an ordinary save, so within ten
-- minutes of editing it was merged too: the restored snapshot overwrote the
-- revision holding those edits, and the latest version vanished from history.
-- The app now stamps charts.restored_at when it restores; a changed stamp
-- means "don't merge".

alter table public.charts add column if not exists restored_at timestamptz;

create or replace function public.record_chart_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_rev record;
  restoring boolean := tg_op = 'UPDATE' and new.restored_at is distinct from old.restored_at;
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return new;
  end if;
  select id, saved_by, started_at, saved_at, note into last_rev
    from public.chart_revisions
   where chart_id = new.id
   order by saved_at desc, id desc
   limit 1;
  if found
     and not restoring
     and last_rev.note = ''
     and last_rev.saved_by is not distinct from uid
     and last_rev.saved_at > now() - interval '10 minutes'
     and last_rev.started_at > now() - interval '1 hour' then
    update public.chart_revisions set data = new.data, saved_at = now() where id = last_rev.id;
  else
    insert into public.chart_revisions (chart_id, saved_by, data) values (new.id, uid, new.data);
  end if;
  return new;
end $$;
revoke all on function public.record_chart_revision() from public, anon, authenticated;
