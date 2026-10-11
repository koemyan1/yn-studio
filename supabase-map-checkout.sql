-- YN Studio: Grab-style map checkout + live driver tracking.
-- Safe to run more than once. Run in Supabase → SQL Editor, then also run
-- supabase-grab-map-delivery.sql and supabase/migrations/20261008_background_delivery_tracking.sql if you have not yet.

-- Which categories use the map checkout (switch in Admin → Categories or Secret Code → Delivery)
alter table public.categories add column if not exists delivery_tracking_enabled boolean not null default false;

-- Saved pin on the customer's profile
alter table public.profiles
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision;

-- Order columns used by checkout, the admin Orders page and the live map
alter table public.orders
  add column if not exists delivery_address text,
  add column if not exists delivery_phone text,
  add column if not exists delivery_name text,
  add column if not exists delivery_notes text,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists tracking_enabled boolean not null default false,
  add column if not exists tracking_active boolean not null default false,
  add column if not exists tracking_token text,
  add column if not exists tracking_started_at timestamptz,
  add column if not exists tracking_updated_at timestamptz,
  add column if not exists rider_lat double precision,
  add column if not exists rider_lng double precision;

alter table public.delivery_settings add column if not exists store_map_url text;

-- Push driver position to the customer instantly (the app also polls every 6 s as a backup)
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; when undefined_object then null;
end $$;
