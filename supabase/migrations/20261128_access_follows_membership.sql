-- Access follows practice membership.
--
-- 1. The DICOM paid-plan check read profiles.practice_id, which users can
--    update themselves (the profile UPDATE policy has no column limit): a
--    free user could point it at any paying practice and upload DICOM.
--    It now checks real membership (practice_members, which only a
--    practice's owner or the server can change).
-- 2. profiles.practice_id is now set by the server only (team-api /
--    admin-api, service role). The app never writes it.
-- 3. Removed members kept access to what they created for the practice:
--    the row policies granted access on `created_by = me OR member of the
--    practice`, and removal only deletes the membership. Being the creator
--    now counts only while the row is private (no practice) or you're
--    still a member. Attribution (created_by, the visit's author) is kept.
-- 4. Same for the files: everyone can manage their own storage folder,
--    which still held the images of a practice they'd left. Files behind
--    a practice's attachment rows are now off-limits to non-members.

-- 1 -------------------------------------------------------------------------
create or replace function public.current_user_has_billed_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practice_members m
    join public.practices p on p.id = m.practice_id
    where m.user_id = auth.uid()
      and p.subscription_status in ('active', 'trialing', 'past_due')
  );
$$;

-- 2 -------------------------------------------------------------------------
create or replace function public.profiles_protect_practice_id()
returns trigger
language plpgsql
as $$
begin
  -- Signed-in users (the app) can't set it; the server (service role),
  -- auth hooks and the SQL editor can.
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'UPDATE' then
      new.practice_id := old.practice_id;
    else
      new.practice_id := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_practice_id on public.profiles;
create trigger profiles_protect_practice_id
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_practice_id();

-- 3 -------------------------------------------------------------------------
-- (created_by = me, while private or still a member) OR a member.
drop policy if exists "read charts" on public.charts;
create policy "read charts" on public.charts for select to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "update charts" on public.charts;
create policy "update charts" on public.charts for update to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "delete charts" on public.charts;
create policy "delete charts" on public.charts for delete to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));

drop policy if exists "read attachments" on public.attachments;
create policy "read attachments" on public.attachments for select to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "update attachments" on public.attachments;
create policy "update attachments" on public.attachments for update to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "delete attachments" on public.attachments;
create policy "delete attachments" on public.attachments for delete to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));

drop policy if exists "read templates" on public.report_templates;
create policy "read templates" on public.report_templates for select to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "update templates" on public.report_templates;
create policy "update templates" on public.report_templates for update to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));
drop policy if exists "delete templates" on public.report_templates;
create policy "delete templates" on public.report_templates for delete to authenticated
  using ((created_by = auth.uid() and (practice_id is null or is_member_of(practice_id))) or is_member_of(practice_id));

-- 4 -------------------------------------------------------------------------
-- Security definer: it must see attachment rows the caller no longer can.
-- Only the caller's own rows can point into their folder (the restrictive
-- "attachment rows point at own files" insert policy), so it looks at those.
create or replace function public.attachment_file_locked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attachments a
    where a.created_by = auth.uid()
      and a.practice_id is not null
      and not public.is_member_of(a.practice_id)
      and (a.path = object_name
           or a.original_path = object_name
           or regexp_replace(a.path, '\.[^./]+$', '') || '.thumb.jpg' = object_name)
  );
$$;
revoke all on function public.attachment_file_locked(text) from public, anon;
grant execute on function public.attachment_file_locked(text) to authenticated;

drop policy if exists "users manage own attachments storage" on storage.objects;
create policy "users manage own attachments storage" on storage.objects for all to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = auth.uid()::text
         and not public.attachment_file_locked(name))
  with check (bucket_id = 'attachments'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting a chart looks its images up by chart_id (the existing index
-- leads with created_by).
create index if not exists attachments_chart_id_idx on public.attachments (chart_id);
