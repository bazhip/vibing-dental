-- PDF download links for in-app browsers.
-- Android in-app browsers (WebViews in Gmail, Outlook, Facebook, …) can't
-- save a PDF the page generated in memory, but they do download a normal
-- https link. The app uploads the PDF here and shows a short-lived signed
-- link to tap. PRIVATE bucket; each user may only touch their own folder
-- ({user_id}/…), and the app overwrites one file per user, so this never
-- grows beyond one PDF each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users manage own exports" on storage.objects;
create policy "users manage own exports"
  on storage.objects for all to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
