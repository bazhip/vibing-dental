-- Private, transactional allocation. No direct client access to counters or reservations.
create table if not exists public.patient_number_counters (
  scope text primary key,
  last_number bigint not null
);
create table if not exists public.patient_number_reservations (
  scope text not null,
  patient_id text not null,
  number bigint not null,
  primary key (scope, patient_id),
  unique (scope, number)
);
alter table public.patient_number_counters enable row level security;
alter table public.patient_number_reservations enable row level security;
revoke all on public.patient_number_counters, public.patient_number_reservations from public, anon, authenticated;

create or replace function public.reserve_patient_number(p_patient_id text, p_practice_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  allocation_scope text;
  next_number bigint;
  reserved bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_patient_id is null or p_patient_id !~ '^[a-zA-Z0-9-]{16,64}$' then
    raise exception 'Invalid patient identity' using errcode = '22023';
  end if;
  if p_practice_id is not null and not public.is_member_of(p_practice_id) then
    raise exception 'Practice membership required' using errcode = '42501';
  end if;
  allocation_scope := case when p_practice_id is null then 'user:' || uid::text else 'practice:' || p_practice_id::text end;
  insert into public.patient_number_counters(scope, last_number)
  values (allocation_scope, 1000) on conflict do nothing;
  -- Lock one counter per scope. All allocation and retry checks happen under this lock.
  select last_number into next_number from public.patient_number_counters
  where scope = allocation_scope for update;
  select number into reserved from public.patient_number_reservations
  where scope = allocation_scope and patient_id = p_patient_id;
  if reserved is not null then return reserved::text; end if;
  -- Existing practice numbers stay untouched. Start above existing short numeric IDs.
  select greatest(next_number, coalesce(max(case when trim(c.patient_number) ~ '^[0-9]{1,9}$'
    then trim(c.patient_number)::bigint end), 1000)) into next_number
  from public.charts c
  where (p_practice_id is not null and c.practice_id = p_practice_id)
     or (p_practice_id is null and c.practice_id is null and c.created_by = uid);
  next_number := next_number + 1;
  update public.patient_number_counters set last_number = next_number where scope = allocation_scope;
  insert into public.patient_number_reservations(scope, patient_id, number)
  values (allocation_scope, p_patient_id, next_number);
  return next_number::text;
end
$$;
revoke all on function public.reserve_patient_number(text, uuid) from public, anon;
grant execute on function public.reserve_patient_number(text, uuid) to authenticated;
