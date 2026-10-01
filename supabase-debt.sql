-- YN Studio private customer debt feature
create table if not exists public.debt_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  original_debt numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  interest_type text not null default 'fixed' check (interest_type in ('fixed','percent')),
  interest_value numeric(12,4) not null default 0,
  interest_frequency text not null default 'week' check (interest_frequency='week'),
  next_interest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.debt_transactions (
  id uuid primary key default gen_random_uuid(),
  debt_account_id uuid not null references public.debt_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('debt_added','interest','payment')),
  amount numeric(12,2) not null check (amount >= 0),
  balance_after numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists debt_transactions_user_idx on public.debt_transactions(user_id,created_at desc);
alter table public.debt_accounts enable row level security;
alter table public.debt_transactions enable row level security;
drop policy if exists "customer reads own debt" on public.debt_accounts;
create policy "customer reads own debt" on public.debt_accounts for select using (auth.uid()=user_id);
drop policy if exists "customer reads own debt transactions" on public.debt_transactions;
create policy "customer reads own debt transactions" on public.debt_transactions for select using (auth.uid()=user_id);
create or replace function public.accrue_customer_debt_interest(p_user_id uuid)
returns public.debt_accounts language plpgsql security definer set search_path=public as $$
declare a public.debt_accounts; v_interest numeric(12,2); v_next timestamptz; v_periods int; i int;
begin
 select * into a from public.debt_accounts where user_id=p_user_id and enabled=true for update;
 if not found then return null; end if;
 if a.next_interest_at is null then update public.debt_accounts set next_interest_at=now()+interval '7 days',updated_at=now() where id=a.id returning * into a; return a; end if;
 v_next:=a.next_interest_at;
 while v_next <= now() and a.current_balance > 0 loop
   if a.interest_type='fixed' then v_interest:=greatest(0,round(a.interest_value,2));
   else v_interest:=greatest(0,round(a.current_balance*(a.interest_value/100),2)); end if;
   if v_interest>0 then
     a.current_balance:=a.current_balance+v_interest;
     insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note) values(a.id,a.user_id,'interest',v_interest,a.current_balance,'Weekly interest');
   end if;
   v_next:=v_next+interval '7 days';
 end loop;
 update public.debt_accounts set current_balance=a.current_balance,next_interest_at=v_next,updated_at=now() where id=a.id returning * into a;
 return a;
end; $$;
create or replace function public.admin_add_debt(p_user_id uuid,p_amount numeric,p_note text default null)
returns public.debt_accounts language plpgsql security definer set search_path=public as $$
declare a public.debt_accounts;
begin
 if not exists(select 1 from public.profiles where user_id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
 if p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
 insert into public.debt_accounts(user_id,enabled,original_debt,current_balance,interest_type,interest_value,interest_frequency,next_interest_at) values(p_user_id,true,p_amount,p_amount,'fixed',0,'week',now()+interval '7 days') on conflict(user_id) do update set enabled=true,current_balance=public.debt_accounts.current_balance+p_amount,original_debt=public.debt_accounts.original_debt+p_amount,updated_at=now() returning * into a;
 insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note) values(a.id,p_user_id,'debt_added',p_amount,a.current_balance,coalesce(p_note,'Debt added'));
 return a;
end; $$;
create or replace function public.admin_record_debt_payment(p_user_id uuid,p_amount numeric,p_note text default null)
returns public.debt_accounts language plpgsql security definer set search_path=public as $$
declare a public.debt_accounts; v numeric;
begin
 if not exists(select 1 from public.profiles where user_id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
 if p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
 perform public.accrue_customer_debt_interest(p_user_id);
 select * into a from public.debt_accounts where user_id=p_user_id for update;
 if not found then raise exception 'Debt account not found'; end if;
 v:=least(p_amount,a.current_balance); a.current_balance:=a.current_balance-v;
 insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note) values(a.id,p_user_id,'payment',v,a.current_balance,coalesce(p_note,'Payment recorded'));
 update public.debt_accounts set current_balance=a.current_balance,updated_at=now() where id=a.id returning * into a; return a;
end; $$;
-- Admin policies are intentionally broad only for admin users through RLS checks.
drop policy if exists "admin manages debt accounts" on public.debt_accounts;
create policy "admin manages debt accounts" on public.debt_accounts for all using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "admin reads debt transactions" on public.debt_transactions;
create policy "admin reads debt transactions" on public.debt_transactions for select using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
