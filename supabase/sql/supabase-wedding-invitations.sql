-- YN Studio: Wedding e-invitations (admin builds them, guests open a public link, no login needed).
-- Run once in Supabase -> SQL Editor. Safe to run again.

-- 1) The invitations. `data` holds everything the admin edits (names, date, opening style, songs, butterflies...).
create table if not exists public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null default 'Wedding invitation',
  published boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  views integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wedding_invitations_created_idx on public.wedding_invitations(created_at desc);
alter table public.wedding_invitations enable row level security;

-- Anyone (even signed out) may read a PUBLISHED invitation. Drafts are visible to admins only.
drop policy if exists "invitations public read" on public.wedding_invitations;
create policy "invitations public read" on public.wedding_invitations for select
  using (published = true or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin insert" on public.wedding_invitations;
create policy "invitations admin insert" on public.wedding_invitations for insert
  with check (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin update" on public.wedding_invitations;
create policy "invitations admin update" on public.wedding_invitations for update
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin delete" on public.wedding_invitations;
create policy "invitations admin delete" on public.wedding_invitations for delete
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

create or replace function public.yn_invitations_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists yn_invitations_touch on public.wedding_invitations;
create trigger yn_invitations_touch before update on public.wedding_invitations
  for each row execute function public.yn_invitations_touch();

-- 2) Guests cannot update the table, so a tiny function counts the opens (published invitations only).
create or replace function public.invitation_count_view(p_slug text) returns void
language sql security definer set search_path = public as $$
  update public.wedding_invitations set views = views + 1 where slug = lower(p_slug) and published = true;
$$;
revoke all on function public.invitation_count_view(text) from public;
grant execute on function public.invitation_count_view(text) to anon, authenticated;

-- 3) Storage for the opening picture, gallery photos and songs (public read, admin write).
insert into storage.buckets (id, name, public) values ('invitation-assets', 'invitation-assets', true)
  on conflict (id) do update set public = true;
drop policy if exists "invitation assets public read" on storage.objects;
create policy "invitation assets public read" on storage.objects for select using (bucket_id = 'invitation-assets');
drop policy if exists "invitation assets admin insert" on storage.objects;
create policy "invitation assets admin insert" on storage.objects for insert
  with check (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitation assets admin update" on storage.objects;
create policy "invitation assets admin update" on storage.objects for update
  using (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitation assets admin delete" on storage.objects;
create policy "invitation assets admin delete" on storage.objects for delete
  using (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
