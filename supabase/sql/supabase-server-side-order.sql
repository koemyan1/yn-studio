-- =====================================================================================================
-- YN Studio: SERVER-SIDE ORDER PRICING  (run in Supabase -> SQL Editor).  Safe to re-run.  Costs $0.
--
-- WHY: until now the browser calculated unit prices, delivery fee, subtotal and total and wrote them
-- straight into `orders` / `order_items`. A customer with browser dev-tools could pay $0.01 for anything.
-- This file adds ONE function, yn_place_order(), that rebuilds every number from the database:
--   * unit price      <- products.price / product_option_values.price_adjustment   (same rule as the app)
--   * delivery fee    <- delivery_settings + categories.delivery_fee*              (same rule as the app)
--   * coupon discount <- your existing apply_coupon_to_order()
--   * delivery name / phone / address <- the customer's own profiles row
-- and inserts the order + items + coupon redemption + cart cleanup in ONE transaction (all or nothing).
--
-- NOT run or tested against a live database by the author (no Postgres was available).
-- Test on a copy / test project first:  tests/sql/place-order.test.sql  (BEGIN ... ROLLBACK, changes nothing).
--
-- DEPLOY ORDER (nothing breaks at any step):
--   1. Run this file.                      -> old app keeps working (direct inserts still allowed, only logged)
--   2. Deploy the new frontend.            -> checkout now calls yn_place_order()
--   3. Watch /admin/security for a few days (look for 'tamper_attempt' with direct_order_insert).
--   4. update public.security_settings set value = 'enforce' where key = 'order_insert_mode';
--      -> browsers can no longer insert orders/order_items directly. Admin "create order" still works.
-- =====================================================================================================

insert into public.security_settings(key, value) values ('order_insert_mode', 'report')   on conflict (key) do nothing;
insert into public.security_settings(key, value) values ('require_delivery_pin', 'off')   on conflict (key) do nothing;

-- ---------- Helpers (security definer, because yn_security_setting is service_role-only) ----------
create or replace function public.yn_order_insert_mode()
returns text language sql stable security definer set search_path = public as $$
  select public.yn_security_setting('order_insert_mode', 'report');
$$;
revoke all on function public.yn_order_insert_mode() from public, anon;
grant execute on function public.yn_order_insert_mode() to authenticated;

-- Straight-line distance in km. Identical formula to distanceKm() in src/mapCheckout.tsx.
create or replace function public.yn_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))));
$$;

-- ---------- The function ----------
create or replace function public.yn_place_order(
  p_cart_item_ids  uuid[],
  p_pin_lat        double precision default null,
  p_pin_lng        double precision default null,
  p_coupon_code    text             default null,
  p_expected_total numeric          default null   -- what the customer saw; only used to detect drift (see integrity_mode)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  prof        jsonb;
  ds          jsonb;
  ci          record;
  p           record;
  opt         record;
  cat         record;
  v_pick      text;
  v_adj       numeric;
  v_unit      numeric;
  v_qty       integer;
  v_subtotal  numeric := 0;
  v_lines     jsonb   := '[]'::jsonb;
  v_cat_ids   uuid[]  := '{}';
  v_cat_id    uuid;
  v_found     integer;
  v_has_pin   boolean := (p_pin_lat is not null and p_pin_lng is not null);
  v_has_store boolean := false;
  v_km        double precision;
  v_base_fee  numeric;
  v_base_km   numeric;
  v_extra_fee numeric;
  v_extra_km  numeric;
  v_steps     numeric;
  v_global    numeric;
  v_fee       numeric := 0;
  v_cat_fee   numeric;
  v_total     numeric;
  v_order_id  uuid;
  v_num       text;
  v_discount  numeric := 0;
  v_row       record;
  v_int_mode  text;
begin
  if v_uid is null then raise exception 'Please log in first.'; end if;
  if p_cart_item_ids is null or coalesce(array_length(p_cart_item_ids, 1), 0) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if array_length(p_cart_item_ids, 1) > 50 then raise exception 'Too many items in one order.'; end if;

  -- crude abuse brake: lots of unpaid orders in the last hour
  if (select count(*) from public.orders
        where user_id = v_uid and coalesce(payment_status, 'pending') = 'pending'
          and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'You have many unpaid orders. Please pay or cancel them first.';
  end if;

  -- delivery details come from the customer's own profile, never from the request
  select to_jsonb(pr) into prof from public.profiles pr where pr.user_id = v_uid limit 1;
  if prof is null
     or coalesce(btrim(prof->>'delivery_address'), '') = ''
     or coalesce(btrim(prof->>'phone'), '') = '' then
    raise exception 'Please save your phone number and city/province before placing an order.';
  end if;

  -- delivery settings (single row, id = 1)
  select to_jsonb(d) into ds from public.delivery_settings d where d.id = 1;
  v_has_store := ds is not null and (ds->>'store_lat') is not null and (ds->>'store_lng') is not null;

  if v_has_pin and (p_pin_lat not between -90 and 90 or p_pin_lng not between -180 and 180) then
    raise exception 'Invalid delivery location.';
  end if;
  if not v_has_pin and v_has_store and public.yn_security_setting('require_delivery_pin', 'off') = 'on' then
    raise exception 'Please choose your delivery location on the map first.';
  end if;

  -- 1) Price every cart line from the catalogue ------------------------------------------------------
  select count(*) into v_found
    from public.cart_items c join public.carts k on k.id = c.cart_id
   where c.id = any (p_cart_item_ids) and k.user_id = v_uid;
  if v_found <> (select count(distinct x) from unnest(p_cart_item_ids) x) then
    raise exception 'Some items in your cart are no longer available. Please review your cart.';
  end if;

  for ci in
    select c.* from public.cart_items c join public.carts k on k.id = c.cart_id
     where c.id = any (p_cart_item_ids) and k.user_id = v_uid
     order by c.created_at, c.id
  loop
    select * into p from public.products where id = ci.product_id and status = 'published';
    if not found then raise exception 'A product in your cart is no longer available.'; end if;

    v_qty := coalesce(ci.quantity, 0);
    if v_qty < 1 or v_qty > 999 then raise exception 'Invalid quantity for %.', p.name; end if;

    -- same rule as the product page: the LAST selected option with a positive price_adjustment sets the price
    v_unit := coalesce(p.price, 0);
    for opt in select po.id, po.name from public.product_options po
                where po.product_id = p.id order by po.sort_order, po.id
    loop
      v_pick := ci.selected_options ->> opt.name;
      if v_pick is null or btrim(v_pick) = '' then
        raise exception 'Please select all options for %.', p.name;
      end if;
      select pv.price_adjustment into v_adj
        from public.product_option_values pv
       where pv.option_id = opt.id and pv.value = v_pick
       order by pv.sort_order, pv.id limit 1;
      if not found then
        raise exception 'An option you chose for % is no longer available.', p.name;
      end if;
      if coalesce(v_adj, 0) > 0 then v_unit := v_adj; end if;
    end loop;

    if v_unit < 0 then raise exception 'Invalid price for %.', p.name; end if;
    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'image', p.main_image_url,
      'qty', v_qty, 'unit', v_unit, 'options', ci.selected_options));
    -- a product without a category is tracked as the nil uuid (it pays the global fee, like in the app)
    v_cat_id := coalesce(p.category_id, '00000000-0000-0000-0000-000000000000'::uuid);
    if not (v_cat_id = any (v_cat_ids)) then v_cat_ids := v_cat_ids || v_cat_id; end if;
  end loop;

  -- 2) Delivery fee: calcFee() + categoryDeliveryFee() from the app ------------------------------------
  if ds is null then
    v_global := 0;   -- app: no settings row -> base fee 0
  elsif v_has_pin and v_has_store then
    v_km        := public.yn_haversine_km((ds->>'store_lat')::double precision, (ds->>'store_lng')::double precision, p_pin_lat, p_pin_lng);
    v_base_fee  := coalesce((ds->>'base_fee')::numeric, 1);
    v_base_km   := coalesce((ds->>'base_km')::numeric, 2);
    v_extra_fee := coalesce((ds->>'extra_fee')::numeric, 0.5);
    v_extra_km  := greatest(0.1, coalesce((ds->>'extra_km')::numeric, 1));
    v_steps     := greatest(0, ceil((v_km::numeric - v_base_km) / v_extra_km));
    v_global    := greatest(0, v_base_fee + v_steps * v_extra_fee);
  else
    v_global := greatest(0, coalesce((ds->>'base_fee')::numeric, 0));   -- app fallback when no map pin
  end if;

  foreach v_cat_id in array v_cat_ids loop
    select * into cat from public.categories where id = v_cat_id;
    if found and cat.delivery_fee_enabled is false then continue; end if;      -- free delivery for this category
    v_cat_fee := case when found and cat.delivery_fee is not null then cat.delivery_fee::numeric else v_global end;
    v_fee := greatest(v_fee, greatest(0, v_cat_fee));
  end loop;
  v_fee := round(v_fee, 2);
  v_total := round(v_subtotal + v_fee, 2);

  -- 3) Insert order (retry on the rare order_number collision) -----------------------------------------
  for i in 1..5 loop
    v_num := 'YN-' || lpad(((extract(epoch from clock_timestamp()) * 1000)::bigint % 100000000)::text, 8, '0');
    begin
      insert into public.orders(
        order_number, user_id, subtotal, fees, total, payment_method,
        delivery_lat, delivery_lng, delivery_address, delivery_phone, delivery_name, delivery_notes,
        tracking_enabled, payment_receipt_url, coupon_discount, coupon_code, coupon_id, status, payment_status)
      values (
        v_num, v_uid, v_subtotal, v_fee, v_total, 'Bakong KHQR',
        case when v_has_pin then p_pin_lat end, case when v_has_pin then p_pin_lng end,
        prof->>'delivery_address', prof->>'phone', nullif(prof->>'name', ''), nullif(coalesce(prof->>'delivery_notes', ''), ''),
        v_has_pin, null, 0, null, null, 'payment pending', 'pending')
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
      perform pg_sleep(0.003);
    end;
  end loop;

  insert into public.order_items(order_id, product_id, product_name, product_image, quantity, unit_price, selected_options, subtotal)
  select v_order_id, (l->>'product_id')::uuid, l->>'name', l->>'image', (l->>'qty')::integer,
         (l->>'unit')::numeric, l->'options', (l->>'unit')::numeric * (l->>'qty')::integer
    from jsonb_array_elements(v_lines) l;

  -- 4) Coupon (raises -> whole order rolls back, nothing half-created) ----------------------------------
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    v_discount := public.apply_coupon_to_order(v_order_id, btrim(p_coupon_code));
  end if;

  -- 5) Drift check against what the customer saw (report: log only; enforce: refuse) ----------------------
  select * into v_row from public.orders where id = v_order_id;
  if p_expected_total is not null and abs(coalesce(v_row.total, 0) - p_expected_total) > 0.011 then
    perform public.yn_security_log('order_integrity', 'medium', jsonb_build_object(
      'order_id', v_order_id, 'reason', 'client_total_differs', 'via', 'yn_place_order',
      'client_total', p_expected_total, 'server_total', v_row.total));
    v_int_mode := public.yn_security_setting('integrity_mode', 'report');
    if v_int_mode = 'enforce' then
      raise exception 'Prices have changed since you opened checkout. Please review your cart and try again.';
    end if;
  end if;

  -- 6) Remove the purchased cart lines (same transaction) ------------------------------------------------
  delete from public.cart_items where id = any (p_cart_item_ids);

  return jsonb_build_object('id', v_order_id, 'order_number', v_num, 'subtotal', v_subtotal,
                            'fees', v_fee, 'discount', v_discount, 'total', v_row.total);
end; $$;

revoke all on function public.yn_place_order(uuid[], double precision, double precision, text, numeric) from public, anon;
grant execute on function public.yn_place_order(uuid[], double precision, double precision, text, numeric) to authenticated;

-- ---------- Lock direct inserts (report first, enforce later) ----------
-- Runs as the CALLER. Inside yn_place_order() current_user is the function owner, so it is never blocked.
-- Admins (the "create order" screen) are exempt, as is the SQL editor / service role.
create or replace function public.yn_guard_order_insert()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin') then return new; end if;
  if public.yn_order_insert_mode() = 'enforce' then
    raise exception 'Orders must be placed from the checkout page. Please update the app and try again.' using errcode = '42501';
  end if;
  perform public.yn_security_log('tamper_attempt', 'medium',
    jsonb_build_object('table', tg_table_name, 'op', 'INSERT', 'columns', jsonb_build_array('direct_order_insert'), 'mode', 'report'));
  return new;
end; $$;

drop trigger if exists yn_guard_order_insert  on public.orders;
create trigger yn_guard_order_insert  before insert on public.orders      for each row execute function public.yn_guard_order_insert();
drop trigger if exists yn_guard_item_insert   on public.order_items;
create trigger yn_guard_item_insert   before insert on public.order_items for each row execute function public.yn_guard_order_insert();

-- =====================================================================================================
-- ROLLBACK (touches no data):
--   drop trigger if exists yn_guard_order_insert on public.orders;
--   drop trigger if exists yn_guard_item_insert  on public.order_items;
--   -- the old browser code keeps working because the new frontend falls back to direct inserts
--   -- whenever yn_place_order() is missing:  drop function public.yn_place_order(uuid[], double precision, double precision, text, numeric);
-- KNOWN LIMITS (be aware):
--   * The delivery PIN is still chosen by the browser. Someone can send a pin next to the store but give a far address.
--     Turn on `require_delivery_pin` ('on') to at least refuse orders with no pin when a store location is set.
--   * Enforce mode also blocks OLD installed mobile builds that still insert directly -> release the new app first.
--   * Wallet top-ups, debt payments and CV orders are separate flows; this file does not change them.
-- =====================================================================================================
