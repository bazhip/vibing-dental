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
-- PRIVATE bucket (2026-07-18): reads go through signed URLs; storage RLS
-- grants them to the practice's members (policy "members read practice
-- logo" — covers both {practice_id}/ and legacy {owner_user_id}/ paths).
-- Writes are scoped to the user's own folder / practice owners.
-- 2 MB / PNG-only server-side cap: the app always uploads a canvas-
-- re-encoded PNG downscaled to <=600px, so anything bigger is not ours.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "users manage own logo"
  on storage.objects for all to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------- report templates
-- Per-user treatment/surgery report templates: pre-filled free-text
-- reports for common procedures, insertable from the Treatment Report
-- section. Same ownership + RLS pattern as charts.
create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.report_templates enable row level security;

create policy "users read own templates"
  on public.report_templates for select to authenticated using (created_by = auth.uid());

create policy "users create own templates"
  on public.report_templates for insert to authenticated with check (created_by = auth.uid());

create policy "users update own templates"
  on public.report_templates for update to authenticated using (created_by = auth.uid());

create policy "users delete own templates"
  on public.report_templates for delete to authenticated using (created_by = auth.uid());

drop trigger if exists report_templates_touch on public.report_templates;
create trigger report_templates_touch
  before update on public.report_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------- attachments
-- Photos & radiographs pinned to a chart (optionally a tooth). Files in
-- the PRIVATE `attachments` bucket at {user_id}/{chart_id}/{uuid.ext};
-- rows hold metadata. chart_id mirrors the client cloudChartId (no hard
-- FK — a chart row may not exist until first autosave). Per-user RLS.
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chart_id uuid not null,
  path text not null,
  caption text not null default '',
  kind text not null default 'photo',
  tooth_triadan int,
  created_at timestamptz not null default now()
);
create index if not exists attachments_chart_idx on public.attachments (created_by, chart_id);
alter table public.attachments enable row level security;
create policy "users read own attachments"   on public.attachments for select to authenticated using (created_by = auth.uid());
create policy "users create own attachments"  on public.attachments for insert to authenticated with check (created_by = auth.uid());
create policy "users update own attachments"  on public.attachments for update to authenticated using (created_by = auth.uid());
create policy "users delete own attachments"  on public.attachments for delete to authenticated using (created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 20971520, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "users manage own attachments storage"
  on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Recall reminder column (also mirrored in PatientInfo.recallDate inside data jsonb).
alter table public.charts add column if not exists recall_date text not null default '';

-- ============================================================ TEAM ACCESS
-- Additive multi-doctor model. Rows carry an optional practice_id; NULL =
-- private to creator. Policies grant access to creator OR practice member
-- (is_member_of requires practice_id NOT NULL), so pre-existing per-user
-- rows stay isolated. Full policy set applied via the team_access +
-- team_access_row_policies migrations; summarized here.
create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.practice_members (
  practice_id uuid not null references public.practices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (practice_id, user_id)
);
alter table public.profiles           add column if not exists practice_id uuid references public.practices (id) on delete set null;
alter table public.charts             add column if not exists practice_id uuid;
alter table public.report_templates   add column if not exists practice_id uuid;
alter table public.attachments        add column if not exists practice_id uuid;
-- SECURITY DEFINER membership checks used in row policies (see migrations
-- team_access / team_access_row_policies for the full policy definitions):
--   is_member_of(pid), is_owner_of(pid)
-- charts/report_templates/attachments select|update|delete USING:
--   created_by = auth.uid() OR public.is_member_of(practice_id)
-- insert WITH CHECK:
--   created_by = auth.uid() AND (practice_id IS NULL OR public.is_member_of(practice_id))
-- Managed server-side by the team-api edge function (owner-gated).

-- Shared per-practice logo (logos/{practice_id}/logo.png). Applied via
-- the practice_logo migration; owners write via the storage policy
-- "owners manage practice logo" (is_owner_of on the folder = practice id).
alter table public.practices add column if not exists logo_path text not null default '';

-- ---------------------------------------------------- recheck reminders
-- Owner email + reminder template/schedule (migrations: recheck_reminders,
-- recheck_reminder_cron, reminder_lead_days). Manual send via the
-- send-reminder edge function; auto-send via pg_cron job
-- 'daily-recheck-reminders' → public.send_due_reminders() (fires
-- lead_days before recall_date when practices.reminder_auto is on).
alter table public.charts add column if not exists owner_email text not null default '';
alter table public.charts add column if not exists reminder_sent_at timestamptz;
alter table public.practices add column if not exists reminder_subject text not null default '';
alter table public.practices add column if not exists reminder_body text not null default '';
alter table public.practices add column if not exists reminder_auto boolean not null default false;
alter table public.practices add column if not exists reminder_lead_days int not null default 0;
