-- YN Studio debt visibility fix
-- Run once in Supabase SQL Editor after the debt tables/functions exist.
-- This lets a signed-in customer read only their own debt account/history,
-- while admins can continue to manage debt accounts.

alter table public.debt_accounts enable row level security;
alter table public.debt_transactions enable row level security;

drop policy if exists "YN debt customer select" on public.debt_accounts;
create policy "YN debt customer select"
on public.debt_accounts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "YN debt admin all" on public.debt_accounts;
create policy "YN debt admin all"
on public.debt_accounts
for all
to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
));

drop policy if exists "YN debt transaction customer select" on public.debt_transactions;
create policy "YN debt transaction customer select"
on public.debt_transactions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "YN debt transaction admin all" on public.debt_transactions;
create policy "YN debt transaction admin all"
on public.debt_transactions
for all
to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id = auth.uid() and p.role = 'admin'
));

-- Make sure the customer payment RPC remains callable.
grant execute on function public.customer_pay_debt(numeric) to authenticated;
