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

-- YN Studio live customer messaging
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','admin')),
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
drop policy if exists "support messages own read" on public.support_messages;
create policy "support messages own read" on public.support_messages for select using (
  exists(select 1 from public.support_tickets t where t.id=support_messages.ticket_id and (t.user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')))
);
drop policy if exists "support messages customer insert" on public.support_messages;
create policy "support messages customer insert" on public.support_messages for insert with check (
  sender_id=auth.uid() and sender_role='customer' and exists(select 1 from public.support_tickets t where t.id=support_messages.ticket_id and t.user_id=auth.uid())
);
drop policy if exists "support messages admin insert" on public.support_messages;
create policy "support messages admin insert" on public.support_messages for insert with check (
  sender_id=auth.uid() and sender_role='admin' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

-- Realtime chat updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Keep the support ticket row in sync with the live chat and create in-app notifications.
create or replace function public.yn_notify_support_message() returns trigger language plpgsql security definer set search_path=public as $$
declare
  subject_text text;
begin
  select subject into subject_text from public.support_tickets where id=new.ticket_id;
  update public.support_tickets
    set updated_at=now(),
        status=case when new.sender_role='admin' then 'replied' else 'open' end,
        admin_reply=case when new.sender_role='admin' then new.message else admin_reply end
    where id=new.ticket_id;

  if new.sender_role='customer' then
    insert into public.notifications(user_id,target_role,title,message,type,link)
      values(null,'admin','New customer message',coalesce(subject_text,'Customer chat')||' · '||left(new.message,180),'support','/admin/support');
  else
    insert into public.notifications(user_id,target_role,title,message,type,link)
      select t.user_id,'customer','New message from YN Studio',left(new.message,180),'support','/support'
      from public.support_tickets t where t.id=new.ticket_id;
  end if;
  return new;
end $$;
drop trigger if exists yn_notify_support_message on public.support_messages;
create trigger yn_notify_support_message after insert on public.support_messages for each row execute function public.yn_notify_support_message();

-- Notify the admin when a customer account is created. The Telegram integration
-- listens to admin notifications, so this also works for Google sign-in profiles.
create or replace function public.yn_notify_customer_account() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.role,'customer')='customer' then
    insert into public.notifications(user_id,target_role,title,message,type,link)
      values(null,'admin','New customer account',coalesce(new.name,'Customer')||coalesce(' · '||new.email,''),'account','/admin/customers');
  end if;
  return new;
end $$;
drop trigger if exists yn_notify_customer_account on public.profiles;
create trigger yn_notify_customer_account after insert on public.profiles for each row execute function public.yn_notify_customer_account();

-- Telegram setup notes:
-- 1) Deploy supabase/functions/telegram-alert from this project.
-- 2) Add Edge Function secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, YN_TELEGRAM_WEBHOOK_SECRET.
-- 3) In Supabase Dashboard > Database > Webhooks, create an INSERT webhook for
--    public.notifications pointing to the telegram-alert Edge Function.
-- 4) Add header: x-yn-webhook-secret = the same YN_TELEGRAM_WEBHOOK_SECRET value.

-- The live chat now owns support notifications. Keep the legacy ticket trigger
-- from generating a duplicate alert when a new chat thread is created.
create or replace function public.yn_notify_support() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and coalesce(new.admin_reply,'') is distinct from coalesce(old.admin_reply,'') then
    insert into public.notifications(user_id,target_role,title,message,type,link)
      values(new.user_id,'customer','Customer service replied',coalesce(new.admin_reply,'Your support ticket was updated.'),'support','/support');
  end if;
  return new;
end $$;
