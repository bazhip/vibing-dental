-- DICOM radiographs for comped practices and app admins.
--
-- 20261112_dicom_attachments limited DICOM to practices with a real
-- Stripe subscription (active, trialing, past_due). Comped/grandfathered
-- practices — including the admin's own — could not upload a .dcm, and
-- app admins (app_metadata.role = 'admin', which bypass the billing gate
-- in the app) were blocked too. Now:
--   * comped counts, like the other statuses that unlock basic/pro;
--   * app admins can always store DICOM (for support and testing).
-- Mirrored in the client: dicomAllowed() in src/hooks/useProfile.ts.
--
-- current_user_has_billed_subscription() keeps its meaning ("pays via
-- Stripe") for anything else that may use it; the DICOM policies switch
-- to the new function.

create or replace function public.current_user_can_store_dicom()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- app_metadata is server-controlled (users can't edit it).
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or exists (
      select 1
      from public.practice_members m
      join public.practices p on p.id = m.practice_id
      where m.user_id = auth.uid()
        and p.subscription_status in ('active', 'trialing', 'past_due', 'comped')
    );
$$;
revoke all on function public.current_user_can_store_dicom() from public, anon;
grant execute on function public.current_user_can_store_dicom() to authenticated;

drop policy if exists "dicom uploads require a billed subscription" on storage.objects;
drop policy if exists "dicom uploads require a paid plan" on storage.objects;
create policy "dicom uploads require a paid plan"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'attachments'
    or lower(name) not like '%.dcm'
    or public.current_user_can_store_dicom()
  );

drop policy if exists "attachment rows point at own files" on public.attachments;
create policy "attachment rows point at own files"
  on public.attachments as restrictive for insert to authenticated
  with check (
    (storage.foldername(path))[1] = auth.uid()::text
    and (
      original_path is null
      or (
        (storage.foldername(original_path))[1] = auth.uid()::text
        and public.current_user_can_store_dicom()
      )
    )
  );
