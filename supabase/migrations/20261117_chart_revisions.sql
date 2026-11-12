-- Chart history (audit trail): who saved each version of a chart, and when.
--
-- A trigger on public.charts records every change to `data` — the saver is
-- auth.uid(), taken on the server, so it can't be spoofed (NULL = a server
-- process). One person's continuous editing is merged into one revision:
-- a new revision starts after 10 quiet minutes, after an hour, or when
-- someone else saves. Autosave therefore can't flood the history.
--
-- Visibility follows the chart exactly: the SELECT policy asks whether the
-- caller can see the chart under public.charts' own RLS (owner, practice
-- sharing — whatever those policies are). Nobody can insert, edit or
-- delete revisions from the app; only the trigger writes. Revisions are
-- removed with their chart (deleting a chart deletes its history).

create table if not exists public.chart_revisions (
  id bigint generated always as identity primary key,
  chart_id uuid not null references public.charts (id) on delete cascade,
  saved_by uuid references auth.users (id) on delete set null,
  -- First and last save merged into this revision.
  started_at timestamptz not null default now(),
  saved_at timestamptz not null default now(),
  -- 'baseline' = the chart as it was when history began.
  note text not null default '',
  data jsonb not null
);
create index if not exists chart_revisions_chart_idx on public.chart_revisions (chart_id, saved_at desc);

alter table public.chart_revisions enable row level security;
revoke all on table public.chart_revisions from anon;
revoke insert, update, delete on table public.chart_revisions from authenticated;
grant select on table public.chart_revisions to authenticated;

drop policy if exists "read history of charts you can see" on public.chart_revisions;
create policy "read history of charts you can see"
  on public.chart_revisions for select to authenticated
  using (exists (select 1 from public.charts c where c.id = chart_revisions.chart_id));

create or replace function public.record_chart_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_rev record;
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

drop trigger if exists charts_record_revision on public.charts;
create trigger charts_record_revision
  after insert or update of data on public.charts
  for each row execute function public.record_chart_revision();

-- Display names for history: only yourself and people who share a
-- practice with you (doctor name, else email).
create or replace function public.history_display_names(ids uuid[])
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, coalesce(nullif(trim(p.doctor_name), ''), u.email::text)
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = any (ids)
     and (u.id = auth.uid()
          or exists (
            select 1
              from public.practice_members me
              join public.practice_members them on them.practice_id = me.practice_id
             where me.user_id = auth.uid() and them.user_id = u.id));
$$;
revoke all on function public.history_display_names(uuid[]) from public, anon;
grant execute on function public.history_display_names(uuid[]) to authenticated;

-- Baseline: each existing chart as it is now, attributed to its creator.
insert into public.chart_revisions (chart_id, saved_by, started_at, saved_at, note, data)
select c.id, c.created_by, c.updated_at, c.updated_at, 'baseline', c.data
  from public.charts c
 where not exists (select 1 from public.chart_revisions r where r.chart_id = c.id);
