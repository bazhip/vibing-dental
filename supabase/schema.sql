-- Vibing Dental — cloud schema.
--
-- Tenancy model: per-user accounts with public signup (free for now;
-- billing later). Each user owns their charts; the profile carries the
-- practice identity (company + doctor name) collected at signup, which
-- the app displays in the topbar and embeds in generated PDFs.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  practice_name text not null default '',
  doctor_name text not null default '',
  -- Storage path of the uploaded practice logo ('' = use the template's
  -- built-in logo). Objects live in the public `logos` bucket under
  -- {user_id}/logo.png.
  logo_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users read own profile"
  on public.profiles for select to authenticated using (id = auth.uid());

create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "users update own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Auto-create the profile at signup from the metadata the signup form
-- passes to auth.signUp — works with or without email confirmation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, practice_name, doctor_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'practice_name', ''),
    coalesce(new.raw_user_meta_data ->> 'doctor_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ charts
create table if not exists public.charts (
  id uuid primary key,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_name text not null default '',
  patient_number text not null default '',
  species text not null default '',
  chart_date text not null default '',
  -- Full chart snapshot: patientInfo, toothData, diagrams (marks,
  -- comments, strokes), logo. Same shape the PDF round-trip embeds.
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.charts enable row level security;

create policy "users read own charts"
  on public.charts for select to authenticated using (created_by = auth.uid());

create policy "users create own charts"
  on public.charts for insert to authenticated with check (created_by = auth.uid());

create policy "users update own charts"
  on public.charts for update to authenticated using (created_by = auth.uid());

create policy "users delete own charts"
  on public.charts for delete to authenticated using (created_by = auth.uid());

-- --------------------------------------------------------------- utilities
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists charts_touch_updated_at on public.charts;
create trigger charts_touch_updated_at
  before update on public.charts
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create index if not exists charts_updated_at_idx
  on public.charts (updated_at desc);

create index if not exists charts_created_by_idx
  on public.charts (created_by);

-- ------------------------------------------------------------ logo storage
-- Public-read bucket (logos are practice branding, not clinical data);
-- writes are scoped to the user's own folder.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "users manage own logo"
  on storage.objects for all to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
