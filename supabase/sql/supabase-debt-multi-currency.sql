-- YN Studio: debt in US dollars AND Khmer riel. Run ONCE in Supabase -> SQL Editor, AFTER supabase-debt-interest-fix.sql. Safe to re-run.
-- One debt account per customer PER CURRENCY (USD, KHR), so a customer can owe both at the same time.
-- Existing accounts become USD. Riel amounts and riel percent interest are rounded to whole riel.
-- Wallet payments and Bakong KHQR (both dollars) only apply to the USD account; riel is recorded by the admin (Record payment).

alter table public.debt_accounts add column if not exists currency text not null default 'USD';
alter table public.debt_accounts drop constraint if exists debt_accounts_currency_check;
alter table public.debt_accounts add constraint debt_accounts_currency_check check (currency in ('USD','KHR'));

-- allow several accounts per customer (drop any old "one account per user" unique rule), then one per currency
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
           where c.conrelid = 'public.debt_accounts'::regclass and c.contype = 'u'
             and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'user_id')]
  loop execute format('alter table public.debt_accounts drop constraint %I', r.conname); end loop;
  for r in select i.indexrelid::regclass::text as idx from pg_index i
           where i.indrelid = 'public.debt_accounts'::regclass and i.indisunique and not i.indisprimary
             and i.indnatts = 1 and i.indpred is null
             and (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0]) = 'user_id'
             and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
  loop execute 'drop index ' || r.idx; end loop;
end $$;
create unique index if not exists debt_accounts_user_currency_uidx on public.debt_accounts (user_id, currency);

-- interest, currency-aware
create or replace function public._accrue_debt_account(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.debt_accounts;
  v_due timestamptz;
  v_bal numeric;
  v_int numeric;
  v_weeks integer := 0;
  v_guard integer := 0;
  v_dec integer;
begin
  select * into a from public.debt_accounts where id = p_account_id for update;
  if not found then return 0; end if;
  v_dec := case when a.currency = 'KHR' then 0 else 2 end;   -- riel has no cents

  -- nothing owed or switched off: no interest, and forget the schedule so old weeks are never charged later
  if not coalesce(a.enabled, false) or coalesce(a.current_balance, 0) <= 0 then
    if a.next_interest_at is not null and coalesce(a.current_balance, 0) <= 0 then
      update public.debt_accounts set next_interest_at = null where id = a.id;
    end if;
    return 0;
  end if;

  v_bal := a.current_balance;
  v_due := coalesce(a.next_interest_at,
                    coalesce(a.start_date, a.created_at::date)::timestamptz + interval '7 days');

  while v_due <= now() and v_bal > 0 and v_guard < 600 loop
    v_int := case when a.interest_type = 'percent'
                  then round(v_bal * coalesce(a.interest_value, 0) / 100, v_dec)
                  else coalesce(a.interest_value, 0) end;
    if v_int > 0 then
      v_bal := v_bal + v_int;
      insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note, created_at)
      values (a.id, a.user_id, 'interest', v_int, v_bal,
              'Weekly interest (' || to_char(v_due, 'DD Mon YYYY') || ')', v_due);
      v_weeks := v_weeks + 1;
    end if;
    v_due := v_due + interval '7 days';
    v_guard := v_guard + 1;
  end loop;

  if v_weeks > 0 or a.next_interest_at is distinct from v_due then
    update public.debt_accounts
       set current_balance = v_bal, next_interest_at = v_due, updated_at = now()
     where id = a.id;
  end if;
  return v_weeks;
end;
$$;
revoke all on function public._accrue_debt_account(uuid) from public, anon, authenticated;

-- admin create/update, currency-aware
drop function if exists public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date);
drop function if exists public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date,text);
create function public.admin_upsert_debt(
  p_user_id uuid,
  p_original_debt numeric,
  p_interest_type text,
  p_interest_value numeric,
  p_enabled boolean default true,
  p_account_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_currency text default 'USD'
)
returns public.debt_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.debt_accounts;
  v_cur text := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
  v_amount numeric := round(greatest(coalesce(p_original_debt, 0), 0), case when upper(coalesce(nullif(trim(p_currency), ''), 'USD')) = 'KHR' then 0 else 2 end);
  v_new_balance numeric;
  v_has_interest boolean;
  v_next timestamptz;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if p_user_id is null then raise exception 'Customer is required'; end if;
  if v_cur not in ('USD','KHR') then raise exception 'Currency must be USD or KHR'; end if;
  if p_interest_type not in ('fixed','percent') then raise exception 'Invalid interest type'; end if;
  if coalesce(p_interest_value, 0) < 0 then raise exception 'Interest value cannot be negative'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_account_id is not null then
    select * into a from public.debt_accounts where id = p_account_id for update;
  else
    select * into a from public.debt_accounts where user_id = p_user_id and currency = v_cur limit 1 for update;
  end if;

  if found then
    -- settle interest that is already due BEFORE the settings change, so old weeks use the old rate
    perform public._accrue_debt_account(a.id);
    select * into a from public.debt_accounts where id = a.id for update;

    v_new_balance := greatest(0, coalesce(a.current_balance, 0) + (v_amount - coalesce(a.original_debt, 0)));
    select exists (select 1 from public.debt_transactions where debt_account_id = a.id and type = 'interest') into v_has_interest;

    -- a start date picked/changed before any interest was charged moves the schedule with it
    v_next := case
      when v_new_balance <= 0 then null
      when p_start_date is not null and not v_has_interest then p_start_date::timestamptz + interval '7 days'
      else coalesce(a.next_interest_at, coalesce(p_start_date, a.start_date, a.created_at::date)::timestamptz + interval '7 days')
    end;

    update public.debt_accounts
       set original_debt = v_amount,
           current_balance = v_new_balance,
           interest_type = p_interest_type,
           interest_value = coalesce(p_interest_value, 0),
           enabled = coalesce(p_enabled, true),
           start_date = coalesce(p_start_date, a.start_date),
           end_date = p_end_date,
           next_interest_at = v_next,
           updated_at = now()
     where id = a.id
     returning * into a;

    if coalesce(a.current_balance, 0) > 0
       and not exists (select 1 from public.debt_transactions where debt_account_id = a.id and type in ('debt','debt_added')) then
      insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
      values (a.id, p_user_id, 'debt_added', v_amount, a.current_balance, 'Debt account created by admin');
    end if;

    perform public._accrue_debt_account(a.id);   -- e.g. start date set in the past → catch up right away
    select * into a from public.debt_accounts where id = a.id;
    return a;
  end if;

  insert into public.debt_accounts(
    user_id, currency, original_debt, current_balance, interest_type, interest_value, enabled,
    start_date, end_date, next_interest_at, created_at, updated_at
  ) values (
    p_user_id, v_cur, v_amount, v_amount, p_interest_type, coalesce(p_interest_value, 0), coalesce(p_enabled, true),
    p_start_date, p_end_date,
    case when v_amount > 0 then coalesce(p_start_date, current_date)::timestamptz + interval '7 days' else null end,
    now(), now()
  ) returning * into a;

  if v_amount > 0 then
    insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
    values (a.id, p_user_id, 'debt_added', v_amount, a.current_balance, 'Debt account created by admin');
  end if;

  perform public._accrue_debt_account(a.id);
  select * into a from public.debt_accounts where id = a.id;
  return a;
end;
$$;
grant execute on function public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date,text) to authenticated;

-- wallet payment: USD account only
-- Run after the existing debt schema. Lets a customer pay from their YN wallet.
create or replace function public.customer_pay_debt(p_amount numeric)
returns public.debt_accounts language plpgsql security definer set search_path=public as $$
declare a public.debt_accounts; w public.wallets; old_balance numeric; new_balance numeric; v_wallet_id uuid; paid numeric;
begin
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 perform public.accrue_customer_debt_interest(auth.uid());
 select * into a from public.debt_accounts where user_id=auth.uid() and enabled=true and currency='USD' for update;   -- the wallet is in dollars
 if not found then raise exception 'Debt account is not enabled'; end if;
 paid:=least(p_amount,a.current_balance);
 insert into public.wallets(user_id,balance) values(auth.uid(),0) on conflict(user_id) do nothing;
 select id,coalesce(balance,0) into v_wallet_id,old_balance from public.wallets where user_id=auth.uid() for update;
 if old_balance < paid then raise exception 'Insufficient wallet balance. Add money to your wallet first.'; end if;
 new_balance:=old_balance-paid;
 update public.wallets set balance=new_balance where id=v_wallet_id;
 insert into public.wallet_transactions(wallet_id,user_id,amount,balance_before,balance_after,type,description) values(v_wallet_id,auth.uid(),-paid,old_balance,new_balance,'debt_payment','Debt payment');
 a.current_balance:=a.current_balance-paid;
 insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note) values(a.id,auth.uid(),'payment',paid,a.current_balance,'Customer wallet payment');
 update public.debt_accounts set current_balance=a.current_balance,updated_at=now() where id=a.id returning * into a;
 return a;
end; $$;
grant execute on function public.customer_pay_debt(numeric) to authenticated;


-- Bakong KHQR debt payment: USD account only
create or replace function public.bakong_apply_payment(p_payment_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.bakong_payments;
  a public.debt_accounts;
  v_wallet uuid; old_b numeric; new_b numeric;
  applied numeric := 0; extra numeric := 0;
begin
  select * into p from public.bakong_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status = 'paid' then return false; end if;

  insert into public.wallets(user_id, balance) values (p.user_id, 0) on conflict (user_id) do nothing;

  if p.kind = 'wallet' then
    extra := p.amount;                       -- whole amount goes to the wallet
  else
    perform public.accrue_customer_debt_interest(p.user_id);
    select * into a from public.debt_accounts where user_id = p.user_id and enabled = true and currency = 'USD' for update;
    if found then applied := least(p.amount, a.current_balance); end if;
    extra := p.amount - applied;             -- anything beyond the debt goes to the wallet
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
      values (v_wallet, p.user_id, extra, old_b, new_b, 'deposit',
              case when p.kind = 'wallet' then 'Wallet top-up (Bakong KHQR)' else 'Debt overpayment (Bakong KHQR)' end);
  end if;

  update public.bakong_payments set status = 'paid', bakong_hash = p_hash, paid_at = now() where id = p.id;
  return true;
end; $$;
revoke all on function public.bakong_apply_payment(uuid, text) from public, anon, authenticated;
