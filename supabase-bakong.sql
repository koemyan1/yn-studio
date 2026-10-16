-- YN Studio: Bakong KHQR (automatic payment confirmation)
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table public.orders add column if not exists bakong_md5      text;
alter table public.orders add column if not exists bakong_md5s     text[] not null default '{}';
alter table public.orders add column if not exists bakong_status   text;
alter table public.orders add column if not exists bakong_hash     text;
alter table public.orders add column if not exists bakong_paid_at  timestamptz;

create index if not exists orders_bakong_md5s_idx on public.orders using gin (bakong_md5s);
-- One Bakong transaction can only ever pay one order.
create unique index if not exists orders_bakong_hash_uidx on public.orders (bakong_hash) where bakong_hash is not null;

-- IMPORTANT: customers must NOT be able to mark their own orders paid.
-- The server uses the service-role key (bypasses RLS) to set payment_status / bakong_* columns.
-- If you have an UPDATE policy that lets customers edit their own orders, restrict it so that
-- payment_status, status and bakong_* cannot be changed by the customer.

-- ---------------------------------------------------------------------------
-- Wallet top-ups and debt payments paid with Bakong KHQR
-- ---------------------------------------------------------------------------
create table if not exists public.bakong_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('wallet','debt')),
  amount      numeric(12,2) not null check (amount > 0),
  status      text not null default 'pending',          -- pending | paid | mismatch
  bakong_md5s text[] not null default '{}',
  bakong_hash text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create unique index if not exists bakong_payments_hash_uidx on public.bakong_payments (bakong_hash) where bakong_hash is not null;
create index if not exists bakong_payments_user_idx on public.bakong_payments (user_id, status, created_at desc);
-- RLS on with no policies: only the server (service-role key) can read or write this table.
alter table public.bakong_payments enable row level security;

-- Applies a confirmed payment exactly once. Only the server may call it.
create or replace function public.bakong_apply_payment(p_payment_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.bakong_payments;
  a public.debt_accounts;
  v_wallet uuid; old_b numeric; new_b numeric;
  applied numeric := 0; extra numeric := 0;
begin
  select * into p from public.bakong_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status = 'paid' then return false; end if;

  insert into public.wallets(user_id, balance) values (p.user_id, 0) on conflict (user_id) do nothing;

  if p.kind = 'wallet' then
    extra := p.amount;                       -- whole amount goes to the wallet
  else
    perform public.accrue_customer_debt_interest(p.user_id);
    select * into a from public.debt_accounts where user_id = p.user_id and enabled = true for update;
    if found then applied := least(p.amount, a.current_balance); end if;
    extra := p.amount - applied;             -- anything beyond the debt goes to the wallet
    if applied > 0 then
      a.current_balance := a.current_balance - applied;
      insert into public.debt_transactions(debt_account_id, user_id, type, amount, balance_after, note)
        values (a.id, p.user_id, 'payment', applied, a.current_balance, 'Bakong KHQR payment');
      update public.debt_accounts set current_balance = a.current_balance, updated_at = now() where id = a.id;
    end if;
  end if;

  if extra > 0 then
    select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = p.user_id limit 1 for update;
    new_b := old_b + extra;
    update public.wallets set balance = new_b where id = v_wallet;
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, p.user_id, extra, old_b, new_b, 'deposit',
              case when p.kind = 'wallet' then 'Wallet top-up (Bakong KHQR)' else 'Debt overpayment (Bakong KHQR)' end);
  end if;

  update public.bakong_payments set status = 'paid', bakong_hash = p_hash, paid_at = now() where id = p.id;
  return true;
end; $$;
revoke all on function public.bakong_apply_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.bakong_apply_payment(uuid, text) to service_role;
