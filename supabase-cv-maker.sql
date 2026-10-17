-- YN Studio: CV maker ($3 per CV).
-- Run once in Supabase -> SQL Editor. Safe to run again.
--
-- A customer picks a template + language, fills in their info, pays $3 (KHQR or wallet), and the CV is then
-- generated from the info stored here. The price lives ONLY in this table (default 3.00): customers cannot
-- set it, the status, or the payment fields. Only the server (service-role key) and pay_cv_with_wallet() can.

create table if not exists public.cv_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  template       text not null,                          -- rosa | jonathan | donna | daniel | muhammad | richard | director
  lang           text not null default 'en',             -- en | km
  data           jsonb not null default '{}'::jsonb,     -- everything the customer typed (photo is stored as a small data URL)
  price          numeric(10,2) not null default 3.00,
  status         text not null default 'pending',        -- pending | paid
  payment_method text,
  bakong_md5s    text[] not null default '{}',
  bakong_hash    text,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cv_orders_user_idx on public.cv_orders(user_id, created_at desc);
create unique index if not exists cv_orders_bakong_hash_uidx on public.cv_orders(bakong_hash) where bakong_hash is not null;
alter table public.cv_orders enable row level security;

drop policy if exists "cv own read" on public.cv_orders;
create policy "cv own read" on public.cv_orders for select
  using (user_id = auth.uid() or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "cv own insert" on public.cv_orders;
create policy "cv own insert" on public.cv_orders for insert
  with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "cv own update" on public.cv_orders;
create policy "cv own update" on public.cv_orders for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cv own delete" on public.cv_orders;
create policy "cv own delete" on public.cv_orders for delete
  using (user_id = auth.uid() and status = 'pending');

-- Column-level rights: a customer may only write the template, language and the CV content.
revoke insert, update on public.cv_orders from anon, authenticated;
grant select on public.cv_orders to authenticated;
grant insert (user_id, template, lang, data) on public.cv_orders to authenticated;
grant update (template, lang, data, updated_at) on public.cv_orders to authenticated;
grant delete on public.cv_orders to authenticated;

-- Pay a CV from the wallet: lock the CV + wallet, check the balance, take the money, record it, mark the CV paid.
create or replace function public.pay_cv_with_wallet(p_cv_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.cv_orders;
  v_wallet uuid; old_b numeric; new_b numeric;
  v_desc text;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;

  select * into c from public.cv_orders where id = p_cv_id and user_id = auth.uid() for update;
  if not found then raise exception 'CV order not found.'; end if;
  if c.status = 'paid' then return jsonb_build_object('paid', true, 'already', true); end if;
  if coalesce(c.price, 0) <= 0 then raise exception 'This CV has nothing to pay.'; end if;

  insert into public.wallets(user_id, balance) values (auth.uid(), 0) on conflict (user_id) do nothing;
  select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = auth.uid() order by balance desc nulls last limit 1 for update;
  if v_wallet is null then raise exception 'Your wallet could not be found.'; end if;
  if old_b < c.price then
    raise exception 'Your wallet balance is not enough for this CV. Add money to your wallet first.';
  end if;

  new_b := old_b - c.price;
  v_desc := 'CV maker (wallet payment)';
  update public.wallets set balance = new_b where id = v_wallet;

  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, auth.uid(), -c.price, old_b, new_b, 'order_payment', v_desc);
  exception when check_violation or invalid_text_representation then
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, auth.uid(), -c.price, old_b, new_b, 'debt_payment', v_desc);
  end;

  update public.cv_orders set status = 'paid', payment_method = 'Wallet', paid_at = now(), updated_at = now() where id = c.id;

  begin
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (null, 'admin', 'CV paid with wallet', 'A customer paid $' || c.price::text || ' for a CV from their wallet.', 'service', '/admin/requests');
  exception when others then null;
  end;

  return jsonb_build_object('paid', true, 'balance', new_b);
end; $$;
revoke all on function public.pay_cv_with_wallet(uuid) from public, anon;
grant execute on function public.pay_cv_with_wallet(uuid) to authenticated;
