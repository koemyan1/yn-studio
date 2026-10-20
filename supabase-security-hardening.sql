-- =====================================================================================================
-- YN Studio: SECURITY HARDENING (run in Supabase -> SQL Editor).  Safe to re-run.  Costs $0.
-- Read SECURITY-REPORT.md first.  Run supabase-security-audit.sql BEFORE and AFTER, and test one real
-- checkout (wallet + KHQR), one sign-up and one admin order edit after running it.
--
-- NOT run or tested against a live database by the author (no database was available) -> try it on a
-- copy / test project first if you can.  Every section has a ROLLBACK note at the end of this file.
-- Nothing here deletes or rewrites existing data.
-- =====================================================================================================

-- ---------- A. Tables used by the security dashboard (server-only: RLS on, no policies) ----------
create table if not exists public.security_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ip          text,
  type        text not null,
  severity    text not null default 'low',
  action      text not null default 'logged',
  method      text,
  path        text,
  user_agent  text,
  user_id     uuid,
  details     jsonb not null default '{}'::jsonb,
  count       integer not null default 1
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
create index if not exists security_events_ip_idx      on public.security_events (ip, created_at desc);
create index if not exists security_events_type_idx    on public.security_events (type, created_at desc);

create table if not exists public.security_blocks (
  ip            text primary key,
  reason        text,
  level         integer not null default 1,
  blocked_until timestamptz not null,
  permanent     boolean not null default false,
  created_by    text not null default 'auto',
  created_at    timestamptz not null default now()
);
create table if not exists public.security_allowlist (
  ip text primary key, note text, created_at timestamptz not null default now()
);
create table if not exists public.security_settings (
  key text primary key, value text not null, updated_at timestamptz not null default now()
);
insert into public.security_settings(key, value) values ('integrity_mode', 'report') on conflict (key) do nothing;

alter table public.security_events    enable row level security;
alter table public.security_blocks    enable row level security;
alter table public.security_allowlist enable row level security;
alter table public.security_settings  enable row level security;
revoke all on public.security_events, public.security_blocks, public.security_allowlist, public.security_settings from anon, authenticated;
-- (the Node server uses the service-role key, which bypasses RLS; browsers can never read these tables)

-- ---------- B. Small helpers ----------
create or replace function public.yn_security_setting(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.security_settings where key = p_key), p_default);
$$;
revoke all on function public.yn_security_setting(text, text) from public, anon, authenticated;
grant execute on function public.yn_security_setting(text, text) to service_role;

-- Whitelisted + throttled so a customer cannot use it to spam your log.
create or replace function public.yn_security_log(p_type text, p_severity text, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('tamper_attempt', 'order_integrity') then return; end if;
  if (select count(*) from public.security_events where user_id is not distinct from auth.uid() and type = p_type and created_at > now() - interval '1 minute') >= 10 then return; end if;
  insert into public.security_events(type, severity, action, user_id, details)
  values (p_type, coalesce(p_severity, 'high'), 'logged', auth.uid(), coalesce(p_details, '{}'::jsonb));
exception when others then null;
end; $$;
revoke all on function public.yn_security_log(text, text, jsonb) from public, anon;
grant execute on function public.yn_security_log(text, text, jsonb) to authenticated, service_role;

-- ---------- C. Order price integrity (the browser currently writes prices/totals itself) ----------
-- ok = every item's unit_price is a real price of that product (base price or one of its variant prices),
--      quantities are sane, and orders.total = max(0, sum(items) - coupon discount actually redeemed) + fees.
create or replace function public.yn_check_order_integrity(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; r record; v_valid boolean; items_sum numeric := 0; bad int := 0; red numeric := 0; expected numeric; fees numeric;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_not_found'); end if;
  for r in select product_id, quantity, unit_price from public.order_items where order_id = p_order_id loop
    items_sum := items_sum + coalesce(r.unit_price, 0) * coalesce(r.quantity, 0);
    if coalesce(r.quantity, 0) < 1 or coalesce(r.unit_price, 0) < 0 then bad := bad + 1; continue; end if;
    select (p.price = r.unit_price) or exists (
             select 1 from public.product_options po join public.product_option_values pv on pv.option_id = po.id
             where po.product_id = p.id and coalesce(pv.price_adjustment, 0) > 0 and pv.price_adjustment = r.unit_price)
      into v_valid from public.products p where p.id = r.product_id;
    if v_valid is not true then bad := bad + 1; end if;
  end loop;
  begin
    select coalesce(sum(discount_amount), 0) into red from public.coupon_redemptions where order_id = p_order_id;
  exception when undefined_table or undefined_column then red := 0; end;
  fees := coalesce(nullif(to_jsonb(o)->>'fees', '')::numeric, 0);
  expected := greatest(0, items_sum - red) + fees;
  if bad > 0 then
    return jsonb_build_object('ok', false, 'reason', 'price_tampered', 'bad_items', bad, 'total', o.total, 'expected', expected);
  end if;
  if fees < 0 or abs(coalesce(o.total, 0) - expected) > 0.011 then
    return jsonb_build_object('ok', false, 'reason', 'total_mismatch', 'total', o.total, 'expected', expected);
  end if;
  return jsonb_build_object('ok', true, 'total', o.total);
end; $$;
revoke all on function public.yn_check_order_integrity(uuid) from public, anon, authenticated;
grant execute on function public.yn_check_order_integrity(uuid) to service_role;

-- Wallet payment path: same function as supabase-wallet-order-payment.sql + the integrity check (report/enforce).
create or replace function public.pay_order_with_wallet(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_wallet uuid; old_b numeric; new_b numeric;
  v_desc text; v_int jsonb;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;

  select * into o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.payment_status = 'paid' then return jsonb_build_object('paid', true, 'already', true); end if;
  if coalesce(o.status, '') in ('cancelled', 'rejected') then raise exception 'This order was cancelled.'; end if;
  if coalesce(o.total, 0) <= 0 then raise exception 'This order has nothing to pay.'; end if;

  -- NEW: price integrity (report mode only logs; enforce mode refuses)
  v_int := public.yn_check_order_integrity(o.id);
  if (v_int->>'ok')::boolean is not true then
    perform public.yn_security_log('order_integrity', 'high', v_int || jsonb_build_object('order_id', o.id, 'via', 'wallet'));
    if public.yn_security_setting('integrity_mode', 'report') = 'enforce' then
      raise exception 'We could not verify this order''s price. Please go back to your cart and place the order again.';
    end if;
  end if;

  insert into public.wallets(user_id, balance) values (auth.uid(), 0) on conflict (user_id) do nothing;
  select id, coalesce(balance, 0) into v_wallet, old_b from public.wallets where user_id = auth.uid() order by balance desc nulls last limit 1 for update;
  if v_wallet is null then raise exception 'Your wallet could not be found.'; end if;
  if old_b < o.total then
    raise exception 'Your wallet balance is not enough for this order. Add money to your wallet first.';
  end if;

  new_b := old_b - o.total;
  v_desc := 'Order #' || coalesce(o.order_number, o.id::text) || ' (wallet payment)';
  update public.wallets set balance = new_b where id = v_wallet;

  begin
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, auth.uid(), -o.total, old_b, new_b, 'order_payment', v_desc);
  exception when check_violation or invalid_text_representation then
    insert into public.wallet_transactions(wallet_id, user_id, amount, balance_before, balance_after, type, description)
      values (v_wallet, auth.uid(), -o.total, old_b, new_b, 'debt_payment', v_desc);
  end;

  begin
    update public.orders set payment_status = 'paid', status = 'paid', payment_method = 'Wallet' where id = o.id;
  exception when check_violation then
    update public.orders set payment_status = 'paid', status = 'paid' where id = o.id;
  end;

  begin
    insert into public.notifications(user_id, target_role, title, message, type, link)
      values (null, 'admin', 'Order paid with wallet',
              'Order #' || coalesce(o.order_number, o.id::text) || ' was paid from the customer wallet.', 'order', '/admin/orders');
  exception when others then null;
  end;

  return jsonb_build_object('paid', true, 'balance', new_b);
end; $$;
revoke all on function public.pay_order_with_wallet(uuid) from public, anon;
grant execute on function public.pay_order_with_wallet(uuid) to authenticated;

-- ---------- D. Anti-tamper guards ----------
-- Why: your base tables (profiles, wallets, orders) were not in the files I could inspect, so I could not confirm that
-- a signed-in customer cannot write profiles.role / wallets.balance / orders.payment_status straight from the browser
-- (the public anon key + their own login is all it takes).  These triggers make it impossible no matter what the
-- policies say.  They only act when the caller is a browser/API user (role authenticated/anon):
--   * your server (service role), the SQL editor and your SECURITY DEFINER functions are NOT affected,
--   * admins are exempt on profiles/orders (the admin panel keeps working),
--   * forbidden changes are silently ignored (the rest of the row is saved) and logged as 'tamper_attempt'.
-- Column handling uses jsonb so a column that does not exist in your project can never cause an error.
create or replace function public.yn_guard_protected_columns()
returns trigger language plpgsql as $$
declare
  is_api boolean := current_user in ('authenticated', 'anon');
  v_admin boolean := false;
  o jsonb; n jsonb; k text; cols text[]; changed text[] := '{}';
begin
  if not is_api then return new; end if;
  if tg_table_name <> 'wallets' then
    select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin') into v_admin;
    if v_admin then return new; end if;
  end if;
  n := to_jsonb(new);

  if tg_op = 'INSERT' then
    if tg_table_name = 'profiles' then
      if coalesce(n->>'role', 'customer') <> 'customer' then changed := changed || 'role'; n := jsonb_set(n, '{role}', '"customer"'); end if;
    elsif tg_table_name = 'wallets' then
      foreach k in array array['balance', 'balance_khr'] loop
        if n ? k and coalesce((n->>k)::numeric, 0) <> 0 then changed := changed || k; n := jsonb_set(n, array[k], '0'); end if;
      end loop;
    elsif tg_table_name = 'orders' then
      if lower(coalesce(n->>'payment_status', '')) = 'paid' then changed := changed || 'payment_status'; n := jsonb_set(n, '{payment_status}', '"pending"'); end if;
      if lower(coalesce(n->>'status', '')) in ('paid', 'completed', 'delivered') then changed := changed || 'status'; n := jsonb_set(n, '{status}', '"payment pending"'); end if;
      foreach k in array array['bakong_hash', 'bakong_paid_at', 'aba_apv', 'aba_paid_at'] loop
        if n ? k and n->k <> 'null'::jsonb then changed := changed || k; n := jsonb_set(n, array[k], 'null'::jsonb); end if;
      end loop;
    end if;
  else -- UPDATE: put protected columns back to their old values
    o := to_jsonb(old);
    cols := case tg_table_name
      when 'profiles' then array['role', 'user_id']
      when 'wallets'  then array['balance', 'balance_khr', 'user_id']
      when 'orders'   then array['payment_status', 'total', 'subtotal', 'fees', 'coupon_discount', 'coupon_code', 'coupon_id', 'user_id', 'order_number',
                                 'payment_method', 'tracking_token', 'bakong_md5', 'bakong_md5s', 'bakong_status', 'bakong_hash', 'bakong_paid_at',
                                 'aba_tran_id', 'aba_tran_ids', 'aba_status', 'aba_apv', 'aba_paid_at']
      else array[]::text[] end;
    foreach k in array cols loop
      if o ? k and (n->k) is distinct from (o->k) then changed := changed || k; n := jsonb_set(n, array[k], o->k); end if;
    end loop;
    if tg_table_name = 'orders' and (n->>'status') is distinct from (o->>'status') and lower(coalesce(n->>'status', '')) <> 'cancelled' then
      changed := changed || 'status'; n := jsonb_set(n, '{status}', o->'status');
    end if;
  end if;

  if array_length(changed, 1) > 0 then
    perform public.yn_security_log('tamper_attempt', 'high', jsonb_build_object('table', tg_table_name, 'op', tg_op, 'columns', changed));
    return jsonb_populate_record(new, n);
  end if;
  return new;
end; $$;

drop trigger if exists yn_guard_profiles on public.profiles;
create trigger yn_guard_profiles before insert or update on public.profiles for each row execute function public.yn_guard_protected_columns();
drop trigger if exists yn_guard_wallets on public.wallets;
create trigger yn_guard_wallets before insert or update on public.wallets for each row execute function public.yn_guard_protected_columns();
drop trigger if exists yn_guard_orders on public.orders;
create trigger yn_guard_orders before insert or update on public.orders for each row execute function public.yn_guard_protected_columns();

-- ---------- E. Close anonymous access to logged-in-only functions ----------
-- Functions are executable by "public" (= anon too) unless revoked. These all expect a signed-in user.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'accrue_all_debt_interest', 'accrue_customer_debt_interest', 'admin_add_debt', 'admin_adjust_wallet',
      'admin_approve_order_payment', 'admin_delete_debt', 'admin_record_debt_payment', 'admin_review_debt_payment',
      'admin_set_debt_enabled', 'admin_upsert_debt', 'apply_coupon_to_order', 'assign_coupon_to_customer',
      'claim_chat_reward', 'customer_pay_debt', 'validate_coupon', 'yn_coupon_discount'])
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- =====================================================================================================
-- ROLLBACK (only if something misbehaves; none of these touch your data):
--   drop trigger if exists yn_guard_profiles on public.profiles;
--   drop trigger if exists yn_guard_wallets  on public.wallets;
--   drop trigger if exists yn_guard_orders   on public.orders;
--   -- original wallet payment function: re-run supabase-wallet-order-payment.sql
--   -- anon access (section E): grant execute on function public.<name>(<args>) to anon;   (only if a logged-out page needs it)
-- TO TURN ON PRICE ENFORCEMENT (after you have seen no false alarms in /admin/security):
--   update public.security_settings set value = 'enforce' where key = 'integrity_mode';     -- or use the toggle in the dashboard
-- =====================================================================================================
