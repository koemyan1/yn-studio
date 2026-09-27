-- YN Studio: order payment fields
-- Run in Supabase SQL Editor before deploying the checkout update.

alter table public.orders
  add column if not exists payment_method text default 'ABA / KHQR';

alter table public.orders
  add column if not exists payment_receipt_url text;

-- Optional but recommended: keep existing orders safe.
update public.orders
set payment_method = coalesce(payment_method, 'ABA / KHQR')
where payment_method is null;

-- Create a wallet automatically for newly registered customers.
-- This assumes your existing wallets table has user_id and balance columns.
create or replace function public.handle_new_customer_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;

create trigger on_auth_user_created_wallet
after insert on auth.users
for each row
execute function public.handle_new_customer_wallet();

-- Create wallets for existing customers that do not have one yet.
insert into public.wallets (user_id, balance)
select id, 0
from auth.users
where not exists (
  select 1
  from public.wallets w
  where w.user_id = auth.users.id
);
