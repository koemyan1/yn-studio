-- YN Studio connection/duplicate-cart fix
-- Run this AFTER the original schema. Review the duplicate cart rows before running in production.

-- 1) Checkout payments use the same deposit_requests table as Wallet.
alter table public.deposit_requests
  add column if not exists order_id uuid references public.orders(id) on delete set null;

-- 2) Merge duplicate carts for the same customer, keeping the oldest cart.
--    Cart items are moved first, then duplicate empty carts are removed.
with ranked as (
  select id,
         user_id,
         first_value(id) over (partition by user_id order by created_at asc, id asc) as keep_id,
         row_number() over (partition by user_id order by created_at asc, id asc) as rn
  from public.carts
), duplicates as (
  select id, keep_id from ranked where rn > 1
)
update public.cart_items ci
set cart_id = d.keep_id
from duplicates d
where ci.cart_id = d.id;

with ranked as (
  select id,
         row_number() over (partition by user_id order by created_at asc, id asc) as rn
  from public.carts
)
delete from public.carts c
using ranked r
where c.id = r.id and r.rn > 1;

create unique index if not exists carts_one_per_user_idx
on public.carts(user_id);

-- 3) Prevent two checkout payment requests for the same order.
create unique index if not exists deposit_requests_one_per_order_idx
on public.deposit_requests(order_id)
where order_id is not null;

-- 4) Helpful indexes for customer/admin lookups.
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists deposit_requests_user_id_idx on public.deposit_requests(user_id);
create index if not exists wallet_transactions_user_id_idx on public.wallet_transactions(user_id);
create index if not exists cart_items_cart_id_idx on public.cart_items(cart_id);

-- NOTE:
-- Do NOT delete the three deposit_requests shown in your screenshot just because they look similar.
-- They have different IDs. Check their status/receipt first. The new checkout code prevents
-- duplicate checkout requests for the same order, while normal wallet deposits can still be separate.
