-- Private bucket for supporting documents and exemplar files.
-- Objects are stored under "<user id>/..." and only that user can read or write them.
-- Files are served through short-lived signed URLs; the bucket is never public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'essay-files',
  'essay-files',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set public = false;

create policy "essay-files: owner can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'essay-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "essay-files: owner can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'essay-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "essay-files: owner can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'essay-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "essay-files: owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'essay-files' and (storage.foldername(name))[1] = auth.uid()::text);
