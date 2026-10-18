-- YN Studio: make every CV private to the customer who made it.
-- Run once in Supabase -> SQL Editor. Safe to run again.
alter table public.cv_orders enable row level security;
drop policy if exists "cv own read" on public.cv_orders;
create policy "cv own read" on public.cv_orders for select using (user_id = auth.uid());
drop policy if exists "cv own insert" on public.cv_orders;
create policy "cv own insert" on public.cv_orders for insert with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "cv own update" on public.cv_orders;
create policy "cv own update" on public.cv_orders for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cv own delete" on public.cv_orders;
create policy "cv own delete" on public.cv_orders for delete using (user_id = auth.uid() and status = 'pending');
revoke all on public.cv_orders from anon;
