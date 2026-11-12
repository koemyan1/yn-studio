-- GUEST BROWSING: lets visitors who are NOT signed in see the marketplace (published products, categories, photos, options).
-- Buying still needs an account: carts, orders, wallet and profiles are NOT touched here.
-- Safe to run more than once. Run it after your baseline schema (products, categories, product_images, product_options,
-- product_option_values must already exist). If your project already lets anon read these tables, running it changes nothing.

grant select on public.products, public.categories, public.product_images, public.product_options, public.product_option_values to anon;

drop policy if exists "guest read published products" on public.products;
create policy "guest read published products" on public.products for select to anon using (status = 'published');

drop policy if exists "guest read categories" on public.categories;
create policy "guest read categories" on public.categories for select to anon using (true);

drop policy if exists "guest read product images" on public.product_images;
create policy "guest read product images" on public.product_images for select to anon
  using (exists (select 1 from public.products p where p.id = product_images.product_id and p.status = 'published'));

drop policy if exists "guest read product options" on public.product_options;
create policy "guest read product options" on public.product_options for select to anon
  using (exists (select 1 from public.products p where p.id = product_options.product_id and p.status = 'published'));

drop policy if exists "guest read product option values" on public.product_option_values;
create policy "guest read product option values" on public.product_option_values for select to anon
  using (exists (select 1 from public.product_options o join public.products p on p.id = o.product_id
                 where o.id = product_option_values.option_id and p.status = 'published'));
