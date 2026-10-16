-- YN Studio — DEBT INTEREST FIX (weekly interest was never added)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
--
-- What was wrong
--  1. The function the app calls (accrue_customer_debt_interest) was not part of any SQL file in the project,
--     so there was nothing in the project that actually added interest.
--  2. A debt account created in Admin → Debt Management was saved WITHOUT "next_interest_at" (the date of the
--     next weekly interest), so even a working accrual function had nothing to wait for.
--  3. Interest only ran when the CUSTOMER opened their Debt page, and never caught up on missed weeks.
--
-- What this does
--  • One accrual routine that adds EVERY missed week (e.g. start 5 Oct, fixed $5/week → +$5 on 12 Oct, +$5 on 19 Oct …).
--    Weeks are counted from the account's Start date (or the day it was created), every 7 days.
--  • Interest is added for any week where money is still owed. Nothing is added while the balance is 0 or the account is disabled.
--  • Percent interest is charged on the balance at that moment (previous interest included). Fixed interest is a flat amount.
--  • It runs when the customer opens Debt, when an admin opens Debt Management, before any payment / new debt is recorded,
--    and every hour automatically if pg_cron is available on your project.
--  • Existing accounts are repaired: accounts with no schedule get one and are caught up right now.

alter table public.debt_accounts
  add column if not exists next_interest_at timestamptz,
  add column if not exists start_date date,
  add column if not exists end_date date;

-- ---------------------------------------------------------------------------
-- Core: bring ONE account up to date. Returns how many weeks of interest were added.
-- ---------------------------------------------------------------------------
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
begin
  select * into a from public.debt_accounts where id = p_account_id for update;
  if not found then return 0; end if;

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
                  then round(v_bal * coalesce(a.interest_value, 0) / 100, 2)
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

-- ---------------------------------------------------------------------------
-- The function the app already calls (customer Debt page, wallet payment). Same name + argument name.
-- ---------------------------------------------------------------------------
drop function if exists public.accrue_customer_debt_interest(uuid);
create function public.accrue_customer_debt_interest(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  r record;
  v_total integer := 0;
begin
  if auth.uid() is not null          -- null = the server confirming a KHQR payment (service role) or the SQL editor
     and v_uid is distinct from auth.uid()
     and not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Not allowed';
  end if;
  for r in select id from public.debt_accounts where user_id = v_uid loop
    v_total := v_total + public._accrue_debt_account(r.id);
  end loop;
  return v_total;
end;
$$;
grant execute on function public.accrue_customer_debt_interest(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Every account at once (admin screen, hourly job, or the SQL editor).
-- ---------------------------------------------------------------------------
drop function if exists public.accrue_all_debt_interest();
create function public.accrue_all_debt_interest()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer := 0;
begin
  if auth.uid() is not null
     and not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  for r in select id from public.debt_accounts where enabled = true and coalesce(current_balance, 0) > 0 loop
    v_total := v_total + public._accrue_debt_account(r.id);
  end loop;
  return v_total;
end;
$$;
grant execute on function public.accrue_all_debt_interest() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin creates / edits an account: always give it an interest schedule.
-- (same arguments as before, so the app needs no change)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date);
create function public.admin_upsert_debt(
  p_user_id uuid,
  p_original_debt numeric,
  p_interest_type text,
  p_interest_value numeric,
  p_enabled boolean default true,
  p_account_id uuid default null,
  p_start_date date default null,
  p_end_date date default null
)
returns public.debt_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.debt_accounts;
  v_amount numeric := greatest(coalesce(p_original_debt, 0), 0);
  v_new_balance numeric;
  v_has_interest boolean;
  v_next timestamptz;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if p_user_id is null then raise exception 'Customer is required'; end if;
  if p_interest_type not in ('fixed','percent') then raise exception 'Invalid interest type'; end if;
  if coalesce(p_interest_value, 0) < 0 then raise exception 'Interest value cannot be negative'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_account_id is not null then
    select * into a from public.debt_accounts where id = p_account_id for update;
  else
    select * into a from public.debt_accounts where user_id = p_user_id limit 1 for update;
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
    user_id, original_debt, current_balance, interest_type, interest_value, enabled,
    start_date, end_date, next_interest_at, created_at, updated_at
  ) values (
    p_user_id, v_amount, v_amount, p_interest_type, coalesce(p_interest_value, 0), coalesce(p_enabled, true),
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
grant execute on function public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date) to authenticated;

-- ---------------------------------------------------------------------------
-- New debt added later: charge interest up to now on the old balance first;
-- if nothing was owed before, the weekly schedule starts from the new debt's date.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_add_debt(uuid,numeric,timestamptz,text);
create function public.admin_add_debt(
  p_debt_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns public.debt_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.debt_accounts;
  v_amount numeric := coalesce(p_amount, 0);
  v_date timestamptz := coalesce(p_occurred_at, now());
  v_was_owing boolean;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if v_amount <= 0 then raise exception 'New debt amount must be greater than zero'; end if;

  perform public._accrue_debt_account(p_debt_account_id);
  select * into a from public.debt_accounts where id = p_debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  v_was_owing := coalesce(a.current_balance, 0) > 0;

  update public.debt_accounts
     set current_balance = coalesce(current_balance, 0) + v_amount,
         enabled = true,
         next_interest_at = case when v_was_owing and next_interest_at is not null
                                 then next_interest_at
                                 else v_date + interval '7 days' end,
         updated_at = now()
   where id = a.id
   returning * into a;

  insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note, created_at)
  values (a.id, a.user_id, 'debt_added', v_amount, a.current_balance,
          coalesce(nullif(trim(p_note), ''), 'Additional debt added by admin'), v_date);
  return a;
end;
$$;
grant execute on function public.admin_add_debt(uuid,numeric,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments: settle due interest first, so the customer pays the real current balance.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_debt_payment(
  p_debt_account_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.debt_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.debt_accounts;
  paid numeric;
  new_balance numeric;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  perform public._accrue_debt_account(p_debt_account_id);
  select * into a from public.debt_accounts where id = p_debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  paid := least(p_amount, coalesce(a.current_balance, 0));
  if paid <= 0 then raise exception 'This debt account has no outstanding balance'; end if;
  new_balance := coalesce(a.current_balance, 0) - paid;

  update public.debt_accounts
     set current_balance = new_balance,
         next_interest_at = case when new_balance <= 0 then null else next_interest_at end,
         updated_at = now()
   where id = a.id returning * into a;
  insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
  values (a.id, a.user_id, 'payment', paid, new_balance, coalesce(nullif(trim(p_note), ''), 'Manual payment recorded by admin'));
  return a;
end;
$$;
grant execute on function public.admin_record_debt_payment(uuid,numeric,text) to authenticated;

create or replace function public.admin_review_debt_payment(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.debt_payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.debt_payment_requests;
  a public.debt_accounts;
  v_amount numeric;
  v_new_balance numeric;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;

  select * into r from public.debt_payment_requests where id = p_request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if r.status <> 'pending' then raise exception 'This payment request has already been reviewed'; end if;

  if p_status = 'rejected' then
    update public.debt_payment_requests
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_review_note
     where id = r.id returning * into r;
    return r;
  end if;

  perform public._accrue_debt_account(r.debt_account_id);
  select * into a from public.debt_accounts where id = r.debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  v_amount := least(r.amount, coalesce(a.current_balance, 0));
  if v_amount <= 0 then raise exception 'This debt account has no outstanding balance'; end if;
  v_new_balance := coalesce(a.current_balance, 0) - v_amount;

  update public.debt_accounts
     set current_balance = v_new_balance,
         next_interest_at = case when v_new_balance <= 0 then null else next_interest_at end,
         updated_at = now()
   where id = a.id;
  insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
  values (a.id, a.user_id, 'payment', v_amount, v_new_balance, coalesce(nullif(trim(p_review_note), ''), 'QR payment approved by admin'));
  update public.debt_payment_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_review_note
   where id = r.id returning * into r;
  return r;
end;
$$;
grant execute on function public.admin_review_debt_payment(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- REPAIR existing accounts
-- Accounts that never got a schedule, or got one in the future by mistake and were never charged:
-- start the weeks from the Start date (or creation day). Accounts that already have interest rows keep their schedule.
-- ---------------------------------------------------------------------------
update public.debt_accounts a
   set next_interest_at = coalesce(a.start_date, a.created_at::date)::timestamptz + interval '7 days'
 where a.enabled = true
   and coalesce(a.current_balance, 0) > 0
   and not exists (select 1 from public.debt_transactions t where t.debt_account_id = a.id and t.type = 'interest');

-- catch every account up right now (runs as the SQL editor user, so no admin check applies)
select public.accrue_all_debt_interest() as weeks_of_interest_added;

-- ---------------------------------------------------------------------------
-- Hourly automatic run (so balances are right even if nobody opens the Debt page).
-- Needs the pg_cron extension; if your project does not offer it this is skipped and the other triggers still work.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'yn-debt-interest';
    perform cron.schedule('yn-debt-interest', '7 * * * *', 'select public.accrue_all_debt_interest()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%). Interest will still be added whenever Debt Management or a customer Debt page is opened.', sqlerrm;
end $$;
