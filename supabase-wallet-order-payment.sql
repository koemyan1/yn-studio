-- YN Studio: let a customer pay an order from their wallet balance.
-- Safe to run more than once. Run in Supabase -> SQL Editor.
--
-- One atomic step: lock the order + wallet, check the balance, take the money,
-- write the wallet transaction and mark the order paid. The amount is always the
-- order total stored in the database (never a number sent by the browser), and an
-- order can only ever be paid once.
--
-- NOTE: the wallet transaction is saved with type 'order_payment'. If your
-- wallet_transactions.type column has a CHECK constraint that rejects it, add
-- 'order_payment' to that constraint (same note as 'deposit' in BAKONG-SETUP.md).
create or replace function public.pay_order_with_wallet(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_wallet uuid; old_b numeric; new_b numeric;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;

  select * into o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.payment_status = 'paid' then return jsonb_build_object('paid', true, 'already', true); end if;
  if coalesce(o.status, '') in ('cancelled', 'rejected') then raise exception 'This order was cancelled.'; end if;
  if coalesce(o.total, 0) <= 0 then raise exception 'This order has nothing to pay.'; end if;

  insert into public.wallets(user_id, balance) values (auth.uid(), 0) on conflict (user_id) do nothing;
  select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = auth.uid() limit 1 for update;
  if old_b < o.total then
    raise exception 'Your wallet balance is not enough for this order. Add money to your wallet first.';
  end if;

  new_b := old_b - o.total;
  update public.wallets set balance = new_b where id = v_wallet;
  insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
    values (v_wallet, auth.uid(), -o.total, old_b, new_b, 'order_payment',
            'Order #' || coalesce(o.order_number, o.id::text) || ' (wallet payment)');

  update public.orders set payment_status = 'paid', status = 'paid', payment_method = 'Wallet' where id = o.id;

  insert into public.notifications(user_id, target_role, title, message, type, link)
    values (null, 'admin', 'Order paid with wallet',
            'Order #' || coalesce(o.order_number, o.id::text) || ' was paid from the customer wallet.', 'order', '/admin/orders');

  return jsonb_build_object('paid', true, 'balance', new_b);
end; $$;
revoke all on function public.pay_order_with_wallet(uuid) from public, anon;
grant execute on function public.pay_order_with_wallet(uuid) to authenticated;
