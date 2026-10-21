-- YN Studio: wallet top-ups in Khmer riel (KHR)
-- Run once in Supabase -> SQL Editor (after supabase-bakong.sql and supabase-debt-multi-currency.sql). Safe to re-run.
--
-- How it works: the wallet itself stays in US dollars (orders, debt and admin adjustments all use dollars).
-- A riel top-up is paid with a riel KHQR; when Bakong confirms it, the wallet is credited riel / rate dollars,
-- using the rate saved on the payment at the moment the QR was created (BAKONG_KHR_RATE on the server, default 4100).
-- The app then shows every wallet amount in riel using the same rate.

alter table public.bakong_payments add column if not exists currency text not null default 'USD';
alter table public.bakong_payments add column if not exists khr_rate numeric;
do $$ begin
  alter table public.bakong_payments drop constraint if exists bakong_payments_currency_check;
  alter table public.bakong_payments add constraint bakong_payments_currency_check check (currency in ('USD','KHR'));
end $$;

-- Keep fractions of a cent so 5,000 riel does not drift by a few riel. Widening a numeric column is safe;
-- if a view blocks it, the notice is shown and everything else still works (balances just round to cents).
do $$ begin
  begin alter table public.wallets             alter column balance        type numeric; exception when others then raise notice 'wallets.balance not widened: %', sqlerrm; end;
  begin alter table public.wallet_transactions alter column amount         type numeric; exception when others then raise notice 'wallet_transactions.amount not widened: %', sqlerrm; end;
  begin alter table public.wallet_transactions alter column balance_before type numeric; exception when others then raise notice 'wallet_transactions.balance_before not widened: %', sqlerrm; end;
  begin alter table public.wallet_transactions alter column balance_after  type numeric; exception when others then raise notice 'wallet_transactions.balance_after not widened: %', sqlerrm; end;
  begin alter table public.bakong_payments     alter column amount         type numeric; exception when others then raise notice 'bakong_payments.amount not widened: %', sqlerrm; end;
end $$;

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
      extra := round(p.amount / p.khr_rate, 6);           -- riel -> dollars at the rate saved with the QR
      note  := 'Wallet top-up ' || trim(to_char(p.amount, 'FM999,999,999,990')) || ' ៛ (Bakong KHQR)';
    else
      extra := p.amount;                                  -- whole amount goes to the wallet
      note  := 'Wallet top-up (Bakong KHQR)';
    end if;
  else
    perform public.accrue_customer_debt_interest(p.user_id);
    select * into a from public.debt_accounts where user_id = p.user_id and enabled = true and currency = 'USD' for update;
    if found then applied := least(p.amount, a.current_balance); end if;
    extra := p.amount - applied;             -- anything beyond the debt goes to the wallet
    note  := 'Debt overpayment (Bakong KHQR)';
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
