-- YN Studio: SEPARATE riel wallet. Run ONCE in Supabase -> SQL Editor, AFTER supabase-debt-riel-pay.sql. Safe to re-run.
-- (This replaces supabase-debt-riel-pay.sql's two functions, so run both files, in that order.)
--
-- Two completely separate balances per customer:
--   wallets.balance      = US dollars   (dollar top-ups, dollar debt, orders, CV)
--   wallets.balance_khr  = Khmer riel   (riel top-ups, riel debt)
-- No conversion between them. Each wallet_transactions row says which one it belongs to (currency).
-- Money already in the wallet (including riel top-ups made before this update, which were saved as dollars) stays in dollars.

alter table public.wallets add column if not exists balance_khr numeric not null default 0;
alter table public.wallet_transactions add column if not exists currency text not null default 'USD';

-- Riel wallet -> riel debt (server only).
drop function if exists public.customer_pay_debt_khr(uuid, numeric, numeric);
drop function if exists public.customer_pay_debt_khr(uuid, numeric);
create function public.customer_pay_debt_khr(p_user_id uuid, p_amount numeric)
returns public.debt_accounts
language plpgsql security definer set search_path = public as $$
declare
  a public.debt_accounts; v_wallet uuid; old_b numeric; new_b numeric; paid numeric;
begin
  if p_user_id is null then raise exception 'Sign in again'; end if;
  p_amount := round(coalesce(p_amount, 0));
  if p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  perform public.accrue_customer_debt_interest(p_user_id);
  select * into a from public.debt_accounts where user_id = p_user_id and enabled = true and currency = 'KHR' for update;
  if not found then raise exception 'Riel debt account is not enabled'; end if;
  if coalesce(a.current_balance, 0) <= 0 then raise exception 'You have no outstanding riel debt'; end if;

  paid := least(p_amount, a.current_balance);

  insert into public.wallets(user_id, balance) values (p_user_id, 0) on conflict (user_id) do nothing;
  select id, coalesce(balance_khr, 0) into v_wallet, old_b from public.wallets where user_id = p_user_id order by coalesce(balance_khr, 0) desc limit 1 for update;
  if old_b < paid then raise exception 'Insufficient riel wallet balance. Add riel to your wallet first.'; end if;
  new_b := old_b - paid;
  update public.wallets set balance_khr = new_b where id = v_wallet;

  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
    values (v_wallet, p_user_id, -paid, old_b, new_b, 'debt_payment', 'Riel debt payment', 'KHR');
  exception when others then
    raise notice 'wallet history row not saved: %', sqlerrm;
  end;

  a.current_balance := a.current_balance - paid;
  insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
  values (a.id, p_user_id, 'payment', paid, a.current_balance, 'Customer wallet payment');
  update public.debt_accounts set current_balance = a.current_balance, updated_at = now() where id = a.id returning * into a;
  return a;
end; $$;
revoke all on function public.customer_pay_debt_khr(uuid, numeric) from public, anon, authenticated;
grant execute on function public.customer_pay_debt_khr(uuid, numeric) to service_role;

-- Bakong KHQR: riel goes to the riel wallet / riel debt, dollars to the dollar wallet / dollar debt.
create or replace function public.bakong_apply_payment(p_payment_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.bakong_payments;
  a public.debt_accounts;
  v_wallet uuid; old_b numeric; new_b numeric;
  applied numeric := 0; extra numeric := 0; note text;
  khr boolean;
begin
  select * into p from public.bakong_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status = 'paid' then return false; end if;
  khr := (p.currency = 'KHR');

  insert into public.wallets(user_id, balance) values (p.user_id, 0) on conflict (user_id) do nothing;

  if p.kind = 'wallet' then
    extra := p.amount;
    note  := case when khr then 'Riel wallet top-up (Bakong KHQR)' else 'Wallet top-up (Bakong KHQR)' end;
  else
    perform public.accrue_customer_debt_interest(p.user_id);
    select * into a from public.debt_accounts where user_id = p.user_id and enabled = true and currency = p.currency for update;
    if found then applied := least(p.amount, a.current_balance); end if;
    extra := p.amount - applied;             -- anything beyond the debt goes to the wallet of the SAME currency
    note  := case when khr then 'Riel debt overpayment (Bakong KHQR)' else 'Debt overpayment (Bakong KHQR)' end;
    if applied > 0 then
      a.current_balance := a.current_balance - applied;
      insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
        values (a.id, p.user_id, 'payment', applied, a.current_balance, 'Bakong KHQR payment');
      update public.debt_accounts set current_balance = a.current_balance, updated_at = now() where id = a.id;
    end if;
  end if;

  if extra > 0 then
    if khr then
      select id, coalesce(balance_khr, 0) into v_wallet, old_b from public.wallets where user_id = p.user_id order by coalesce(balance_khr, 0) desc limit 1 for update;
      new_b := old_b + extra;
      update public.wallets set balance_khr = new_b where id = v_wallet;
    else
      select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = p.user_id order by coalesce(balance, 0) desc limit 1 for update;
      new_b := old_b + extra;
      update public.wallets set balance = new_b where id = v_wallet;
    end if;
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (v_wallet, p.user_id, extra, old_b, new_b, 'deposit', note, case when khr then 'KHR' else 'USD' end);
  end if;

  update public.bakong_payments set status = 'paid', bakong_hash = p_hash, paid_at = now() where id = p.id;
  return true;
end; $$;
revoke all on function public.bakong_apply_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.bakong_apply_payment(uuid, text) to service_role;
