-- YN Studio: wallet Goals (save toward a phone, a trip, anything).
-- Run ONCE in Supabase -> SQL Editor. Safe to re-run. No other file needed first.
-- A goal never moves money: its progress is the customer's wallet balance (same currency) compared with the goal price.
-- Each customer can only see and change their own goals.
create table if not exists public.wallet_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  category text not null default 'custom',
  image_url text check (image_url is null or char_length(image_url) <= 400000), -- small compressed picture (data URL)
  target_amount numeric(14,2) not null check (target_amount > 0),
  currency text not null default 'USD' check (currency in ('USD','KHR')),
  created_at timestamptz not null default now()
);
create index if not exists wallet_goals_user_idx on public.wallet_goals(user_id, created_at);
alter table public.wallet_goals enable row level security;
drop policy if exists wallet_goals_own on public.wallet_goals;
create policy wallet_goals_own on public.wallet_goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.wallet_goals to authenticated;
