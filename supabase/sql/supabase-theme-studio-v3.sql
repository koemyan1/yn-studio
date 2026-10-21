-- YN Studio: Theme Studio v3 (pictures, buttons, backgrounds)
-- Run once in Supabase → SQL Editor. Safe to re-run. No table changes are needed for the new
-- theme features (they are stored inside site_themes.config JSON); this only adds a storage
-- bucket so theme pictures are uploaded instead of being embedded in the theme row.

insert into storage.buckets (id, name, public)
values ('theme-assets', 'theme-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Theme assets are public" on storage.objects;
create policy "Theme assets are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'theme-assets');

drop policy if exists "Admins upload theme assets" on storage.objects;
create policy "Admins upload theme assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'theme-assets' and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins delete theme assets" on storage.objects;
create policy "Admins delete theme assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'theme-assets' and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
