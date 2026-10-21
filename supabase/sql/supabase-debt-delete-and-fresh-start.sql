-- YN Studio: (1) admin can COMPLETELY delete a debt account, (2) once a customer has paid a debt off,
-- the old debt is never shown to them again - a new debt starts fresh.
-- Run ONCE in Supabase -> SQL Editor, AFTER supabase-debt-multi-currency.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Bookkeeping for "old, paid-off debt"
-- ---------------------------------------------------------------------------
alter table public.debt_transactions add column if not exists archived boolean not null default false;
alter table public.debt_accounts     add column if not exists cycle_started_at timestamptz;

-- Accounts that are already fully paid off right now: archive their history so it can never come back.
update public.debt_transactions t
   set archived = true
  from public.debt_accounts a
 where t.debt_account_id = a.id
   and coalesce(a.current_balance, 0) <= 0
   and t.archived = false;

-- Customers only ever read the CURRENT debt's history (admins still see everything).
drop policy if exists "YN debt transaction customer select" on public.debt_transactions;
create policy "YN debt transaction customer select"
on public.debt_transactions
for select
to authenticated
using (user_id = auth.uid() and archived = false);

-- ---------------------------------------------------------------------------
-- 2) New debt after a payoff = brand-new debt (old history archived, original debt reset)
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

  if not v_was_owing then
    -- the customer had paid everything off: hide the old debt from them and start fresh
    update public.debt_transactions set archived = true where debt_account_id = a.id and archived = false;
    update public.debt_accounts
       set original_debt = v_amount,
           current_balance = v_amount,
           enabled = true,
           start_date = v_date::date,
           end_date = null,
           cycle_started_at = now(),
           next_interest_at = v_date + interval '7 days',
           updated_at = now()
     where id = a.id
     returning * into a;
    insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note, created_at)
    values (a.id, a.user_id, 'debt_added', v_amount, a.current_balance,
            coalesce(nullif(trim(p_note), ''), 'New debt added by admin'), v_date);
  else
    update public.debt_accounts
       set current_balance = coalesce(current_balance, 0) + v_amount,
           enabled = true,
           next_interest_at = coalesce(next_interest_at, v_date + interval '7 days'),
           updated_at = now()
     where id = a.id
     returning * into a;
    insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note, created_at)
    values (a.id, a.user_id, 'debt_added', v_amount, a.current_balance,
            coalesce(nullif(trim(p_note), ''), 'Additional debt added by admin'), v_date);
  end if;
  return a;
end;
$$;
grant execute on function public.admin_add_debt(uuid,numeric,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Completely delete a debt account (account + whole ledger + QR payment submissions)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_delete_debt(uuid);
create function public.admin_delete_debt(p_debt_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  if not exists (select 1 from public.debt_accounts where id = p_debt_account_id) then
    raise exception 'Debt account not found';
  end if;
  delete from public.debt_payment_requests where debt_account_id = p_debt_account_id;
  delete from public.debt_transactions     where debt_account_id = p_debt_account_id;
  delete from public.debt_accounts         where id = p_debt_account_id;
  return true;
end;
$$;
grant execute on function public.admin_delete_debt(uuid) to authenticated;
