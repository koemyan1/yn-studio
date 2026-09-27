create extension if not exists pgcrypto;
create table profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique not null references auth.users(id) on delete cascade,name text,email text,role text not null default 'customer' check(role in('customer','admin')),avatar_url text,status text default 'active',created_at timestamptz default now());
create table categories(id uuid primary key default gen_random_uuid(),name text not null,image_url text,status text default 'active',created_at timestamptz default now());
create table products(id uuid primary key default gen_random_uuid(),name text not null,description text,category_id uuid references categories(id),price numeric(12,2) not null default 0,original_price numeric(12,2),currency text default 'USD',status text default 'draft' check(status in('draft','published','unpublished')),sku text,main_image_url text,created_at timestamptz default now(),updated_at timestamptz default now());
create table product_images(id uuid primary key default gen_random_uuid(),product_id uuid references products(id) on delete cascade,image_url text not null,sort_order int default 0,created_at timestamptz default now());
create table product_options(id uuid primary key default gen_random_uuid(),product_id uuid references products(id) on delete cascade,name text not null,sort_order int default 0);
create table product_option_values(id uuid primary key default gen_random_uuid(),option_id uuid references product_options(id) on delete cascade,value text not null,sort_order int default 0);
create table carts(id uuid primary key default gen_random_uuid(),user_id uuid unique not null references auth.users(id) on delete cascade,created_at timestamptz default now(),updated_at timestamptz default now());
create table cart_items(id uuid primary key default gen_random_uuid(),cart_id uuid references carts(id) on delete cascade,product_id uuid references products(id),quantity int not null default 1 check(quantity>0),selected_options jsonb default '{}'::jsonb,price numeric(12,2) not null);
create table orders(id uuid primary key default gen_random_uuid(),order_number text unique not null,user_id uuid not null references auth.users(id),subtotal numeric(12,2) not null,fees numeric(12,2) default 0,total numeric(12,2) not null,status text default 'pending',payment_status text default 'pending',created_at timestamptz default now(),updated_at timestamptz default now());
create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id) on delete cascade,product_id uuid references products(id),product_name text not null,product_image text,quantity int not null,unit_price numeric(12,2) not null,selected_options jsonb default '{}'::jsonb,subtotal numeric(12,2) not null);
create table wallets(id uuid primary key default gen_random_uuid(),user_id uuid unique not null references auth.users(id),balance numeric(12,2) not null default 0,pin_hash text,created_at timestamptz default now(),updated_at timestamptz default now());
create table wallet_transactions(id uuid primary key default gen_random_uuid(),wallet_id uuid not null references wallets(id),user_id uuid not null references auth.users(id),type text not null,amount numeric(12,2) not null,balance_before numeric(12,2) not null,balance_after numeric(12,2) not null,reference_type text,reference_id uuid,description text,created_at timestamptz default now());
create table deposit_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),amount numeric(12,2) not null check(amount>0),payment_method text,receipt_url text,status text default 'pending' check(status in('pending','approved','rejected')),reviewed_by uuid references auth.users(id),reviewed_at timestamptz,created_at timestamptz default now());
create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where user_id=auth.uid() and role='admin')$$;
alter table profiles enable row level security;alter table products enable row level security;alter table product_images enable row level security;alter table product_options enable row level security;alter table product_option_values enable row level security;alter table categories enable row level security;alter table carts enable row level security;alter table cart_items enable row level security;alter table orders enable row level security;alter table order_items enable row level security;alter table wallets enable row level security;alter table wallet_transactions enable row level security;alter table deposit_requests enable row level security;
create policy profiles_own on profiles for select using(user_id=auth.uid() or is_admin());create policy admin_profiles on profiles for all using(is_admin()) with check(is_admin());
create policy products_read on products for select using(status='published' or is_admin());create policy products_admin on products for all using(is_admin()) with check(is_admin());
create policy categories_read on categories for select using(status='active' or is_admin());create policy categories_admin on categories for all using(is_admin()) with check(is_admin());
create policy images_read on product_images for select using(exists(select 1 from products p where p.id=product_id and (p.status='published' or is_admin())));create policy images_admin on product_images for all using(is_admin()) with check(is_admin());
create policy options_read on product_options for select using(exists(select 1 from products p where p.id=product_id and (p.status='published' or is_admin())));create policy options_admin on product_options for all using(is_admin()) with check(is_admin());
create policy values_read on product_option_values for select using(exists(select 1 from product_options o join products p on p.id=o.product_id where o.id=option_id and (p.status='published' or is_admin())));create policy values_admin on product_option_values for all using(is_admin()) with check(is_admin());
create policy carts_own on carts for all using(user_id=auth.uid()) with check(user_id=auth.uid());create policy cart_items_own on cart_items for all using(exists(select 1 from carts c where c.id=cart_id and c.user_id=auth.uid())) with check(exists(select 1 from carts c where c.id=cart_id and c.user_id=auth.uid()));
create policy orders_own_read on orders for select using(user_id=auth.uid() or is_admin());create policy orders_own_insert on orders for insert with check(user_id=auth.uid());create policy orders_admin on orders for all using(is_admin()) with check(is_admin());
create policy order_items_read on order_items for select using(exists(select 1 from orders o where o.id=order_id and(o.user_id=auth.uid() or is_admin())));create policy order_items_insert on order_items for insert with check(exists(select 1 from orders o where o.id=order_id and o.user_id=auth.uid()));
create policy wallets_read on wallets for select using(user_id=auth.uid() or is_admin());create policy wallet_tx_read on wallet_transactions for select using(user_id=auth.uid() or is_admin());create policy deposits_own on deposit_requests for select using(user_id=auth.uid() or is_admin());create policy deposits_insert on deposit_requests for insert with check(user_id=auth.uid() and status='pending');create policy deposits_admin on deposit_requests for all using(is_admin()) with check(is_admin());
insert into storage.buckets(id,name,public) values('product-images','product-images',true),('deposit-receipts','deposit-receipts',false) on conflict(id) do nothing;
create policy product_storage_read on storage.objects for select using(bucket_id='product-images');create policy product_storage_admin on storage.objects for all using(bucket_id='product-images' and is_admin()) with check(bucket_id='product-images' and is_admin());

-- Customer receipt uploads; receipts remain private.
create policy deposit_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='deposit-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy deposit_receipt_own_read on storage.objects for select to authenticated using(bucket_id='deposit-receipts' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin()));

-- Atomic admin approval/rejection. Prevents duplicate wallet credits.
create or replace function review_deposit(p_deposit_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path=public as $$
declare d deposit_requests%rowtype; w wallets%rowtype; new_balance numeric(12,2);
begin
  if not is_admin() then raise exception 'Admin access required'; end if;
  select * into d from deposit_requests where id=p_deposit_id for update;
  if d.id is null then raise exception 'Deposit not found'; end if;
  if d.status <> 'pending' then raise exception 'Deposit already processed'; end if;
  if not p_approve then update deposit_requests set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=d.id; return; end if;
  insert into wallets(user_id,balance) values(d.user_id,0) on conflict(user_id) do nothing;
  select * into w from wallets where user_id=d.user_id for update;
  new_balance:=w.balance+d.amount;
  insert into wallet_transactions(wallet_id,user_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(w.id,d.user_id,'deposit',d.amount,w.balance,new_balance,'deposit_request',d.id,'Wallet deposit approved');
  update wallets set balance=new_balance,updated_at=now() where id=w.id;
  update deposit_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=d.id;
end $$;
