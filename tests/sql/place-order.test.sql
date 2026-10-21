-- =====================================================================================================
-- Self-checking test for yn_place_order()  (supabase-server-side-order.sql)
-- Run in Supabase -> SQL Editor on a TEST project (or a copy). Everything is rolled back at the end.
-- Prints "PASS ..." notices; any failure raises an exception and stops. Adjust the fixture INSERT column
-- lists if your products/categories tables have other NOT NULL columns.
-- =====================================================================================================
begin;

do $$
declare
  u uuid; cat_id uuid; prod uuid; cart uuid; ci uuid; r jsonb; n int; other_ci uuid;
begin
  -- use a real customer that already has delivery details; if none, give the first customer some
  select user_id into u from public.profiles where coalesce(role,'customer') = 'customer' order by created_at limit 1;
  if u is null then raise exception 'No customer profile found - sign up one test customer first.'; end if;
  update public.profiles set delivery_address = coalesce(nullif(delivery_address,''),'Test Street, Phnom Penh'),
                             phone = coalesce(nullif(phone,''),'012345678') where user_id = u;

  -- act as that user (auth.uid() reads these settings)
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  -- fixtures: one category with its own fee, one published product at $10, one unpublished product
  insert into public.categories(name, status, delivery_fee_enabled, delivery_fee) values ('__test_cat', 'active', true, 2.50) returning id into cat_id;
  insert into public.products(name, price, status, category_id) values ('__test_prod', 10, 'published', cat_id) returning id into prod;
  select id into cart from public.carts where user_id = u order by created_at limit 1;
  if cart is null then insert into public.carts(user_id) values (u) returning id into cart; end if;
  insert into public.cart_items(cart_id, product_id, quantity, selected_options, price) values (cart, prod, 2, '{}'::jsonb, 0.01) returning id into ci;
  -- note price = 0.01: the cart's own (browser-written) price must be IGNORED

  -- 1) happy path, no pin -> app fallback: category fee wins over global fee
  r := public.yn_place_order(array[ci]);
  assert (r->>'subtotal')::numeric = 20,   'subtotal must be 2 x 10 = 20, got ' || (r->>'subtotal');
  assert (r->>'fees')::numeric     = 2.50, 'fee must be the category fee 2.50, got ' || (r->>'fees');
  assert (r->>'total')::numeric    = 22.50,'total must be 22.50, got ' || (r->>'total');
  select count(*) into n from public.order_items where order_id = (r->>'id')::uuid and unit_price = 10 and quantity = 2;
  assert n = 1, 'order item must be priced from the catalogue (unit 10), not the cart (0.01)';
  select count(*) into n from public.cart_items where id = ci;
  assert n = 0, 'purchased cart line must be removed';
  raise notice 'PASS 1: server ignores the cart price, uses catalogue price + category fee';

  -- 2) free-delivery category -> fee 0
  update public.categories set delivery_fee_enabled = false where id = cat_id;
  insert into public.cart_items(cart_id, product_id, quantity, selected_options, price) values (cart, prod, 1, '{}'::jsonb, 10) returning id into ci;
  r := public.yn_place_order(array[ci]);
  assert (r->>'fees')::numeric = 0 and (r->>'total')::numeric = 10, 'free category must give fee 0';
  raise notice 'PASS 2: delivery_fee_enabled = false gives free delivery';

  -- 3) unpublished product is refused
  update public.products set status = 'unpublished' where id = prod;
  insert into public.cart_items(cart_id, product_id, quantity, selected_options, price) values (cart, prod, 1, '{}'::jsonb, 10) returning id into ci;
  begin perform public.yn_place_order(array[ci]); raise exception 'SHOULD HAVE FAILED';
  exception when others then assert sqlerrm like '%no longer available%', 'unexpected error: ' || sqlerrm; end;
  raise notice 'PASS 3: unpublished product refused';

  -- 4) someone else's cart line is refused
  select ci2.id into other_ci from public.cart_items ci2 join public.carts k on k.id = ci2.cart_id where k.user_id <> u limit 1;
  if other_ci is not null then
    begin perform public.yn_place_order(array[other_ci]); raise exception 'SHOULD HAVE FAILED';
    exception when others then assert sqlerrm like '%no longer available%' or sqlerrm like '%review your cart%', 'unexpected error: ' || sqlerrm; end;
    raise notice 'PASS 4: another customer''s cart item refused';
  else raise notice 'SKIP 4: no other customer has cart items to test with'; end if;

  -- 5) empty / missing arrays
  begin perform public.yn_place_order(array[]::uuid[]); raise exception 'SHOULD HAVE FAILED';
  exception when others then assert sqlerrm like '%empty%', 'unexpected error: ' || sqlerrm; end;
  raise notice 'PASS 5: empty cart refused';

  -- 6) bad pin
  begin perform public.yn_place_order(array[ci], 200, 0); raise exception 'SHOULD HAVE FAILED';
  exception when others then assert sqlerrm like '%Invalid delivery location%' or sqlerrm like '%no longer available%', 'unexpected error: ' || sqlerrm; end;
  raise notice 'PASS 6: out-of-range pin refused';
end $$;

-- Manual follow-ups (cannot be automated without real login tokens):
--  * With order_insert_mode = 'enforce', a customer calling supabase.from('orders').insert(...) must get error 42501.
--  * Place one real wallet order and one KHQR order in the app and compare total on screen vs. orders.total.
rollback;
