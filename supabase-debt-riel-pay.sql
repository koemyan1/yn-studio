-- YN Studio: pay a RIEL debt with the wallet and with Bakong KHQR (in riel).
-- Run ONCE in Supabase -> SQL Editor, AFTER supabase-wallet-riel.sql and supabase-debt-khqr-fix.sql. Safe to re-run.
--
-- * The wallet is stored in US dollars. Paying X riel from the wallet takes X / rate dollars out of it
--   (rate = BAKONG_KHR_RATE on the server, the same rate the app uses to show wallet balances in riel).
-- * A riel KHQR debt payment is a riel QR (currency KHR). When Bakong confirms it, the riel debt account is reduced
--   by exactly that many riel. Anything above what is owed (e.g. paid just as the balance changed) goes to the wallet
--   as dollars at the rate saved with the QR.
-- * Dollar debt payments (wallet and KHQR) work exactly as before.

-- 1) Wallet -> riel debt. Only the server (service role) can call this, because the server decides the rate.
drop function if exists public.customer_pay_debt_khr(uuid, numeric, numeric);
create function public.customer_pay_debt_khr(p_user_id uuid, p_amount numeric, p_rate numeric)
returns public.debt_accounts
language plpgsql security definer set search_path = public as $$
declare
  a public.debt_accounts; v_wallet uuid; old_b numeric; new_b numeric; paid numeric; usd numeric;
begin
  if p_user_id is null then raise exception 'Sign in again'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Missing riel rate'; end if;
  p_amount := round(coalesce(p_amount, 0));
  if p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  perform public.accrue_customer_debt_interest(p_user_id);
  select * into a from public.debt_accounts where user_id = p_user_id and enabled = true and currency = 'KHR' for update;
  if not found then raise exception 'Riel debt account is not enabled'; end if;
  if coalesce(a.current_balance, 0) <= 0 then raise exception 'You have no outstanding riel debt'; end if;

  paid := least(p_amount, a.current_balance);
  usd  := round(paid / p_rate, 6);

  insert into public.wallets(user_id, balance) values (p_user_id, 0) on conflict (user_id) do nothing;
  select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = p_user_id order by coalesce(balance, 0) desc limit 1 for update;
  if old_b + 0.000001 < usd then raise exception 'Insufficient wallet balance. Add money to your wallet first.'; end if;
  new_b := greatest(0, old_b - usd);
  update public.wallets set balance = new_b where id = v_wallet;

  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
    values (v_wallet, p_user_id, -usd, old_b, new_b, 'debt_payment',
            'Riel debt payment ' || trim(to_char(paid, 'FM999,999,999,990')) || ' ៛');
  exception when others then
    raise notice 'wallet history row not saved: %', sqlerrm;   -- never lose a payment over a history row
  end;

  a.current_balance := a.current_balance - paid;
  insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
  values (a.id, p_user_id, 'payment', paid, a.current_balance, 'Customer wallet payment');
  update public.debt_accounts set current_balance = a.current_balance, updated_at = now() where id = a.id returning * into a;
  return a;
end; $$;
revoke all on function public.customer_pay_debt_khr(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.customer_pay_debt_khr(uuid, numeric, numeric) to service_role;

-- 2) Bakong KHQR (wallet top-up in USD or KHR, debt payment in USD or KHR)
create or replace function public.bakong_apply_payment(p_payment_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.bakong_payments;
  a public.debt_accounts;
  v_wallet uuid; old_b numeric; new_b numeric;
  applied numeric := 0; extra numeric := 0; note text;
begin
  select * into p from public.bakong_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status = 'paid' then return false; end if;

  insert into public.wallets(user_id, balance) values (p.user_id, 0) on conflict (user_id) do nothing;

  if p.kind = 'wallet' then
    if p.currency = 'KHR' then
      if coalesce(p.khr_rate, 0) <= 0 then raise exception 'Missing riel rate on payment'; end if;
      extra := round(p.amount / p.khr_rate, 6);
      note  := 'Wallet top-up ' || trim(to_char(p.amount, 'FM999,999,999,990')) || ' ៛ (Bakong KHQR)';
    else
      extra := p.amount;
      note  := 'Wallet top-up (Bakong KHQR)';
    end if;
  else
    perform public.accrue_customer_debt_interest(p.user_id);
    -- the debt account in the same currency as the QR (USD QR -> dollar debt, KHR QR -> riel debt)
    select * into a from public.debt_accounts where user_id = p.user_id and enabled = true and currency = p.currency for update;
    if found then applied := least(p.amount, a.current_balance); end if;
    if p.currency = 'KHR' then
      if coalesce(p.khr_rate, 0) <= 0 then raise exception 'Missing riel rate on payment'; end if;
      extra := round((p.amount - applied) / p.khr_rate, 6);   -- leftover riel -> wallet dollars
      note  := 'Riel debt overpayment ' || trim(to_char(p.amount - applied, 'FM999,999,999,990')) || ' ៛ (Bakong KHQR)';
    else
      extra := p.amount - applied;
      note  := 'Debt overpayment (Bakong KHQR)';
    end if;
    if applied > 0 then
      a.current_balance := a.current_balance - applied;
      insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
        values (a.id, p.user_id, 'payment', applied, a.current_balance, 'Bakong KHQR payment');
      update public.debt_accounts set current_balance = a.current_balance, updated_at = now() where id = a.id;
    end if;
  end if;

  if extra > 0 then
    select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = p.user_id limit 1 for update;
    new_b := old_b + extra;
    update public.wallets set balance = new_b where id = v_wallet;
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, p.user_id, extra, old_b, new_b, 'deposit', note);
  end if;

  update public.bakong_payments set status = 'paid', bakong_hash = p_hash, paid_at = now() where id = p.id;
  return true;
end; $$;
revoke all on function public.bakong_apply_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.bakong_apply_payment(uuid, text) to service_role;
