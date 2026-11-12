-- YN Studio: paid software downloads ($1 per file by default).
-- Run once in Supabase -> SQL Editor. Safe to run again.
--
-- Needs, run before: supabase-marketplace-upgrade.sql (profiles, notifications) and supabase-service-shop.sql
-- (it defines yn_svc_is_admin(), the "is this user an admin" check used by every admin policy here).
--
-- How it works
--   * The ADMIN adds files in Admin -> Software: a title, a short text, a price ($1.00 by default), the file itself
--     (uploaded to a PRIVATE bucket, or a link such as Google Drive / Mega) and optionally a how-to-download video.
--   * Customers can read the catalog (software_files) but NEVER the file location. That lives in software_sources,
--     which only admins can read.
--   * A customer never writes to software_purchases. The SERVER (service-role key) reads the price from software_files,
--     creates the purchase as awaiting_payment, builds the Bakong KHQR, and marks it paid only after Bakong confirms.
--   * After payment the server hands out a short-lived download link, as many times as the customer wants.

-- 0) the admin check (same helper as the service shop; created here too so this file also runs alone)
create or replace function public.yn_svc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
$$;
revoke all on function public.yn_svc_is_admin() from public;
grant execute on function public.yn_svc_is_admin() to anon, authenticated;

-- 1) catalog: one row per downloadable file (everything here is safe to show to customers)
create table if not exists public.software_files (
  id           uuid primary key default gen_random_uuid(),
  title_en     text not null check (char_length(btrim(title_en)) between 1 and 80),
  title_km     text not null default '',
  desc_en      text not null default '' check (char_length(desc_en) <= 300),
  desc_km      text not null default '' check (char_length(desc_km) <= 300),
  platform     text not null default 'windows' check (platform in ('windows', 'mac', 'android', 'ios', 'linux', 'other')),
  version      text not null default '' check (char_length(version) <= 24),
  price        numeric(10,2) not null default 1.00 check (price >= 0.01 and price <= 100),
  file_name    text not null default '',                -- shown to the customer (the real storage path stays private)
  file_size    bigint check (file_size is null or file_size >= 0),
  video_url    text check (video_url is null or video_url ~ '^https://'),   -- how-to video: an uploaded file's public link, or a YouTube link
  video_kind   text not null default 'none' check (video_kind in ('none', 'upload', 'youtube')),
  enabled      boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists software_files_sort_idx on public.software_files(enabled, sort_order);

-- 2) where the real file is. ADMIN ONLY: customers must never see a path or a link before they have paid.
create table if not exists public.software_sources (
  file_id      uuid primary key references public.software_files(id) on delete cascade,
  kind         text not null default 'upload' check (kind in ('upload', 'link')),
  file_path    text check (file_path is null or char_length(file_path) <= 300),       -- private bucket software-files
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 600)),
  check ((kind = 'upload' and file_path is not null) or (kind = 'link' and external_url is not null))
);

-- 3) purchases (written by the server only)
create table if not exists public.software_purchases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  file_id          uuid not null references public.software_files(id) on delete restrict,   -- a file with buyers cannot be deleted, only switched off
  title            text not null default '',          -- snapshot, so history stays readable if the file is renamed
  price            numeric(10,2) not null check (price > 0),
  currency         text not null default 'USD',
  status           text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled')),
  payment_method   text,
  bakong_md5s      text[] not null default '{}',
  bakong_hash      text,
  paid_at          timestamptz,
  download_count   integer not null default 0,
  last_download_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists software_purchases_user_idx on public.software_purchases(user_id, created_at desc);
create index if not exists software_purchases_file_idx on public.software_purchases(file_id, status);
create unique index if not exists software_purchases_bakong_hash_uidx on public.software_purchases(bakong_hash) where bakong_hash is not null;
-- a customer buys each file once: after that it is theirs to download again and again
create unique index if not exists software_purchases_one_paid_uidx on public.software_purchases(user_id, file_id) where status = 'paid';

-- 4) row level security + grants
alter table public.software_files     enable row level security;
alter table public.software_sources   enable row level security;
alter table public.software_purchases enable row level security;

revoke all on public.software_files, public.software_sources, public.software_purchases from anon, authenticated;
grant select on public.software_files to authenticated;
grant insert, update, delete on public.software_files to authenticated;      -- RLS below limits writes to admins
grant select, insert, update, delete on public.software_sources to authenticated;   -- RLS below: admins only
grant select on public.software_purchases to authenticated;                   -- a customer reads only their own; nobody writes from a browser

drop policy if exists "sw files read" on public.software_files;
create policy "sw files read" on public.software_files for select to authenticated
  using (enabled or public.yn_svc_is_admin());
drop policy if exists "sw files admin" on public.software_files;
create policy "sw files admin" on public.software_files for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "sw sources admin" on public.software_sources;
create policy "sw sources admin" on public.software_sources for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "sw purchases read" on public.software_purchases;
create policy "sw purchases read" on public.software_purchases for select to authenticated
  using (user_id = auth.uid() or public.yn_svc_is_admin());

create or replace function public.yn_software_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists yn_software_files_touch on public.software_files;
create trigger yn_software_files_touch before update on public.software_files
  for each row execute function public.yn_software_touch();

-- 5) tell the customer when the payment lands (the existing push webhook sends this to the phone)
create or replace function public.yn_software_purchase_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (new.user_id, 'customer', 'Your download is ready',
              'ទាញយកបានហើយ · ' || coalesce(nullif(new.title, ''), 'Software'), 'service', '/services/software');
  end if;
  return new;
exception when others then
  return new;   -- a notification problem must never block a payment
end $$;
drop trigger if exists yn_software_purchase_notify on public.software_purchases;
create trigger yn_software_purchase_notify after update of status on public.software_purchases
  for each row execute function public.yn_software_purchase_notify();

-- live updates (the page flips from "Get" to "Download" the moment the payment is confirmed)
do $$ begin
  alter publication supabase_realtime add table public.software_purchases;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- 6) storage
--    software-files   PRIVATE. The files people pay for. Only admins touch it from a browser; customers get a 2-minute link from the server.
--    software-guides  PUBLIC.  The how-to videos (they are free to watch, they help people buy). 50 MB is the free-plan limit per file;
--                             for a longer video paste a YouTube link in the admin page instead.
insert into storage.buckets (id, name, public, file_size_limit)
values ('software-files', 'software-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('software-guides', 'software-guides', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sw files bucket admin" on storage.objects;
create policy "sw files bucket admin" on storage.objects for all to authenticated
  using (bucket_id = 'software-files' and public.yn_svc_is_admin())
  with check (bucket_id = 'software-files' and public.yn_svc_is_admin());

drop policy if exists "sw guides read" on storage.objects;
create policy "sw guides read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'software-guides');
drop policy if exists "sw guides admin" on storage.objects;
create policy "sw guides admin" on storage.objects for all to authenticated
  using (bucket_id = 'software-guides' and public.yn_svc_is_admin())
  with check (bucket_id = 'software-guides' and public.yn_svc_is_admin());
