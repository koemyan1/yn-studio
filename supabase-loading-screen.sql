-- YN Studio: admin-set loading screen picture. Run once in Supabase -> SQL Editor (safe to run again).
-- Needs supabase-grab-map-delivery.sql to have been run before (it creates delivery_settings and the delivery-assets bucket).
alter table public.delivery_settings add column if not exists loader_image text;
alter table public.delivery_settings add column if not exists loader_bg text;
alter table public.delivery_settings add column if not exists loader_text text;
alter table public.delivery_settings add column if not exists loader_size integer default 120;
insert into public.delivery_settings (id) values (1) on conflict (id) do nothing;
