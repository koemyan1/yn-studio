-- YN Studio Debt Enhancement
-- 1) Admin can add additional/new debt to an existing account with a date.
-- 2) Customers can pay from their wallet.
-- 3) Customers can submit QR payments with a receipt for admin approval.
-- 4) QR approval posts a payment to the debt ledger and hides the customer Debt UI when paid off.

create table if not exists public.debt_payment_requests (
  id uuid primary key default gen_random_uuid(),
  debt_account_id uuid not null references public.debt_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text
);

create index if not exists debt_payment_requests_status_idx on public.debt_payment_requests(status, submitted_at desc);
create index if not exists debt_payment_requests_user_idx on public.debt_payment_requests(user_id, submitted_at desc);

alter table public.debt_payment_requests enable row level security;

drop policy if exists "YN debt payment request customer select" on public.debt_payment_requests;
create policy "YN debt payment request customer select"
on public.debt_payment_requests for select to authenticated
using (user_id = auth.uid());

drop policy if exists "YN debt payment request customer insert" on public.debt_payment_requests;
create policy "YN debt payment request customer insert"
on public.debt_payment_requests for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.debt_accounts a
    where a.id = debt_account_id and a.user_id = auth.uid() and a.enabled = true and a.current_balance > 0
  )
);

drop policy if exists "YN debt payment request admin all" on public.debt_payment_requests;
create policy "YN debt payment request admin all"
on public.debt_payment_requests for all to authenticated
using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- Private receipt bucket.
insert into storage.buckets (id, name, public)
values ('debt-receipts','debt-receipts',false)
on conflict (id) do update set public=false;

drop policy if exists "YN debt receipt customer upload" on storage.objects;
create policy "YN debt receipt customer upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'debt-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "YN debt receipt customer read" on storage.objects;
create policy "YN debt receipt customer read"
on storage.objects for select to authenticated
using (bucket_id = 'debt-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "YN debt receipt customer delete" on storage.objects;
create policy "YN debt receipt customer delete"
on storage.objects for delete to authenticated
using (bucket_id = 'debt-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "YN debt receipt admin all" on storage.objects;
create policy "YN debt receipt admin all"
on storage.objects for all to authenticated
using (bucket_id = 'debt-receipts' and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
with check (bucket_id = 'debt-receipts' and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- Add a new debt entry without changing the original debt amount.
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
set search_path=public
as $$
declare
  a public.debt_accounts;
  v_amount numeric := coalesce(p_amount,0);
  v_date timestamptz := coalesce(p_occurred_at,now());
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if v_amount <= 0 then raise exception 'New debt amount must be greater than zero'; end if;
  select * into a from public.debt_accounts where id=p_debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  update public.debt_accounts
    set current_balance=coalesce(current_balance,0)+v_amount,
        enabled=true,
        next_interest_at=coalesce(next_interest_at, now()+interval '7 days'),
        updated_at=now()
    where id=a.id
    returning * into a;
  insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note,created_at)
  values(a.id,a.user_id,'debt',v_amount,a.current_balance,coalesce(nullif(trim(p_note),''),'Additional debt added by admin'),v_date);
  return a;
end;
$$;
grant execute on function public.admin_add_debt(uuid,numeric,timestamptz,text) to authenticated;

-- Admin approval/rejection of QR receipt submissions.
drop function if exists public.admin_review_debt_payment(uuid,text,text);
create function public.admin_review_debt_payment(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.debt_payment_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.debt_payment_requests;
  a public.debt_accounts;
  v_amount numeric;
  v_new_balance numeric;
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;

  select * into r from public.debt_payment_requests where id=p_request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if r.status <> 'pending' then raise exception 'This payment request has already been reviewed'; end if;

  if p_status = 'rejected' then
    update public.debt_payment_requests
      set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), review_note=p_review_note
      where id=r.id returning * into r;
    return r;
  end if;

  select * into a from public.debt_accounts where id=r.debt_account_id for update;
  if not found then raise exception 'Debt account not found'; end if;
  v_amount := least(r.amount,coalesce(a.current_balance,0));
  if v_amount <= 0 then raise exception 'This debt account has no outstanding balance'; end if;
  v_new_balance := coalesce(a.current_balance,0)-v_amount;

  update public.debt_accounts set current_balance=v_new_balance, updated_at=now() where id=a.id;
  insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note)
  values(a.id,a.user_id,'payment',v_amount,v_new_balance,coalesce(nullif(trim(p_review_note),''),'QR payment approved by admin'));
  update public.debt_payment_requests
    set status='approved', reviewed_at=now(), reviewed_by=auth.uid(), review_note=p_review_note
    where id=r.id returning * into r;
  return r;
end;
$$;
grant execute on function public.admin_review_debt_payment(uuid,text,text) to authenticated;

-- Keep the existing wallet-payment function available.
grant execute on function public.customer_pay_debt(numeric) to authenticated;
