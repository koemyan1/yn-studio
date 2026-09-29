-- YN Studio marketplace upgrade: run once in Supabase SQL Editor.
alter table public.product_option_values add column if not exists price_adjustment numeric(12,2) not null default 0;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.banners enable row level security;
drop policy if exists "banners public read" on public.banners;
create policy "banners public read" on public.banners for select using (true);
drop policy if exists "admins manage banners" on public.banners;
create policy "admins manage banners" on public.banners for all using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
) with check (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

insert into storage.buckets (id,name,public) values ('banner-images','banner-images',true)
on conflict (id) do update set public=true;
drop policy if exists "banner images public read" on storage.objects;
create policy "banner images public read" on storage.objects for select using (bucket_id='banner-images');
drop policy if exists "admins upload banner images" on storage.objects;
create policy "admins upload banner images" on storage.objects for insert with check (
 bucket_id='banner-images' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);
drop policy if exists "admins delete banner images" on storage.objects;
create policy "admins delete banner images" on storage.objects for delete using (
 bucket_id='banner-images' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

-- YN Studio customer experience: wishlist, notifications, support
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);
alter table public.wishlists enable row level security;
drop policy if exists "wishlist own read" on public.wishlists;
create policy "wishlist own read" on public.wishlists for select using (user_id=auth.uid());
drop policy if exists "wishlist own insert" on public.wishlists;
create policy "wishlist own insert" on public.wishlists for insert with check (user_id=auth.uid());
drop policy if exists "wishlist own delete" on public.wishlists;
create policy "wishlist own delete" on public.wishlists for delete using (user_id=auth.uid());
drop policy if exists "admins manage wishlist" on public.wishlists;
create policy "admins manage wishlist" on public.wishlists for all using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  target_role text not null default 'customer',
  title text not null,
  message text,
  type text not null default 'info',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications for select using ((target_role='customer' and user_id=auth.uid()) or (target_role='admin' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')));
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications for update using ((target_role='customer' and user_id=auth.uid()) or (target_role='admin' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'))) with check ((target_role='customer' and user_id=auth.uid()) or (target_role='admin' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')));
drop policy if exists "admins insert notifications" on public.notifications;
create policy "admins insert notifications" on public.notifications for insert with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open',
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists "support own read" on public.support_tickets;
create policy "support own read" on public.support_tickets for select using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "support own insert" on public.support_tickets;
create policy "support own insert" on public.support_tickets for insert with check (user_id=auth.uid());
drop policy if exists "support own update" on public.support_tickets;
drop policy if exists "admins update support" on public.support_tickets;
create policy "admins update support" on public.support_tickets for update using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));


create or replace function public.yn_notify_order() returns trigger language plpgsql security definer as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(new.user_id,'customer','Order received','Your order #'||coalesce(new.order_number,new.id::text)||' has been received.','order','/orders');
    insert into public.notifications(user_id,target_role,title,message,type,link) values(null,'admin','New order','A new order #'||coalesce(new.order_number,new.id::text)||' needs review.','order','/admin/orders');
  elsif tg_op='UPDATE' and coalesce(new.status,'') is distinct from coalesce(old.status,'') then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(new.user_id,'customer','Order updated','Order #'||coalesce(new.order_number,new.id::text)||' is now '||coalesce(new.status,'updated')||'.','order','/orders');
  end if;
  return new;
end $$;
drop trigger if exists yn_notify_order on public.orders;
create trigger yn_notify_order after insert or update on public.orders for each row execute function public.yn_notify_order();

create or replace function public.yn_notify_deposit() returns trigger language plpgsql security definer as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(null,'admin','Wallet top-up request','A customer submitted a wallet top-up request.','wallet','/admin/wallet');
  elsif tg_op='UPDATE' and coalesce(new.status,'') is distinct from coalesce(old.status,'') then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(new.user_id,'customer','Wallet top-up updated','Your wallet top-up request is now '||coalesce(new.status,'updated')||'.','wallet','/wallet');
  end if;
  return new;
end $$;
drop trigger if exists yn_notify_deposit on public.deposit_requests;
create trigger yn_notify_deposit after insert or update on public.deposit_requests for each row execute function public.yn_notify_deposit();

create or replace function public.yn_notify_support() returns trigger language plpgsql security definer as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(null,'admin','New customer support ticket',new.subject,'support','/admin/support');
  elsif tg_op='UPDATE' and coalesce(new.admin_reply,'') is distinct from coalesce(old.admin_reply,'') then
    insert into public.notifications(user_id,target_role,title,message,type,link) values(new.user_id,'customer','Customer service replied',coalesce(new.admin_reply,'Your support ticket was updated.'),'support','/support');
  end if;
  return new;
end $$;
drop trigger if exists yn_notify_support on public.support_tickets;
create trigger yn_notify_support after insert or update on public.support_tickets for each row execute function public.yn_notify_support();

create or replace function public.yn_notify_wallet_transaction() returns trigger language plpgsql security definer as $$
begin
  insert into public.notifications(user_id,target_role,title,message,type,link) values(new.user_id,'customer','Wallet updated',coalesce(new.description,new.type)||' · '||to_char(new.amount,'FM999999990.00'),'wallet','/wallet');
  return new;
end $$;
drop trigger if exists yn_notify_wallet_transaction on public.wallet_transactions;
create trigger yn_notify_wallet_transaction after insert on public.wallet_transactions for each row execute function public.yn_notify_wallet_transaction();
