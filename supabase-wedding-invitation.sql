-- YN Studio Khmer Wedding E-Invitation
-- Run this in Supabase SQL Editor before using the wedding admin page.

create table if not exists public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  slug text unique not null,
  bride_name text not null,
  groom_name text not null,
  bride_parents text default '',
  groom_parents text default '',
  wedding_date date not null,
  wedding_time time,
  venue text default '',
  address text default '',
  maps_url text default '',
  story text default '',
  cover_url text default '',
  gallery_urls jsonb not null default '[]'::jsonb,
  music_url text default '',
  schedule jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wedding_invitations_slug_idx on public.wedding_invitations(slug);
create index if not exists wedding_invitations_published_idx on public.wedding_invitations(published);

alter table public.wedding_invitations enable row level security;

drop policy if exists "Published wedding invitations are public" on public.wedding_invitations;
create policy "Published wedding invitations are public"
on public.wedding_invitations for select
using (published = true);

drop policy if exists "Admins manage wedding invitations" on public.wedding_invitations;
create policy "Admins manage wedding invitations"
on public.wedding_invitations for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

insert into storage.buckets (id, name, public)
values ('wedding-invitations', 'wedding-invitations', true)
on conflict (id) do update set public = true;

drop policy if exists "Public wedding invitation files" on storage.objects;
create policy "Public wedding invitation files"
on storage.objects for select
using (bucket_id = 'wedding-invitations');

drop policy if exists "Admins upload wedding invitation files" on storage.objects;
create policy "Admins upload wedding invitation files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'wedding-invitations'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins update wedding invitation files" on storage.objects;
create policy "Admins update wedding invitation files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'wedding-invitations'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins delete wedding invitation files" on storage.objects;
create policy "Admins delete wedding invitation files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'wedding-invitations'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);
