begin;

alter table public.practices
  add column if not exists gp_exam_enabled boolean not null default false;

-- Keep this rollout flag under database administrator control.
create or replace function public.protect_gp_exam_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not new.gp_exam_enabled then
      return new;
    end if;
  elsif new.gp_exam_enabled is not distinct from old.gp_exam_enabled then
    return new;
  end if;

  raise exception 'GP exam rollout can only be changed by ToothOps.'
    using errcode = '42501';
end;
$$;

drop trigger if exists protect_gp_exam_flag on public.practices;
create trigger protect_gp_exam_flag
  before insert or update of gp_exam_enabled on public.practices
  for each row execute function public.protect_gp_exam_flag();

commit;
