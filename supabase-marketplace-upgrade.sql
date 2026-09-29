-- YN Studio marketplace upgrade: run once in Supabase SQL Editor.
alter table public.product_option_values add column if not exists price_adjustment numeric(12,2) not null default 0;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.banners enable row level security;
drop policy if exists "banners public read" on public.banners;
create policy "banners public read" on public.banners for select using (true);
drop policy if exists "admins manage banners" on public.banners;
create policy "admins manage banners" on public.banners for all using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
) with check (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

insert into storage.buckets (id,name,public) values ('banner-images','banner-images',true)
on conflict (id) do update set public=true;
drop policy if exists "banner images public read" on storage.objects;
create policy "banner images public read" on storage.objects for select using (bucket_id='banner-images');
drop policy if exists "admins upload banner images" on storage.objects;
create policy "admins upload banner images" on storage.objects for insert with check (
 bucket_id='banner-images' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);
drop policy if exists "admins delete banner images" on storage.objects;
create policy "admins delete banner images" on storage.objects for delete using (
 bucket_id='banner-images' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);
