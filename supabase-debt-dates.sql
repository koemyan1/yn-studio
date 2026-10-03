-- YN Studio Debt dates + amount setup
-- Run this AFTER the existing debt schema and the previous debt functions.

alter table public.debt_accounts
  add column if not exists start_date date,
  add column if not exists end_date date;

-- Recreate the admin upsert function with debt dates.
drop function if exists public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid);
drop function if exists public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date);

create or replace function public.admin_upsert_debt(
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
set search_path=public
as $$
declare
  a public.debt_accounts;
  v_amount numeric := greatest(coalesce(p_original_debt,0),0);
  v_delta numeric;
begin
  if not exists (
    select 1 from public.profiles
    where user_id=auth.uid() and role='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_user_id is null then
    raise exception 'Customer is required';
  end if;

  if p_interest_type not in ('fixed','percent') then
    raise exception 'Invalid interest type';
  end if;

  if coalesce(p_interest_value,0) < 0 then
    raise exception 'Interest value cannot be negative';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_account_id is not null then
    select * into a
    from public.debt_accounts
    where id=p_account_id
    for update;
  else
    select * into a
    from public.debt_accounts
    where user_id=p_user_id
    limit 1
    for update;
  end if;

  if found then
    -- Existing accounts keep their recorded payments/interest.
    -- Dates and interest settings can be updated safely.
    update public.debt_accounts
    set
      original_debt=v_amount,
      current_balance=greatest(
        0,
        coalesce(a.current_balance,0)
        + (v_amount-coalesce(a.original_debt,0))
      ),
      interest_type=p_interest_type,
      interest_value=coalesce(p_interest_value,0),
      enabled=coalesce(p_enabled,true),
      start_date=coalesce(p_start_date,a.start_date),
      end_date=p_end_date,
      next_interest_at=case
        when v_amount > 0
         and greatest(0,coalesce(a.current_balance,0)+(v_amount-coalesce(a.original_debt,0))) > 0
        then coalesce(a.next_interest_at,now()+interval '7 days')
        else null
      end,
      updated_at=now()
    where id=a.id
    returning * into a;

    if coalesce(a.current_balance,0)>0
       and not exists (
         select 1 from public.debt_transactions
         where debt_account_id=a.id
         and type='debt_added'
       ) then
      insert into public.debt_transactions(
        debt_account_id,user_id,type,amount,balance_after,note
      ) values (
        a.id,p_user_id,'debt_added',v_amount,a.current_balance,'Debt account created by admin'
      );
    end if;

    return a;
  end if;

  insert into public.debt_accounts(
    user_id,
    original_debt,
    current_balance,
    interest_type,
    interest_value,
    enabled,
    start_date,
    end_date,
    created_at,
    updated_at
  ) values (
    p_user_id,
    v_amount,
    v_amount,
    p_interest_type,
    coalesce(p_interest_value,0),
    coalesce(p_enabled,true),
    p_start_date,
    p_end_date,
    now(),
    now()
  ) returning * into a;

  if v_amount > 0 then
    insert into public.debt_transactions(
      debt_account_id,user_id,type,amount,balance_after,note
    ) values (
      a.id,p_user_id,'debt_added',v_amount,a.current_balance,'Debt account created by admin'
    );
  end if;

  return a;
end;
$$;

grant execute on function public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid,date,date) to authenticated;
