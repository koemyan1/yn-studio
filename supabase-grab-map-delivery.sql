-- YN Studio: delivery pricing and custom rider avatar for the purple Map experience.
create table if not exists public.delivery_settings (
  id integer primary key check (id = 1),
  base_fee numeric not null default 1,
  base_km numeric not null default 2,
  extra_fee numeric not null default 0.5,
  extra_km numeric not null default 1,
  store_lat numeric not null default 11.5564,
  store_lng numeric not null default 104.9282,
  rider_avatar_url text,
  updated_at timestamptz not null default now()
);
insert into public.delivery_settings (id) values (1) on conflict (id) do nothing;
alter table public.delivery_settings enable row level security;
drop policy if exists "delivery settings public read" on public.delivery_settings;
create policy "delivery settings public read" on public.delivery_settings for select to anon, authenticated using (true);
drop policy if exists "delivery settings admin write" on public.delivery_settings;
create policy "delivery settings admin write" on public.delivery_settings for all to authenticated
using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
insert into storage.buckets (id, name, public) values ('delivery-assets','delivery-assets',true) on conflict (id) do update set public=true;
drop policy if exists "delivery assets public read" on storage.objects;
create policy "delivery assets public read" on storage.objects for select using (bucket_id='delivery-assets');
drop policy if exists "delivery assets admin upload" on storage.objects;
create policy "delivery assets admin upload" on storage.objects for insert to authenticated with check (bucket_id='delivery-assets' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "delivery assets admin update" on storage.objects;
create policy "delivery assets admin update" on storage.objects for update to authenticated using (bucket_id='delivery-assets' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (bucket_id='delivery-assets' and exists (select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
