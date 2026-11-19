do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
drop schema if exists auth cascade;
drop schema public cascade;
create schema public;
grant usage on schema public to authenticated, anon, service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
create table public.practices (
  id uuid primary key, owner uuid not null references auth.users,
  name text not null default 'Test practice',
  pims_send_enabled boolean not null default false
);
create table public.practice_members (
  practice_id uuid not null references public.practices,
  user_id uuid not null references auth.users,
  role text not null default 'member',
  primary key (practice_id, user_id)
);
create function public.is_member_of(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.practice_members where practice_id = pid and user_id = auth.uid())
$$;
create table public.charts (
  id uuid primary key, created_by uuid not null references auth.users,
  practice_id uuid references public.practices,
  patient_name text not null default '', patient_number text not null default '',
  chart_date date not null default current_date, data jsonb not null default '{}',
  updated_at timestamptz not null default clock_timestamp()
);
create table public.attachments (
  id uuid primary key, created_by uuid not null references auth.users,
  chart_id uuid not null, path text not null, caption text not null default '',
  kind text not null default 'photo', original_path text
);
