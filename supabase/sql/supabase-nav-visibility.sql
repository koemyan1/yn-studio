-- YN Studio: admin can switch pages on/off in the bottom navigation (all themes, including the default one).
-- Run once in Supabase -> SQL Editor. Safe to run again. (Needs supabase-grab-map-delivery.sql to have been run before.)
alter table public.delivery_settings add column if not exists nav_hidden jsonb not null default '[]'::jsonb;
insert into public.delivery_settings (id) values (1) on conflict (id) do nothing;
