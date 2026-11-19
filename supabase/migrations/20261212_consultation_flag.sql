begin;

alter table public.practices
  add column if not exists consultation_enabled boolean not null default false;

-- Keep this rollout flag under database administrator control.
create or replace function public.protect_consultation_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not new.consultation_enabled then
      return new;
    end if;
  elsif new.consultation_enabled is not distinct from old.consultation_enabled then
    return new;
  end if;

  raise exception 'Consultation rollout can only be changed by ToothOps.'
    using errcode = '42501';
end;
$$;

drop trigger if exists protect_consultation_flag on public.practices;
create trigger protect_consultation_flag
  before insert or update of consultation_enabled on public.practices
  for each row execute function public.protect_consultation_flag();

commit;
