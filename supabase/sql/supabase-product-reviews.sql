-- YN Studio: product reviews + star ratings.
-- Run once in Supabase -> SQL Editor. Safe to run again.
-- Needs the baseline tables: products, orders, order_items, profiles (and optionally notifications).
--
-- How it works
--   * Only customers who BOUGHT the product can review it (checked in the database, not in the browser).
--     "Bought" = one of their orders contains the product, the order is not cancelled/rejected, and it is paid
--     (payment_status = 'paid') or already in a paid status (paid / processing / shipped / completed).
--     To change that rule edit yn_has_bought_product() below and run this file again.
--   * One review per customer per product. Writing it again edits the review.
--   * Customers can NOT insert/update the table directly; they call submit_product_review(). That is what stops
--     fake reviews, 6-star ratings and "un-hiding" a review the admin hid.
--   * The admin can hide / show / delete any review (Admin > Reviews).
--   * Review photos go to the public bucket "review-photos", one folder per customer.

-- 1) Table -----------------------------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null default 'Customer',        -- shown publicly: first name + last initial
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  photo_url text,
  status text not null default 'published',               -- published | hidden
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists product_reviews_product_idx on public.product_reviews(product_id, created_at desc);
create index if not exists product_reviews_user_idx on public.product_reviews(user_id);
create index if not exists product_reviews_status_idx on public.product_reviews(status, created_at desc);

alter table public.product_reviews enable row level security;

-- Everyone can read published reviews; a customer also sees their own (even if hidden); the admin sees all.
drop policy if exists "product reviews read" on public.product_reviews;
create policy "product reviews read" on public.product_reviews for select
  using (
    status = 'published'
    or user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- No insert / update policy for customers on purpose (see submit_product_review below).
drop policy if exists "product reviews admin update" on public.product_reviews;
create policy "product reviews admin update" on public.product_reviews for update
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

drop policy if exists "product reviews delete own or admin" on public.product_reviews;
create policy "product reviews delete own or admin" on public.product_reviews for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- 2) "Did this customer buy it?" ---------------------------------------------------------------------------
create or replace function public.yn_has_bought_product(p_user uuid, p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.user_id = p_user
      and i.product_id = p_product
      and coalesce(o.status, '') not in ('cancelled', 'rejected', 'refunded')
      and (coalesce(o.payment_status, '') = 'paid'
           or coalesce(o.status, '') in ('paid', 'processing', 'shipped', 'completed'))
  );
$$;
revoke all on function public.yn_has_bought_product(uuid, uuid) from public, anon, authenticated;

-- What the app calls to decide whether to show the "Write a review" button.
create or replace function public.can_review_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.yn_has_bought_product(auth.uid(), p_product_id);
$$;
revoke all on function public.can_review_product(uuid) from public, anon;
grant execute on function public.can_review_product(uuid) to authenticated;

-- 3) Write a review (create or edit) -----------------------------------------------------------------------
create or replace function public.submit_product_review(
  p_product_id uuid,
  p_rating integer,
  p_comment text default null,
  p_photo_url text default null
)
returns public.product_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_first text;
  v_last text;
  v_display text;
  v_comment text;
  v_photo text;
  v_row public.product_reviews;
  v_product_name text;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5 stars.'; end if;
  if not public.yn_has_bought_product(v_uid, p_product_id) then
    raise exception 'Only customers who bought this product can review it.';
  end if;

  v_comment := nullif(left(btrim(coalesce(p_comment, '')), 1000), '');

  -- only pictures uploaded by this customer to our own bucket are accepted
  v_photo := nullif(btrim(coalesce(p_photo_url, '')), '');
  if v_photo is not null and strpos(v_photo, '/storage/v1/object/public/review-photos/' || v_uid::text || '/') = 0 then
    raise exception 'That photo is not allowed.';
  end if;

  -- public name: "Sophea K."
  select nullif(btrim(name), '') into v_name from public.profiles where user_id = v_uid;
  v_name := coalesce(v_name, 'Customer');
  v_first := split_part(v_name, ' ', 1);
  v_last := nullif(split_part(v_name, ' ', 2), '');
  v_display := left(v_first, 24) || case when v_last is not null then ' ' || upper(left(v_last, 1)) || '.' else '' end;

  insert into public.product_reviews as r (product_id, user_id, reviewer_name, rating, comment, photo_url)
  values (p_product_id, v_uid, v_display, p_rating, v_comment, v_photo)
  on conflict (product_id, user_id) do update
    set rating = excluded.rating,
        comment = excluded.comment,
        photo_url = excluded.photo_url,
        reviewer_name = excluded.reviewer_name,
        updated_at = now()                      -- status is kept: a review the admin hid stays hidden
  returning * into v_row;

  -- tell the admin (never blocks the review if the notifications table differs)
  begin
    select name into v_product_name from public.products where id = p_product_id;
    insert into public.notifications(user_id, target_role, title, message, type, link)
    values (null, 'admin', 'New product review',
            v_display || ' gave ' || coalesce(v_product_name, 'a product') || ' ' || p_rating || ' star' || case when p_rating = 1 then '' else 's' end || '.',
            'review', '/admin/reviews');
  exception when others then null;
  end;

  return v_row;
end;
$$;
revoke all on function public.submit_product_review(uuid, integer, text, text) from public, anon;
grant execute on function public.submit_product_review(uuid, integer, text, text) to authenticated;

-- 4) Star totals per product (published reviews only; contains no personal data) --------------------------
create or replace view public.product_rating_stats as
select
  product_id,
  count(*)::int as review_count,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(*) filter (where rating = 5)::int as r5,
  count(*) filter (where rating = 4)::int as r4,
  count(*) filter (where rating = 3)::int as r3,
  count(*) filter (where rating = 2)::int as r2,
  count(*) filter (where rating = 1)::int as r1
from public.product_reviews
where status = 'published'
group by product_id;
grant select on public.product_rating_stats to anon, authenticated;

-- 5) Photo bucket -------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('review-photos', 'review-photos', true)
  on conflict (id) do update set public = true;

drop policy if exists "review photos public read" on storage.objects;
create policy "review photos public read" on storage.objects for select
  using (bucket_id = 'review-photos');

-- a customer may only write inside their own folder:  review-photos/<their user id>/...
drop policy if exists "review photos own upload" on storage.objects;
create policy "review photos own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "review photos own delete" on storage.objects;
create policy "review photos own delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  );
