-- Run this in the Supabase SQL editor before using meal photo capture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own meal images" on storage.objects;
create policy "Users upload own meal images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meal-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users read own meal images" on storage.objects;
create policy "Users read own meal images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meal-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
