-- YN Studio: choose, per category, whether customers pay a delivery fee and how much.
-- Safe to run more than once. Run in Supabase -> SQL Editor.
--
-- delivery_fee_enabled : true  = delivery fee is charged (default, same as before)
--                        false = delivery is free for this category
-- delivery_fee         : optional fixed amount in $ for this category.
--                        Empty (null) = use the price from Admin -> Settings (distance based).
alter table public.categories add column if not exists delivery_fee_enabled boolean not null default true;
alter table public.categories add column if not exists delivery_fee numeric;
alter table public.categories drop constraint if exists categories_delivery_fee_nonneg;
alter table public.categories add constraint categories_delivery_fee_nonneg check (delivery_fee is null or delivery_fee >= 0);
