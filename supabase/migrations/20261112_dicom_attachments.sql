-- DICOM radiographs (billed subscriptions only), plus hardening of the
-- attachment file pointers that the practice-member policies trust.
--
-- An attachment uploaded as DICOM keeps two files: `path` is a rendered
-- PNG/JPEG preview (what the grid, PDF and owner report use, unchanged)
-- and the new `original_path` is the untouched .dcm, offered as a download.
--
-- Apply BEFORE deploying the client that uploads DICOM: the bucket must
-- accept application/dicom and the larger originals. The client tolerates
-- a database without `original_path` (no DICOM originals listed).

alter table public.attachments add column if not exists original_path text;

-- Originals are never shrunk; the client caps them at 40 MB
-- (ATTACHMENT_LIMITS.hardMaxBytes). Normal images are still shrunk to
-- 2 MB client-side before upload.
update storage.buckets
  set file_size_limit = 41943040,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','application/dicom']
  where id = 'attachments';

-- Same rule as the client (BILLED_STATUSES in useProfile): only a real
-- Stripe subscription — active, trialing or past-due — counts. Free tier,
-- free beta, comped/grandfathered, lapsed or no practice → not billed.
-- Takes no argument: it only ever answers for the caller, so it can't be
-- used to probe other accounts' billing.
create or replace function public.current_user_has_billed_subscription()
returns boolean
language sql
stable
security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.practices p on p.id = pr.practice_id
    where pr.id = auth.uid()
      and p.subscription_status in ('active', 'trialing', 'past_due')
  );
$$;
revoke all on function public.current_user_has_billed_subscription() from public;
grant execute on function public.current_user_has_billed_subscription() to authenticated;

-- Restrictive = ANDed with the existing permissive policies, so accounts
-- without a billed subscription can't store a .dcm via the raw API.
drop policy if exists "dicom uploads require a billed subscription" on storage.objects;
create policy "dicom uploads require a billed subscription"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'attachments'
    or lower(name) not like '%.dcm'
    or public.current_user_has_billed_subscription()
  );

-- Rows may only point at files in the inserter's own storage folder
-- (uploads always go to {uid}/...). Without this, a row could name
-- someone else's file and the practice-member policies below would hand
-- out read/delete on it. DICOM originals additionally need a billed
-- subscription.
drop policy if exists "attachment rows point at own files" on public.attachments;
create policy "attachment rows point at own files"
  on public.attachments as restrictive for insert to authenticated
  with check (
    (storage.foldername(path))[1] = auth.uid()::text
    and (
      original_path is null
      or (
        (storage.foldername(original_path))[1] = auth.uid()::text
        and public.current_user_has_billed_subscription()
      )
    )
  );

-- File pointers are set once, at insert (checked above), and never
-- change from the browser: that keeps the folder check meaningful, stops
-- a non-billed account attaching a DICOM original later, and still lets
-- a practice that downgrades edit captions/kind on existing images.
-- Edge functions (service role) may still reassign created_by etc.
create or replace function public.freeze_attachment_file_paths()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (new.path is distinct from old.path
          or new.original_path is distinct from old.original_path) then
    raise exception 'An image''s files can''t be changed.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists freeze_attachment_file_paths on public.attachments;
create trigger freeze_attachment_file_paths
  before update on public.attachments
  for each row execute function public.freeze_attachment_file_paths();

-- Teammates can read/delete the original .dcm of shared images, as they
-- already can the preview and thumbnail (20261111_practice_attachment_files).
drop policy if exists "practice members read shared attachment files" on storage.objects;
create policy "practice members read shared attachment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.attachments a
      join public.practice_members m on m.practice_id = a.practice_id
      -- the preview, its thumbnail ("<path minus ext>.thumb.jpg"), or the DICOM original
      where (a.path = storage.objects.name
             or regexp_replace(a.path, '\.[^./]+$', '') || '.thumb.jpg' = storage.objects.name
             or a.original_path = storage.objects.name)
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "practice members delete shared attachment files" on storage.objects;
create policy "practice members delete shared attachment files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.attachments a
      join public.practice_members m on m.practice_id = a.practice_id
      where (a.path = storage.objects.name
             or regexp_replace(a.path, '\.[^./]+$', '') || '.thumb.jpg' = storage.objects.name
             or a.original_path = storage.objects.name)
        and m.user_id = auth.uid()
    )
  );
