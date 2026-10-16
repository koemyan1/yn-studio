-- YN Studio: Bakong KHQR (automatic payment confirmation)
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table public.orders add column if not exists bakong_md5      text;
alter table public.orders add column if not exists bakong_md5s     text[] not null default '{}';
alter table public.orders add column if not exists bakong_status   text;
alter table public.orders add column if not exists bakong_hash     text;
alter table public.orders add column if not exists bakong_paid_at  timestamptz;

create index if not exists orders_bakong_md5s_idx on public.orders using gin (bakong_md5s);
-- One Bakong transaction can only ever pay one order.
create unique index if not exists orders_bakong_hash_uidx on public.orders (bakong_hash) where bakong_hash is not null;

-- IMPORTANT: customers must NOT be able to mark their own orders paid.
-- The server uses the service-role key (bypasses RLS) to set payment_status / bakong_* columns.
-- If you have an UPDATE policy that lets customers edit their own orders, restrict it so that
-- payment_status, status and bakong_* cannot be changed by the customer.
