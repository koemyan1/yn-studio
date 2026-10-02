-- YN Studio: customer deletion, product-image cleanup and realtime admin alerts.
-- Run once in Supabase SQL Editor after the existing YN Studio SQL.

-- Allow the admin notification popup to receive INSERT events immediately.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Admin-only RPC for permanently deleting a customer account.
-- Deleting auth.users cascades through normal customer-owned rows that use ON DELETE CASCADE.
create or replace function public.admin_delete_customer(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Only administrators can delete customers';
  end if;

  if p_user_id is null then
    raise exception 'Customer id is required';
  end if;

  if exists (
    select 1
    from public.profiles
    where user_id = p_user_id
      and role = 'admin'
  ) then
    raise exception 'Admin accounts cannot be deleted here';
  end if;

  if not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'Customer account not found';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_customer(uuid) from public;
grant execute on function public.admin_delete_customer(uuid) to authenticated;

-- Make product-image storage manageable by administrators.
insert into storage.buckets (id,name,public)
values ('product-images','product-images',true)
on conflict (id) do update set public=true;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read"
on storage.objects for select
using (bucket_id='product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images"
on storage.objects for insert
with check (
  bucket_id='product-images'
  and exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.role='admin'
  )
);

drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images"
on storage.objects for delete
using (
  bucket_id='product-images'
  and exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.role='admin'
  )
);

-- Let admins remove individual product-image rows.
alter table public.product_images enable row level security;

drop policy if exists "admins manage product images" on public.product_images;
create policy "admins manage product images"
on public.product_images for all
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.role='admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid() and p.role='admin'
  )
);
