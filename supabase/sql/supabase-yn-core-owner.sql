-- =====================================================================================================================
-- YN CORE OWNER: who the "big boss" is, and who may make other accounts admin.
-- Run in the Supabase SQL Editor AFTER supabase-security-hardening.sql and supabase-yn-core.sql. Safe to run twice.
--
-- 1. yn_core_owners: the owner list. Only you can edit it, here in the SQL editor (the website and the API cannot).
-- 2. The profile guard trigger is replaced so that an admin can NO LONGER change profiles.role from the browser. Before this,
--    "admins are exempt" meant any admin could make anyone admin by calling Supabase directly. Now only the server (after the
--    five-coin gate and a fresh Face ID) and the SQL editor can change a role.
--
-- After running it, add yourself as owner (replace the email), and check:
--   insert into public.yn_core_owners (user_id)
--     select user_id from public.profiles where lower(email) = lower('YOUR-EMAIL@example.com') on conflict do nothing;
--   select * from public.yn_core_owners;
--
-- Undo: re-run supabase-security-hardening.sql (restores the old trigger function) and  drop table public.yn_core_owners;
-- =====================================================================================================================

create table if not exists public.yn_core_owners (
  user_id    uuid primary key,
  note       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.yn_core_owners enable row level security;
revoke all on public.yn_core_owners from anon, authenticated;
grant select, insert, update, delete on public.yn_core_owners to service_role;

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
    if v_admin and tg_table_name <> 'profiles' then return new; end if;   -- CHANGED: admins are no longer exempt on profiles (role / user_id)
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
