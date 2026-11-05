-- YN Studio: up to 3 photos per review + the "Customer photos" strip on the product page.
-- Run once in Supabase -> SQL Editor. Safe to run again. Needs supabase-product-reviews.sql first.
--
--   * photo_url (already there) stays the FIRST photo. extra_photo_urls holds up to 2 more.
--   * submit_product_review() is NOT changed. A second small function, set_review_extra_photos(), adds the extra photos
--     to the caller's OWN review and accepts only pictures inside their own folder of the review-photos bucket.
--   * The public review-photos bucket now has a size limit and an image-only type list.

alter table public.product_reviews add column if not exists extra_photo_urls text[] not null default '{}';
do $$ begin
  alter table public.product_reviews add constraint product_reviews_extra_photos_max check (cardinality(extra_photo_urls) <= 2);
exception when duplicate_object then null; end $$;

create or replace function public.set_review_extra_photos(p_product_id uuid, p_urls text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text;
  v_clean text[] := '{}';
  v_u text;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  v_prefix := '/storage/v1/object/public/review-photos/' || v_uid::text || '/';
  foreach v_u in array coalesce(p_urls, '{}') loop
    v_u := nullif(btrim(v_u), '');
    if v_u is null then continue; end if;
    if char_length(v_u) > 500 or strpos(v_u, v_prefix) = 0 then raise exception 'That photo is not allowed.'; end if;
    if not (v_u = any (v_clean)) then v_clean := v_clean || v_u; end if;
  end loop;
  if cardinality(v_clean) > 2 then raise exception 'You can add up to 3 photos.'; end if;
  -- only the caller's own review; status is never touched (a hidden review stays hidden)
  update public.product_reviews
     set extra_photo_urls = v_clean, updated_at = now()
   where product_id = p_product_id and user_id = v_uid;
end;
$$;
revoke all on function public.set_review_extra_photos(uuid, text[]) from public, anon;
grant execute on function public.set_review_extra_photos(uuid, text[]) to authenticated;

-- the public bucket: images only, 8 MB each (the app shrinks photos to about 1 MB before uploading)
update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
 where id = 'review-photos';
