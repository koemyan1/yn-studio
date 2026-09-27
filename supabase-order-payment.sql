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

-- Order payment approval is intentionally separate from wallet deposits.
-- Approving an order payment only changes the order; it never changes wallet balance.
create or replace function public.admin_approve_order_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  update public.orders set payment_status='paid', status='paid' where id=p_order_id;
  if not found then raise exception 'Order not found'; end if;
end; $$;
grant execute on function public.admin_approve_order_payment(uuid) to authenticated;

-- Admin-only wallet adjustment. This is the ONLY admin operation that changes a wallet balance.
create or replace function public.admin_adjust_wallet(p_user_id uuid,p_amount numeric,p_description text default null)
returns numeric language plpgsql security definer set search_path=public as $$
declare new_balance numeric;
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_amount=0 then raise exception 'Amount cannot be zero'; end if;
  insert into public.wallets(user_id,balance) values(p_user_id,0) on conflict(user_id) do nothing;
  update public.wallets set balance=coalesce(balance,0)+p_amount where user_id=p_user_id returning balance into new_balance;
  insert into public.wallet_transactions(user_id,amount,type,description)
  values(p_user_id,p_amount,case when p_amount>0 then 'admin_credit' else 'admin_debit' end,coalesce(p_description,case when p_amount>0 then 'Admin added money' else 'Admin deducted money' end));
  return new_balance;
end; $$;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text) to authenticated;
