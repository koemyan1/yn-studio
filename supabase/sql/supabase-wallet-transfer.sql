-- YN Studio: wallet-to-wallet transfers by QR code.
-- Run ONCE in Supabase -> SQL Editor, AFTER supabase-wallet-separate-riel.sql. Safe to re-run.
--
-- How it works
--   * Every customer gets a private random "pay code" (wallet_pay_codes). Their QR is just  YNPAY:<code>.
--     The QR never contains the user id, email or a balance.
--   * my_wallet_pay_code()        -> returns (and creates on first use) the signed-in customer's code.
--   * lookup_wallet_recipient()   -> after a scan, returns ONLY the recipient's display name so the sender can confirm who they pay.
--   * transfer_wallet_funds()     -> moves money in ONE database transaction. Dollars stay dollars, riel stays riel (no conversion).
--   * wallet_transfers            -> audit log of every transfer (used for the hourly limit, readable by the two people and by admins).
-- Browsers cannot read or write wallet_pay_codes / wallet_transfers directly; everything goes through the functions below.
--
-- Limits you can change (search for "LIMITS" in transfer_wallet_funds):
--   minimum  $0.01   / 100 riel
--   maximum  $1,000  / 4,000,000 riel per transfer
--   at most 20 transfers per hour per customer

-- ---------- tables ----------
create table if not exists public.wallet_pay_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.wallet_pay_codes enable row level security;
revoke all on public.wallet_pay_codes from anon, authenticated;

create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('USD', 'KHR')),
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transfers_from_idx on public.wallet_transfers(from_user, created_at desc);
create index if not exists wallet_transfers_to_idx   on public.wallet_transfers(to_user, created_at desc);
alter table public.wallet_transfers enable row level security;
revoke all on public.wallet_transfers from anon, authenticated;
grant select on public.wallet_transfers to authenticated;
drop policy if exists "wallet transfers read own or admin" on public.wallet_transfers;
create policy "wallet transfers read own or admin" on public.wallet_transfers for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid()
         or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- ---------- my QR code ----------
create or replace function public.my_wallet_pay_code()
returns text language plpgsql security definer set search_path = public as $$
declare v text; i int;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  select code into v from public.wallet_pay_codes where user_id = auth.uid();
  if v is not null then return v; end if;
  for i in 1..5 loop
    v := upper(substr(md5(gen_random_uuid()::text), 1, 16));
    begin
      insert into public.wallet_pay_codes(user_id, code) values (auth.uid(), v);
      return v;
    exception when unique_violation then
      -- either a double-tap created it first, or the random code collided: return the existing one, else retry
      select code into v from public.wallet_pay_codes where user_id = auth.uid();
      if v is not null then return v; end if;
    end;
  end loop;
  raise exception 'Could not create your QR code. Please try again.';
end; $$;
revoke all on function public.my_wallet_pay_code() from public, anon;
grant execute on function public.my_wallet_pay_code() to authenticated;

-- ---------- who am I about to pay? ----------
create or replace function public.lookup_wallet_recipient(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  select user_id into v_to from public.wallet_pay_codes where code = upper(trim(coalesce(p_code, '')));
  if v_to is null then raise exception 'That QR code is not valid.'; end if;
  if v_to = auth.uid() then raise exception 'That is your own QR code. Scan someone else''s.'; end if;
  select nullif(trim(name), '') into v_name from public.profiles where user_id = v_to limit 1;
  return jsonb_build_object('name', coalesce(v_name, 'YN Studio customer'));
end; $$;
revoke all on function public.lookup_wallet_recipient(text) from public, anon;
grant execute on function public.lookup_wallet_recipient(text) to authenticated;

-- ---------- the transfer ----------
create or replace function public.transfer_wallet_funds(p_code text, p_currency text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_to uuid;
  v_cur text := upper(coalesce(p_currency, 'USD'));
  amt numeric; min_amt numeric; max_amt numeric;
  f_id uuid; f_old numeric; f_new numeric;
  t_id uuid; t_old numeric; t_new numeric;
  from_name text; to_name text; v_note text; d_out text; d_in text;
  v_id uuid; recent int;
begin
  if me is null then raise exception 'Please log in first.'; end if;
  if v_cur not in ('USD', 'KHR') then raise exception 'Choose dollars or riel.'; end if;

  -- LIMITS
  if v_cur = 'KHR' then amt := round(coalesce(p_amount, 0)); min_amt := 100;  max_amt := 4000000;
  else                  amt := round(coalesce(p_amount, 0), 2); min_amt := 0.01; max_amt := 1000; end if;
  if amt < min_amt then raise exception 'The minimum transfer is %.', case when v_cur = 'KHR' then '100 riel' else '$0.01' end; end if;
  if amt > max_amt then raise exception 'The maximum for one transfer is %.', case when v_cur = 'KHR' then '4,000,000 riel' else '$1,000' end; end if;

  select user_id into v_to from public.wallet_pay_codes where code = upper(trim(coalesce(p_code, '')));
  if v_to is null then raise exception 'That QR code is not valid.'; end if;
  if v_to = me then raise exception 'You cannot send money to yourself.'; end if;

  select count(*) into recent from public.wallet_transfers where from_user = me and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many transfers in the last hour. Please try again later.'; end if;

  -- make sure both wallets exist, then lock both in a fixed order (two people paying each other at once cannot deadlock)
  insert into public.wallets(user_id, balance) values (me, 0) on conflict (user_id) do nothing;
  insert into public.wallets(user_id, balance) values (v_to, 0) on conflict (user_id) do nothing;
  perform 1 from public.wallets where user_id in (me, v_to) order by user_id for update;

  if v_cur = 'KHR' then
    select id, coalesce(balance_khr, 0) into f_id, f_old from public.wallets where user_id = me   order by coalesce(balance_khr, 0) desc limit 1;
    select id, coalesce(balance_khr, 0) into t_id, t_old from public.wallets where user_id = v_to order by coalesce(balance_khr, 0) desc limit 1;
  else
    select id, coalesce(balance, 0)     into f_id, f_old from public.wallets where user_id = me   order by coalesce(balance, 0) desc limit 1;
    select id, coalesce(balance, 0)     into t_id, t_old from public.wallets where user_id = v_to order by coalesce(balance, 0) desc limit 1;
  end if;
  if f_id is null or t_id is null then raise exception 'A wallet could not be found.'; end if;
  if f_old < amt then
    raise exception 'Not enough money in your % wallet.', case when v_cur = 'KHR' then 'riel' else 'dollar' end;
  end if;

  f_new := f_old - amt;
  t_new := t_old + amt;
  if v_cur = 'KHR' then
    update public.wallets set balance_khr = f_new where id = f_id;
    update public.wallets set balance_khr = t_new where id = t_id;
  else
    update public.wallets set balance = f_new where id = f_id;
    update public.wallets set balance = t_new where id = t_id;
  end if;

  select nullif(trim(name), '') into from_name from public.profiles where user_id = me   limit 1;
  select nullif(trim(name), '') into to_name   from public.profiles where user_id = v_to limit 1;
  v_note := nullif(left(trim(coalesce(p_note, '')), 60), '');
  d_out := 'Sent to ' || coalesce(to_name, 'a customer')       || coalesce(' · ' || v_note, '');
  d_in  := 'Received from ' || coalesce(from_name, 'a customer') || coalesce(' · ' || v_note, '');

  insert into public.wallet_transfers(from_user, to_user, currency, amount, note)
    values (me, v_to, v_cur, amt, v_note) returning id into v_id;

  -- history rows (if your wallet_transactions.type has a CHECK list that rejects the new names, fall back to ones it accepts)
  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (f_id, me, -amt, f_old, f_new, 'transfer_out', d_out, v_cur);
  exception when check_violation or invalid_text_representation then
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (f_id, me, -amt, f_old, f_new, 'debt_payment', d_out, v_cur);
  end;
  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (t_id, v_to, amt, t_old, t_new, 'transfer_in', d_in, v_cur);
  exception when check_violation or invalid_text_representation then
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description, currency)
      values (t_id, v_to, amt, t_old, t_new, 'deposit', d_in, v_cur);
  end;
  -- (the existing yn_notify_wallet_transaction trigger notifies both people automatically)

  return jsonb_build_object('ok', true, 'id', v_id, 'currency', v_cur, 'amount', amt, 'balance', f_new, 'to_name', coalesce(to_name, 'YN Studio customer'));
end; $$;
revoke all on function public.transfer_wallet_funds(text, text, numeric, text) from public, anon;
grant execute on function public.transfer_wallet_funds(text, text, numeric, text) to authenticated;
