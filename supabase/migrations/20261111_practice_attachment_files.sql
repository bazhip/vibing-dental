-- Teammates on a shared chart couldn't view (or remove) its images: the
-- storage policy only covered the uploader's own folder, so signed URLs
-- failed for everyone else in the practice. Practice members may now
-- read and delete the files behind attachment rows shared with their
-- practice. Uploads still go only into your own folder.
drop policy if exists "practice members read shared attachment files" on storage.objects;
create policy "practice members read shared attachment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1
      from public.attachments a
      join public.practice_members m on m.practice_id = a.practice_id
      -- the original file, or its thumbnail ("<path minus ext>.thumb.jpg")
      where (a.path = storage.objects.name
             or regexp_replace(a.path, '\.[^./]+$', '') || '.thumb.jpg' = storage.objects.name)
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
      -- the original file, or its thumbnail ("<path minus ext>.thumb.jpg")
      where (a.path = storage.objects.name
             or regexp_replace(a.path, '\.[^./]+$', '') || '.thumb.jpg' = storage.objects.name)
        and m.user_id = auth.uid()
    )
  );
