-- YN Studio — Dedicated Debt Management Admin Panel
-- Run this after the existing debt schema/functions.

create or replace function public.admin_upsert_debt(
  p_user_id uuid,
  p_original_debt numeric,
  p_interest_type text,
  p_interest_value numeric,
  p_enabled boolean default true,
  p_account_id uuid default null
)
returns public.debt_accounts
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.debt_accounts;
  v_amount numeric := greatest(coalesce(p_original_debt,0),0);
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_user_id is null then raise exception 'Customer is required'; end if;
  if p_interest_type not in ('fixed','percent') then raise exception 'Invalid interest type'; end if;
  if coalesce(p_interest_value,0) < 0 then raise exception 'Interest value cannot be negative'; end if;

  if p_account_id is not null then
    select * into a from public.debt_accounts where id=p_account_id for update;
  else
    select * into a from public.debt_accounts where user_id=p_user_id limit 1 for update;
  end if;

  if found then
    -- Keep already-recorded payments/interest intact, but make changes to the
    -- principal amount flow through to the outstanding balance. This also fixes
    -- older zero-value debt accounts created before the dedicated debt panel.
    update public.debt_accounts
      set original_debt=v_amount,
          current_balance=greatest(0, coalesce(a.current_balance,0) + (v_amount - coalesce(a.original_debt,0))),
          interest_type=p_interest_type,
          interest_value=coalesce(p_interest_value,0),
          enabled=coalesce(p_enabled,true),
          next_interest_at=case
            when v_amount > 0 and coalesce(a.current_balance,0) + (v_amount - coalesce(a.original_debt,0)) > 0
              then coalesce(a.next_interest_at, now() + interval '7 days')
            else null
          end,
          updated_at=now()
      where id=a.id
      returning * into a;

    -- If this account previously had no balance, add the initial debt ledger row.
    if coalesce(a.current_balance,0) > 0
       and not exists (
         select 1 from public.debt_transactions
         where debt_account_id=a.id and type='debt'
       ) then
      insert into public.debt_transactions(
        debt_account_id,user_id,type,amount,balance_after,note
      ) values (
        a.id,p_user_id,'debt',v_amount,a.current_balance,'Debt account created by admin'
      );
    end if;

    return a;
  end if;

  insert into public.debt_accounts(
    user_id, original_debt, current_balance,
    interest_type, interest_value, enabled, created_at, updated_at
  ) values (
    p_user_id, v_amount, v_amount,
    p_interest_type, coalesce(p_interest_value,0), coalesce(p_enabled,true), now(), now()
  ) returning * into a;

  insert into public.debt_transactions(
    debt_account_id,user_id,type,amount,balance_after,note
  ) values (
    a.id,p_user_id,'debt',v_amount,a.current_balance,'Debt account created by admin'
  );

  return a;
end;
$$;

grant execute on function public.admin_upsert_debt(uuid,numeric,text,numeric,boolean,uuid) to authenticated;

create or replace function public.admin_set_debt_enabled(
  p_debt_account_id uuid,
  p_enabled boolean
)
returns public.debt_accounts
language plpgsql
security definer
set search_path=public
as $$
declare a public.debt_accounts;
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  update public.debt_accounts
    set enabled=coalesce(p_enabled,false), updated_at=now()
    where id=p_debt_account_id
    returning * into a;
  if not found then raise exception 'Debt account not found'; end if;
  return a;
end;
$$;

grant execute on function public.admin_set_debt_enabled(uuid,boolean) to authenticated;

create or replace function public.admin_record_debt_payment(
  p_debt_account_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.debt_accounts
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.debt_accounts;
  paid numeric;
  new_balance numeric;
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select * into a from public.debt_accounts where id=p_debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  paid:=least(p_amount,coalesce(a.current_balance,0));
  if paid <= 0 then raise exception 'This debt account has no outstanding balance'; end if;
  new_balance:=coalesce(a.current_balance,0)-paid;

  update public.debt_accounts set current_balance=new_balance,updated_at=now() where id=a.id returning * into a;
  insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note)
    values(a.id,a.user_id,'payment',paid,new_balance,coalesce(nullif(trim(p_note),''),'Manual payment recorded by admin'));
  return a;
end;
$$;

grant execute on function public.admin_record_debt_payment(uuid,numeric,text) to authenticated;
