-- YN Studio: pay a book cover order from the RIEL wallet. Run ONCE in Supabase -> SQL Editor. Safe to re-run.
--
-- Run AFTER: supabase-book-covers.sql and supabase-wallet-separate-riel.sql (it needs wallets.balance_khr and wallet_transactions.currency).
--
-- Book covers cost riel, so they are paid from the riel balance (wallets.balance_khr), never from the dollar balance.
-- The function locks the order and the wallet, checks the balance, takes exactly book_cover_orders.total riel (the price the SERVER
-- froze on the order - the browser never sends an amount), writes the wallet history line, marks the order paid and tells the admin.

create or replace function public.pay_book_cover_with_wallet(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.book_cover_orders;
  v_wallet uuid; old_b numeric; new_b numeric;
  v_desc text;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;

  select * into o from public.book_cover_orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'Book cover order not found.'; end if;
  if o.status in ('paid', 'submitted', 'printed', 'delivered') then return jsonb_build_object('paid', true, 'already', true); end if;
  if o.status <> 'pending' then raise exception 'This order is cancelled.'; end if;
  if btrim(coalesce(o.phone, '')) = '' or btrim(coalesce(o.address, '')) = '' then raise exception 'Please add your phone number and location first.'; end if;
  if coalesce(o.total, 0) <= 0 then raise exception 'This order has nothing to pay.'; end if;

  insert into public.wallets(user_id, balance) values (auth.uid(), 0) on conflict (user_id) do nothing;
  select id, coalesce(balance_khr, 0) into v_wallet, old_b from public.wallets where user_id = auth.uid() order by coalesce(balance_khr, 0) desc limit 1 for update;
  if v_wallet is null then raise exception 'Your wallet could not be found.'; end if;
  if old_b < o.total then raise exception 'Your riel wallet balance is not enough. Add riel to your wallet first.'; end if;

  new_b := old_b - o.total;
  v_desc := 'Book cover (riel wallet payment)';
  update public.wallets set balance_khr = new_b where id = v_wallet;

  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (v_wallet, auth.uid(), -o.total, old_b, new_b, 'order_payment', v_desc, 'KHR');
  exception when check_violation or invalid_text_representation then
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (v_wallet, auth.uid(), -o.total, old_b, new_b, 'debt_payment', v_desc, 'KHR');
  end;

  update public.book_cover_orders set status = 'paid', payment_method = 'Wallet', paid_at = now(), updated_at = now() where id = o.id and status = 'pending';

  begin
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (null, 'admin', 'Book cover paid', 'BC-' || upper(left(replace(o.id::text, '-', ''), 8)) || ' · ' || o.pages::text || ' page(s) · ' || o.total::text || ' KHR was paid from the riel wallet.', 'service', '/admin/book-covers');
  exception when others then null;
  end;

  return jsonb_build_object('paid', true, 'balance_khr', new_b);
end; $$;
revoke all on function public.pay_book_cover_with_wallet(uuid) from public, anon;
grant execute on function public.pay_book_cover_with_wallet(uuid) to authenticated;
