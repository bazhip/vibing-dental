-- DICOM radiographs (paid plans only).
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
-- free beta, comped/grandfathered, lapsed or no practice → not paid.
create or replace function public.user_has_billed_subscription(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.practices p on p.id = pr.practice_id
    where pr.id = uid
      and p.subscription_status in ('active', 'trialing', 'past_due')
  );
$$;
revoke all on function public.user_has_billed_subscription(uuid) from public;
grant execute on function public.user_has_billed_subscription(uuid) to authenticated;

-- Restrictive = ANDed with the existing permissive policies, so free
-- accounts can't store a .dcm or point a row at one via the raw API.
drop policy if exists "dicom uploads require a paid plan" on storage.objects;
create policy "dicom uploads require a paid plan"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'attachments'
    or lower(name) not like '%.dcm'
    or public.user_has_billed_subscription(auth.uid())
  );

drop policy if exists "dicom rows require a paid plan" on public.attachments;
create policy "dicom rows require a paid plan"
  on public.attachments as restrictive for insert to authenticated
  with check (original_path is null or public.user_has_billed_subscription(auth.uid()));

-- original_path is set once, at insert (gated above). Freezing it keeps
-- free accounts from attaching an original later, while a practice that
-- downgrades can still edit captions/kind on its existing DICOM images.
create or replace function public.freeze_attachment_original_path()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and new.original_path is distinct from old.original_path then
    raise exception 'An image''s original file can''t be changed.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists freeze_attachment_original_path on public.attachments;
create trigger freeze_attachment_original_path
  before update on public.attachments
  for each row execute function public.freeze_attachment_original_path();

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
