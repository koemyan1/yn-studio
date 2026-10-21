-- YN Studio: ABA PayWay (automatic payment confirmation)
-- Run once in Supabase → SQL Editor. Safe to re-run.

alter table public.orders add column if not exists aba_tran_id   text;
alter table public.orders add column if not exists aba_tran_ids  text[] not null default '{}';
alter table public.orders add column if not exists aba_status    text;
alter table public.orders add column if not exists aba_apv       text;
alter table public.orders add column if not exists aba_paid_at   timestamptz;

create index if not exists orders_aba_tran_ids_idx on public.orders using gin (aba_tran_ids);

-- IMPORTANT: customers must NOT be able to mark their own orders paid.
-- The server uses the service-role key (bypasses RLS) to set payment_status/aba_* columns.
-- If you have an UPDATE policy that lets customers edit their own orders, restrict it so that
-- payment_status, status and aba_* cannot be changed by the customer.
