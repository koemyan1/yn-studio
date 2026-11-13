-- YN Studio: Book cover service (250 riel per page by default).
-- Run once in Supabase -> SQL Editor. Safe to run again.
--
-- Needs, run before: supabase-marketplace-upgrade.sql (profiles, notifications) and supabase-bakong.sql.
--
-- How it works
--   * The ADMIN adds designs in Admin -> Book covers: a picture of the blank cover, a name, a price per page
--     (250 riel by default), and the questions the customer must answer (subject, name, class, school ...).
--     Each question also remembers WHERE its text goes on the cover (in % of the page, in the middle band by default).
--   * The customer picks a design, answers the questions, optionally adds more subjects (each extra subject = one more page),
--     and can add MORE THAN ONE DESIGN to the same order (up to 6 designs, 20 pages in all). They pay once by KHQR in riel
--     (the sum of pages x each design's own price) and then drag every text where they want it. They press "Send to print".
--   * A customer never writes to book_cover_orders from the browser. The SERVER (service-role key) reads the price from
--     book_cover_designs, creates the order, builds the KHQR and marks it paid only after Bakong confirms the exact riel amount.
--   * Admins read every order (with the customer's name, phone and location) and can download / print the finished covers.

-- 0) the admin check (same helper as the service shop / software files; created here too so this file also runs alone)
create or replace function public.yn_svc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
$$;
revoke all on function public.yn_svc_is_admin() from public;
grant execute on function public.yn_svc_is_admin() to anon, authenticated;

-- 1) designs (everything here is safe to show to customers)
create table if not exists public.book_cover_designs (
  id             uuid primary key default gen_random_uuid(),
  name_en        text not null check (char_length(btrim(name_en)) between 1 and 60),
  name_km        text not null default '' check (char_length(name_km) <= 60),
  image_url      text not null check (image_url ~ '^https://'),            -- the blank cover (public bucket book-covers)
  price_per_page integer not null default 250 check (price_per_page between 100 and 100000),   -- riel
  fields         jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 12),
  enabled        boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists book_cover_designs_sort_idx on public.book_cover_designs(enabled, sort_order);

-- 2) orders (written by the server only)
create table if not exists public.book_cover_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  design_id      uuid references public.book_cover_designs(id) on delete set null,
  design_name    text not null default '',                                  -- snapshots: an order stays printable even if the design is edited or removed
  design_image   text not null default '',
  design_fields  jsonb not null default '[]'::jsonb,
  covers         jsonb not null default '[]'::jsonb check (jsonb_typeof(covers) = 'array'),   -- [{ values:{key:text}, pos:{key:{x,y,size}} }]
  pages          integer not null check (pages between 1 and 20),
  price_per_page integer not null check (price_per_page > 0),
  total          integer not null check (total > 0),                        -- whole riel
  currency       text not null default 'KHR',
  status         text not null default 'pending' check (status in ('pending', 'paid', 'submitted', 'printed', 'delivered', 'cancelled')),
  contact_name   text not null default '',
  phone          text not null default '',
  address        text not null default '',
  notes          text not null default '',
  lat            double precision,
  lng            double precision,
  payment_method text,
  bakong_md5s    text[] not null default '{}',
  bakong_hash    text,
  paid_at        timestamptz,
  submitted_at   timestamptz,
  admin_note     text not null default '' check (char_length(admin_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- 2b) one order = several designs. `items` holds one entry per design:
--     [{ design_id, design_name, design_image, design_fields, price_per_page, covers:[{ values, pos }] }]
--     Orders made before this column existed have items = [] and are read from the single-design columns above (nothing to migrate).
--     The single-design columns keep mirroring the FIRST design, so old code that still reads them keeps working.
alter table public.book_cover_orders add column if not exists items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 6);

create index if not exists book_cover_orders_user_idx on public.book_cover_orders(user_id, created_at desc);
create index if not exists book_cover_orders_status_idx on public.book_cover_orders(status, created_at desc);
create unique index if not exists book_cover_orders_bakong_hash_uidx on public.book_cover_orders(bakong_hash) where bakong_hash is not null;

-- 3) row level security + grants
alter table public.book_cover_designs enable row level security;
alter table public.book_cover_orders  enable row level security;

revoke all on public.book_cover_designs, public.book_cover_orders from anon, authenticated;
grant select on public.book_cover_designs to authenticated;
grant insert, update, delete on public.book_cover_designs to authenticated;          -- RLS below limits writes to admins
grant select on public.book_cover_orders to authenticated;                           -- a customer reads only their own; admins read all
grant update (status, admin_note, updated_at) on public.book_cover_orders to authenticated;   -- RLS below: admins only
grant delete on public.book_cover_orders to authenticated;                           -- a customer may delete an UNPAID one; admins any

drop policy if exists "bc designs read" on public.book_cover_designs;
create policy "bc designs read" on public.book_cover_designs for select to authenticated
  using (enabled or public.yn_svc_is_admin());
drop policy if exists "bc designs admin" on public.book_cover_designs;
create policy "bc designs admin" on public.book_cover_designs for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "bc orders read" on public.book_cover_orders;
create policy "bc orders read" on public.book_cover_orders for select to authenticated
  using (user_id = auth.uid() or public.yn_svc_is_admin());
drop policy if exists "bc orders admin update" on public.book_cover_orders;
create policy "bc orders admin update" on public.book_cover_orders for update to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());
drop policy if exists "bc orders delete" on public.book_cover_orders;
create policy "bc orders delete" on public.book_cover_orders for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.yn_svc_is_admin());

create or replace function public.yn_bc_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists yn_bc_designs_touch on public.book_cover_designs;
create trigger yn_bc_designs_touch before update on public.book_cover_designs
  for each row execute function public.yn_bc_touch();

-- 4) tell the customer when the covers are printed / on their way (the existing push webhook sends this to the phone)
create or replace function public.yn_bc_order_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'printed' and old.status is distinct from 'printed' then
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (new.user_id, 'customer', 'Your book covers are printed', 'សៀវភៅគម្របរបស់អ្នកត្រូវបានបោះពុម្ពរួចហើយ', 'service', '/services/book-cover');
  elsif new.status = 'delivered' and old.status is distinct from 'delivered' then
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (new.user_id, 'customer', 'Your book covers are delivered', 'សៀវភៅគម្របរបស់អ្នកត្រូវបានដឹកជូនហើយ', 'service', '/services/book-cover');
  end if;
  return new;
exception when others then
  return new;   -- a notification problem must never block an admin update
end $$;
drop trigger if exists yn_bc_order_notify on public.book_cover_orders;
create trigger yn_bc_order_notify after update of status on public.book_cover_orders
  for each row execute function public.yn_bc_order_notify();

-- live updates (the admin list and the customer page refresh by themselves)
do $$ begin
  alter publication supabase_realtime add table public.book_cover_orders;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- 5) storage: the blank cover pictures. PUBLIC to read (they are shown in the catalog), admin-only to write. 10 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bc bucket read" on storage.objects;
create policy "bc bucket read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-covers');
drop policy if exists "bc bucket admin" on storage.objects;
create policy "bc bucket admin" on storage.objects for all to authenticated
  using (bucket_id = 'book-covers' and public.yn_svc_is_admin())
  with check (bucket_id = 'book-covers' and public.yn_svc_is_admin());
