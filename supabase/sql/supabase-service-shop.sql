-- YN Studio: pay-first service shop (Printing, Copy, Social post, Poster, Logo).
-- Run once in Supabase -> SQL Editor. Safe to run again (it never overwrites prices or options you already edited).
--
-- Needs, run before: supabase-marketplace-upgrade.sql (profiles, notifications), supabase-grab-map-delivery.sql
-- (delivery_settings), supabase-secret-themes-and-store-location.sql (store_map_url), supabase-bakong.sql, supabase-services.sql.
--
-- How it works
--   * The ADMIN sets every price here (service_prices) and every question + extra (service_option_groups / service_options).
--   * A customer never writes to service_orders. The SERVER (service-role key) reads this catalog, recomputes the total itself,
--     creates the order as awaiting_payment, builds the Bakong KHQR, and only marks it paid after Bakong confirms the money.
--   * Customers can only READ their own orders. Admins can only move the workflow (status, files, notes, refund note).
--   * The old service_requests / product_suggestions tables and the public service-uploads bucket are NOT touched.

-- 0) helper: is the signed-in user an admin? (same rule as every other admin policy in this project)
create or replace function public.yn_svc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
$$;
revoke all on function public.yn_svc_is_admin() from public;
grant execute on function public.yn_svc_is_admin() to anon, authenticated;

-- 1) the store name + address shown for pick-up (the map pin and the Google Maps link already exist in delivery_settings)
alter table public.delivery_settings add column if not exists store_name text;
alter table public.delivery_settings add column if not exists store_address text;

-- 2) catalog: one row per service
create table if not exists public.service_catalog (
  key         text primary key check (key ~ '^[a-z0-9_-]{1,32}$'),
  kind        text not null default 'digital' check (kind in ('physical', 'digital')),  -- physical = pick up / delivery, digital = files in the app
  enabled     boolean not null default false,
  sort_order  integer not null default 0,
  name_en     text not null,
  name_km     text not null default '',
  desc_en     text not null default '',
  desc_km     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3) base prices (a service can have several: "A4 colour, per page", "Logo - basic", ...)
create table if not exists public.service_prices (
  id          uuid primary key default gen_random_uuid(),
  service_key text not null references public.service_catalog(key) on delete cascade,
  slug        text not null default replace(gen_random_uuid()::text, '-', ''),
  label_en    text not null,
  label_km    text not null default '',
  amount      numeric(10,2) not null check (amount >= 0 and amount <= 10000),
  unit        text not null default 'job' check (unit in ('page', 'copy', 'item', 'job')),
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  unique (service_key, slug)
);
create index if not exists service_prices_service_idx on public.service_prices(service_key, sort_order);

-- 4) questions (option groups)
create table if not exists public.service_option_groups (
  id          uuid primary key default gen_random_uuid(),
  service_key text not null references public.service_catalog(key) on delete cascade,
  slug        text not null default replace(gen_random_uuid()::text, '-', ''),
  label_en    text not null,
  label_km    text not null default '',
  type        text not null default 'single' check (type in ('single', 'multi', 'number', 'text')),
  required    boolean not null default false,
  is_quantity boolean not null default false,            -- number groups only: multiplies the price (pages, copies)
  min_value   integer not null default 1,                -- number groups only
  max_value   integer not null default 1000,
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  unique (service_key, slug),
  check (min_value >= 0 and max_value <= 1000 and min_value <= max_value),
  check (not is_quantity or (type = 'number' and required and min_value >= 1))
);
create index if not exists service_option_groups_service_idx on public.service_option_groups(service_key, sort_order);

-- 5) answers / extras inside a question
create table if not exists public.service_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.service_option_groups(id) on delete cascade,
  slug        text not null default replace(gen_random_uuid()::text, '-', ''),
  label_en    text not null,
  label_km    text not null default '',
  price_type  text not null default 'fixed' check (price_type in ('fixed', 'per_unit', 'percent')),
  price       numeric(10,2) not null default 0 check (price >= 0 and price <= 10000),
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  unique (group_id, slug)
);
create index if not exists service_options_group_idx on public.service_options(group_id, sort_order);

-- 6) orders (written by the server only)
create table if not exists public.service_orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  service_key      text not null references public.service_catalog(key),
  price_id         uuid,                                  -- informational; the snapshot below is what counts
  price_label      text not null default '',
  choices          jsonb not null default '[]'::jsonb,    -- snapshot of every answer + its price at order time
  unit_price       numeric(10,2) not null default 0,
  quantity         integer not null default 1 check (quantity >= 1),
  subtotal         numeric(10,2) not null check (subtotal >= 0),
  delivery_fee     numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total            numeric(10,2) not null check (total > 0),
  currency         text not null default 'USD',
  status           text not null default 'awaiting_payment'
                   check (status in ('awaiting_payment', 'paid', 'in_progress', 'ready', 'done', 'cancelled')),
  fulfilment       text not null check (fulfilment in ('pickup', 'delivery', 'digital')),
  delivery_lat     double precision check (delivery_lat is null or delivery_lat between -90 and 90),
  delivery_lng     double precision check (delivery_lng is null or delivery_lng between -180 and 180),
  delivery_km      numeric(8,2),
  delivery_address text,
  delivery_phone   text,
  customer_note    text,
  file_paths       text[] not null default '{}',          -- customer files, private bucket service-private
  result_paths     text[] not null default '{}',          -- finished files, private bucket service-results
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  payment_method   text,
  bakong_md5s      text[] not null default '{}',
  bakong_hash      text,
  paid_at          timestamptz,
  admin_note       text,
  cancel_reason    text,
  refund_status    text not null default 'none' check (refund_status in ('none', 'refunded')),
  refund_note      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (total = subtotal + delivery_fee),
  check (fulfilment <> 'delivery' or (delivery_lat is not null and delivery_lng is not null and delivery_phone is not null))
);
create index if not exists service_orders_user_idx    on public.service_orders(user_id, created_at desc);
create index if not exists service_orders_status_idx  on public.service_orders(status, created_at desc);
create index if not exists service_orders_service_idx on public.service_orders(service_key, created_at desc);
create unique index if not exists service_orders_bakong_hash_uidx on public.service_orders(bakong_hash) where bakong_hash is not null;

-- 7) row level security + grants
alter table public.service_catalog       enable row level security;
alter table public.service_prices        enable row level security;
alter table public.service_option_groups enable row level security;
alter table public.service_options       enable row level security;
alter table public.service_orders        enable row level security;

revoke all on public.service_catalog, public.service_prices, public.service_option_groups, public.service_options, public.service_orders from anon, authenticated;
grant select on public.service_catalog, public.service_prices, public.service_option_groups, public.service_options to anon, authenticated;
grant insert, update, delete on public.service_catalog, public.service_prices, public.service_option_groups, public.service_options to authenticated; -- RLS below limits writes to admins
grant select on public.service_orders to authenticated;
-- An admin may only move the workflow. Totals, prices, payment fields and the customer's answers can never be written from a browser.
grant update (status, admin_note, result_paths, cancel_reason, refund_status, refund_note) on public.service_orders to authenticated;

-- catalog: everyone reads ENABLED rows, admins read + write everything
drop policy if exists "svc catalog read" on public.service_catalog;
create policy "svc catalog read" on public.service_catalog for select to anon, authenticated
  using (enabled or public.yn_svc_is_admin());
drop policy if exists "svc catalog admin" on public.service_catalog;
create policy "svc catalog admin" on public.service_catalog for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "svc prices read" on public.service_prices;
create policy "svc prices read" on public.service_prices for select to anon, authenticated
  using ((enabled and exists (select 1 from public.service_catalog c where c.key = service_key and c.enabled)) or public.yn_svc_is_admin());
drop policy if exists "svc prices admin" on public.service_prices;
create policy "svc prices admin" on public.service_prices for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "svc groups read" on public.service_option_groups;
create policy "svc groups read" on public.service_option_groups for select to anon, authenticated
  using ((enabled and exists (select 1 from public.service_catalog c where c.key = service_key and c.enabled)) or public.yn_svc_is_admin());
drop policy if exists "svc groups admin" on public.service_option_groups;
create policy "svc groups admin" on public.service_option_groups for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "svc options read" on public.service_options;
create policy "svc options read" on public.service_options for select to anon, authenticated
  using ((enabled and exists (select 1 from public.service_option_groups g join public.service_catalog c on c.key = g.service_key
                              where g.id = group_id and g.enabled and c.enabled)) or public.yn_svc_is_admin());
drop policy if exists "svc options admin" on public.service_options;
create policy "svc options admin" on public.service_options for all to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

-- orders: a customer reads only their own. There is deliberately NO insert/delete policy: the server creates orders.
drop policy if exists "svc orders read" on public.service_orders;
create policy "svc orders read" on public.service_orders for select to authenticated
  using (user_id = auth.uid() or public.yn_svc_is_admin());
drop policy if exists "svc orders admin update" on public.service_orders;
create policy "svc orders admin update" on public.service_orders for update to authenticated
  using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

-- 8) workflow guard: what a signed-in admin may do. The server (service role, auth.uid() is null) and the SQL editor are not limited.
create or replace function public.yn_service_order_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null then return new; end if;

  if old.status = 'cancelled' and (new.status is distinct from old.status) then
    raise exception 'A cancelled order cannot be changed.';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'awaiting_payment' then raise exception 'An order cannot go back to awaiting payment.'; end if;
    if new.status = 'cancelled' then
      if coalesce(btrim(new.cancel_reason), '') = '' then raise exception 'Please write a reason for cancelling.'; end if;
    elsif old.payment_status <> 'paid' then
      raise exception 'Only a paid order can be moved on. Payment is confirmed by the server, not by hand.';
    end if;
    if new.status in ('ready', 'done') and new.fulfilment = 'digital' and coalesce(array_length(new.result_paths, 1), 0) = 0 then
      raise exception 'Upload the finished files first.';
    end if;
  end if;
  if new.refund_status = 'refunded' and old.refund_status <> 'refunded' then
    if old.payment_status <> 'paid' or new.status <> 'cancelled' then raise exception 'Only a paid, cancelled order can be marked refunded.'; end if;
    if coalesce(btrim(new.refund_note), '') = '' then raise exception 'Write how the refund was sent (a note is required).'; end if;
  end if;
  return new;
end $$;
drop trigger if exists yn_service_order_guard on public.service_orders;
create trigger yn_service_order_guard before update on public.service_orders
  for each row execute function public.yn_service_order_guard();

-- 9) tell the customer at every step (the existing push webhook sends these to the phone)
create or replace function public.yn_service_order_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; m text; ono text;
begin
  if new.status is not distinct from old.status then return new; end if;
  ono := 'SV-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));   -- same number the app shows
  if new.status = 'paid' then
    t := 'Payment received'; m := 'បានទទួលការទូទាត់ · ' || ono;
  elsif new.status = 'in_progress' then
    t := 'We started your order'; m := 'យើងចាប់ផ្តើមធ្វើការបញ្ជាទិញរបស់អ្នកហើយ · ' || ono;
  elsif new.status = 'ready' then
    if new.fulfilment = 'pickup' then t := 'Ready for pick-up'; m := 'រួចរាល់សម្រាប់មកយក · ' || ono;
    elsif new.fulfilment = 'delivery' then t := 'Ready for delivery'; m := 'រួចរាល់សម្រាប់ដឹកជញ្ជូន · ' || ono;
    else t := 'Your files are ready to download'; m := 'ឯកសាររបស់អ្នករួចរាល់ អាចទាញយកបាន · ' || ono; end if;
  elsif new.status = 'done' then
    t := 'Order completed'; m := 'ការបញ្ជាទិញរួចរាល់ · ' || ono;
  elsif new.status = 'cancelled' and old.status <> 'awaiting_payment' then
    t := 'Order cancelled'; m := coalesce(nullif(btrim(new.cancel_reason), ''), 'Please contact us for details.') || ' · ' || ono;
  else
    return new;
  end if;
  insert into public.notifications(user_id, target_role, title, message, type, link)
    values (new.user_id, 'customer', t, m, 'service', '/services');
  return new;
exception when others then
  return new;   -- a notification problem must never block an order update
end $$;
drop trigger if exists yn_service_order_notify on public.service_orders;
create trigger yn_service_order_notify after update of status on public.service_orders
  for each row execute function public.yn_service_order_notify();

-- 9b) live status updates in the customer's "Your requests" (Supabase Realtime respects the select policy above)
do $$ begin
  alter publication supabase_realtime add table public.service_orders;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- 10) private storage: customer files and finished files are NOT public
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-private', 'service-private', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-results', 'service-results', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/zip',
              'application/postscript', 'application/illustrator'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- customer files live under <user id>/...; only that customer and admins can read them
drop policy if exists "svc private read" on storage.objects;
create policy "svc private read" on storage.objects for select to authenticated
  using (bucket_id = 'service-private' and ((storage.foldername(name))[1] = auth.uid()::text or public.yn_svc_is_admin()));
drop policy if exists "svc private upload" on storage.objects;
create policy "svc private upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "svc private delete" on storage.objects;
create policy "svc private delete" on storage.objects for delete to authenticated
  using (bucket_id = 'service-private' and ((storage.foldername(name))[1] = auth.uid()::text or public.yn_svc_is_admin()));

-- finished files live under <order id>/...; admins write, the paying customer reads
drop policy if exists "svc results read" on storage.objects;
create policy "svc results read" on storage.objects for select to authenticated
  using (bucket_id = 'service-results' and (public.yn_svc_is_admin() or exists (
    select 1 from public.service_orders o
    where o.id::text = (storage.foldername(name))[1] and o.user_id = auth.uid() and o.payment_status = 'paid' and o.status <> 'cancelled')));
drop policy if exists "svc results admin write" on storage.objects;
create policy "svc results admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-results' and public.yn_svc_is_admin());
drop policy if exists "svc results admin update" on storage.objects;
create policy "svc results admin update" on storage.objects for update to authenticated
  using (bucket_id = 'service-results' and public.yn_svc_is_admin()) with check (bucket_id = 'service-results' and public.yn_svc_is_admin());
drop policy if exists "svc results admin delete" on storage.objects;
create policy "svc results admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'service-results' and public.yn_svc_is_admin());

-- 11) starter catalog. Services start SWITCHED OFF and every price is a PLACEHOLDER: set your real prices in
--     Admin -> Service prices, then switch each service on. Re-running this file never overwrites what you edited.
insert into public.service_catalog (key, kind, enabled, sort_order, name_en, name_km, desc_en, desc_km) values
 ('print',  'physical', false, 10, 'Printing', 'ការបោះពុម្ព',
  'Documents, photos, flyers and name cards printed sharp, in colour or black and white.',
  'បោះពុម្ពឯកសារ រូបថត ខិត្តប័ណ្ណ និងកាតឈ្មោះ ច្បាស់ ជាពណ៌ ឬសខ្មៅ។'),
 ('copy',   'physical', false, 20, 'Copy', 'ថតចម្លង',
  'Quick photocopies and scans of IDs, forms and book pages. Send the file or bring the original.',
  'ថតចម្លង និងស្កេនអត្តសញ្ញាណប័ណ្ណ ទម្រង់ បែបបទ និងទំព័រសៀវភៅ ឲ្យលឿន។'),
 ('social', 'digital',  false, 30, 'Social media post design', 'ការរចនាប៉ុស្តិ៍បណ្តាញសង្គម',
  'Posts, stories and covers for Facebook, Instagram and TikTok that match your brand.',
  'រចនាប៉ុស្តិ៍ រឿងរ៉ាវ និងរូបគម្រប សម្រាប់ Facebook, Instagram និង TikTok តាមម៉ាកអ្នក។'),
 ('poster', 'digital',  false, 40, 'Poster design', 'ការរចនាប៉ូស្ទ័រ',
  'Eye-catching posters for events, promotions and shops, ready to print at any size.',
  'រចនាប៉ូស្ទ័រទាក់ទាញ សម្រាប់ព្រឹត្តិការណ៍ ប្រូម៉ូសិន និងហាង រួចបោះពុម្ពបានគ្រប់ទំហំ។'),
 ('logo',   'digital',  false, 50, 'Logo design', 'ការរចនាឡូហ្គោ',
  'A simple, memorable logo for your business, delivered ready for print and for screens.',
  'ឡូហ្គោសាមញ្ញ ងាយចងចាំ សម្រាប់អាជីវកម្មរបស់អ្នក សម្រាប់ទាំងបោះពុម្ព និងអេក្រង់។')
on conflict (key) do nothing;

insert into public.service_prices (service_key, slug, label_en, label_km, amount, unit, sort_order) values
 ('print',  'bw',           'Black and white, per page', 'ខ្មៅស ក្នុងមួយទំព័រ',       0.05, 'page', 10),
 ('print',  'colour',       'Colour, per page',          'ពណ៌ ក្នុងមួយទំព័រ',         0.25, 'page', 20),
 ('copy',   'bw',           'Black and white, per page', 'ខ្មៅស ក្នុងមួយទំព័រ',       0.03, 'page', 10),
 ('copy',   'colour',       'Colour, per page',          'ពណ៌ ក្នុងមួយទំព័រ',         0.20, 'page', 20),
 ('social', 'single',       'Single post',               'ប៉ុស្តិ៍មួយ',                5.00, 'job',  10),
 ('social', 'set',          'Set of 3 posts',            'ប៉ុស្តិ៍ ៣',                  12.00, 'job',  20),
 ('poster', 'standard',     'Poster design',             'ការរចនាប៉ូស្ទ័រ',            10.00, 'job',  10),
 ('poster', 'print-ready',  'Poster, print-ready',       'ប៉ូស្ទ័រត្រៀមបោះពុម្ព',      15.00, 'job',  20),
 ('logo',   'basic',        'Logo - basic',              'ឡូហ្គោ - មូលដ្ឋាន',          25.00, 'job',  10),
 ('logo',   'revisions',    'Logo - with revisions',     'ឡូហ្គោ - រួមការកែ',          45.00, 'job',  20)
on conflict (service_key, slug) do nothing;

insert into public.service_option_groups (service_key, slug, label_en, label_km, type, required, is_quantity, min_value, max_value, sort_order) values
 ('print',  'pages',     'Number of pages',            'ចំនួនទំព័រ',                          'number', true,  true,  1, 500, 10),
 ('print',  'copies',    'Number of copies',           'ចំនួនច្បាប់',                         'number', true,  true,  1, 100, 20),
 ('print',  'size',      'Paper size',                 'ទំហំក្រដាស',                          'single', true,  false, 1, 1000, 30),
 ('print',  'paper',     'Paper type',                 'ប្រភេទក្រដាស',                        'single', false, false, 1, 1000, 40),
 ('copy',   'pages',     'Number of pages',            'ចំនួនទំព័រ',                          'number', true,  true,  1, 500, 10),
 ('copy',   'copies',    'Number of copies',           'ចំនួនច្បាប់',                         'number', true,  true,  1, 100, 20),
 ('copy',   'size',      'Paper size',                 'ទំហំក្រដាស',                          'single', true,  false, 1, 1000, 30),
 ('social', 'platform',  'Platform',                   'វេទិកា',                              'single', true,  false, 1, 1000, 10),
 ('social', 'text',      'Text to show on the design', 'អក្សរដែលត្រូវដាក់លើការរចនា',          'text',   true,  false, 1, 1000, 20),
 ('social', 'style',     'Colours and style',          'ពណ៌ និងស្ទីល',                        'text',   false, false, 1, 1000, 30),
 ('social', 'revisions', 'Extra revisions',            'ការកែបន្ថែម',                         'number', false, false, 0, 5,    40),
 ('social', 'format',    'Delivery format',            'ទម្រង់ឯកសារ',                         'multi',  true,  false, 1, 1000, 50),
 ('poster', 'size',      'Poster size',                'ទំហំប៉ូស្ទ័រ',                        'single', true,  false, 1, 1000, 10),
 ('poster', 'text',      'Text to show on the design', 'អក្សរដែលត្រូវដាក់លើការរចនា',          'text',   true,  false, 1, 1000, 20),
 ('poster', 'style',     'Colours and style',          'ពណ៌ និងស្ទីល',                        'text',   false, false, 1, 1000, 30),
 ('poster', 'revisions', 'Extra revisions',            'ការកែបន្ថែម',                         'number', false, false, 0, 5,    40),
 ('poster', 'format',    'Delivery format',            'ទម្រង់ឯកសារ',                         'multi',  true,  false, 1, 1000, 50),
 ('logo',   'text',      'Business name and what you sell', 'ឈ្មោះអាជីវកម្ម និងអ្វីដែលអ្នកលក់', 'text',   true,  false, 1, 1000, 10),
 ('logo',   'style',     'Colours and style',          'ពណ៌ និងស្ទីល',                        'text',   false, false, 1, 1000, 20),
 ('logo',   'revisions', 'Extra revisions',            'ការកែបន្ថែម',                         'number', false, false, 0, 5,    30),
 ('logo',   'format',    'Delivery format',            'ទម្រង់ឯកសារ',                         'multi',  true,  false, 1, 1000, 40)
on conflict (service_key, slug) do nothing;

with o(service_key, group_slug, slug, label_en, label_km, price_type, price, sort_order) as (values
 ('print',  'size',      'a4',        'A4',                         'A4',                              'fixed',   0,    10),
 ('print',  'size',      'a3',        'A3 (double price)',          'A3 (តម្លៃទ្វេដង)',                'percent', 100,  20),
 ('print',  'paper',     'plain',     'Plain paper',                'ក្រដាសធម្មតា',                    'fixed',   0,    10),
 ('print',  'paper',     'photo',     'Photo paper',                'ក្រដាសរូបថត',                     'per_unit', 0.15, 20),
 ('copy',   'size',      'a4',        'A4',                         'A4',                              'fixed',   0,    10),
 ('copy',   'size',      'a3',        'A3 (double price)',          'A3 (តម្លៃទ្វេដង)',                'percent', 100,  20),
 ('social', 'platform',  'facebook',  'Facebook',                   'Facebook',                        'fixed',   0,    10),
 ('social', 'platform',  'instagram', 'Instagram',                  'Instagram',                       'fixed',   0,    20),
 ('social', 'platform',  'tiktok',    'TikTok',                     'TikTok',                          'fixed',   0,    30),
 ('social', 'platform',  'other',     'Other',                      'ផ្សេងៗ',                          'fixed',   0,    40),
 ('social', 'revisions', 'extra',     'Per extra revision',         'ក្នុងមួយការកែបន្ថែម',             'fixed',   2,    10),
 ('social', 'format',    'png',       'PNG / JPG',                  'PNG / JPG',                       'fixed',   0,    10),
 ('social', 'format',    'pdf',       'PDF',                        'PDF',                             'fixed',   0,    20),
 ('social', 'format',    'source',    'Editable source file',       'ឯកសារដើមសម្រាប់កែ',               'fixed',   5,    30),
 ('poster', 'size',      'a4',        'A4',                         'A4',                              'fixed',   0,    10),
 ('poster', 'size',      'a3',        'A3',                         'A3',                              'fixed',   3,    20),
 ('poster', 'size',      'a2',        'A2',                         'A2',                              'fixed',   6,    30),
 ('poster', 'size',      'custom',    'Other size (write it in the text box)', 'ទំហំផ្សេង (សរសេរក្នុងប្រអប់អក្សរ)', 'fixed', 0, 40),
 ('poster', 'revisions', 'extra',     'Per extra revision',         'ក្នុងមួយការកែបន្ថែម',             'fixed',   2,    10),
 ('poster', 'format',    'png',       'PNG / JPG',                  'PNG / JPG',                       'fixed',   0,    10),
 ('poster', 'format',    'pdf',       'PDF (print-ready)',          'PDF (ត្រៀមបោះពុម្ព)',             'fixed',   0,    20),
 ('poster', 'format',    'source',    'Editable source file',       'ឯកសារដើមសម្រាប់កែ',               'fixed',   5,    30),
 ('logo',   'revisions', 'extra',     'Per extra revision',         'ក្នុងមួយការកែបន្ថែម',             'fixed',   5,    10),
 ('logo',   'format',    'png',       'PNG / JPG',                  'PNG / JPG',                       'fixed',   0,    10),
 ('logo',   'format',    'pdf',       'PDF',                        'PDF',                             'fixed',   0,    20),
 ('logo',   'format',    'vector',    'Vector file (SVG / AI)',     'ឯកសារវ៉ិចទ័រ (SVG / AI)',         'fixed',   5,    30)
)
insert into public.service_options (group_id, slug, label_en, label_km, price_type, price, sort_order)
select g.id, o.slug, o.label_en, o.label_km, o.price_type, o.price, o.sort_order
from o join public.service_option_groups g on g.service_key = o.service_key and g.slug = o.group_slug
on conflict (group_id, slug) do nothing;
