-- YN Studio: let a customer upload their OWN cover picture (Book cover -> "My own design"). Run ONCE in Supabase -> SQL Editor. Safe to re-run.
--
-- Run AFTER: supabase-book-covers.sql.
--
-- A public bucket `book-cover-uploads`. Anyone can READ a picture (the admin must be able to print it, the customer sees it in the preview),
-- but a signed-in customer can only WRITE / DELETE inside their OWN folder (<their user id>/...). 10 MB, pictures only.
-- The server only accepts a custom design whose picture sits in the customer's own folder of this bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-cover-uploads', 'book-cover-uploads', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bc uploads read" on storage.objects;
create policy "bc uploads read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-cover-uploads');
drop policy if exists "bc uploads insert own" on storage.objects;
create policy "bc uploads insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'book-cover-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "bc uploads delete own" on storage.objects;
create policy "bc uploads delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'book-cover-uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.yn_svc_is_admin()));
