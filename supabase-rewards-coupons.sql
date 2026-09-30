-- YN Studio rewards, coupons and richer support chat.
-- Run after the existing marketplace/order-payment SQL.

alter table public.support_messages add column if not exists message_type text not null default 'text';
alter table public.support_messages add column if not exists attachment_url text;
alter table public.support_messages add column if not exists reward_id uuid;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent','fixed')),
  value numeric(12,2) not null check (value > 0),
  min_order numeric(12,2) not null default 0,
  max_discount numeric(12,2),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  used_count integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
drop policy if exists "coupons admin manage" on public.coupons;
create policy "coupons admin manage" on public.coupons for all using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "coupons active read" on public.coupons;
create policy "coupons active read" on public.coupons for select using (active=true and (expires_at is null or expires_at>now()));

create table if not exists public.coupon_assignments (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'available' check (status in ('available','claimed','used','expired')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  claimed_at timestamptz,
  used_at timestamptz,
  unique(coupon_id,user_id)
);
alter table public.coupon_assignments enable row level security;
drop policy if exists "coupon assignments own read" on public.coupon_assignments;
create policy "coupon assignments own read" on public.coupon_assignments for select using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "coupon assignments admin insert" on public.coupon_assignments;
create policy "coupon assignments admin insert" on public.coupon_assignments for insert with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "coupon assignments admin update" on public.coupon_assignments;
create policy "coupon assignments admin update" on public.coupon_assignments for update using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  code text not null,
  discount_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(coupon_id,order_id)
);
alter table public.coupon_redemptions enable row level security;
drop policy if exists "coupon redemptions own read" on public.coupon_redemptions;
create policy "coupon redemptions own read" on public.coupon_redemptions for select using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create table if not exists public.chat_rewards (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('refund','envelope','coupon')),
  amount numeric(12,2),
  coupon_id uuid references public.coupons(id) on delete set null,
  message text,
  status text not null default 'sent' check (status in ('sent','claimed','cancelled')),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
DO $$ BEGIN ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_reward_fk FOREIGN KEY (reward_id) REFERENCES public.chat_rewards(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
alter table public.chat_rewards enable row level security;
drop policy if exists "chat rewards own read" on public.chat_rewards;
create policy "chat rewards own read" on public.chat_rewards for select using (customer_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "chat rewards admin insert" on public.chat_rewards;
create policy "chat rewards admin insert" on public.chat_rewards for insert with check (admin_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "chat rewards admin update" on public.chat_rewards;
create policy "chat rewards admin update" on public.chat_rewards for update using (admin_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (admin_id=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

drop policy if exists "support messages own update" on public.support_messages;
create policy "support messages own update" on public.support_messages for update using (sender_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (sender_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

insert into storage.buckets (id,name,public) values ('support-chat','support-chat',true) on conflict (id) do update set public=true;
drop policy if exists "support chat public read" on storage.objects;
create policy "support chat public read" on storage.objects for select using (bucket_id='support-chat');
drop policy if exists "support chat authenticated upload" on storage.objects;
create policy "support chat authenticated upload" on storage.objects for insert with check (bucket_id='support-chat' and auth.uid() is not null);
drop policy if exists "support chat owner delete" on storage.objects;
create policy "support chat owner delete" on storage.objects for delete using (bucket_id='support-chat' and owner=auth.uid());

alter table public.orders add column if not exists coupon_id uuid references public.coupons(id) on delete set null;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_discount numeric(12,2) not null default 0;

create or replace function public.yn_coupon_discount(p_coupon_id uuid,p_subtotal numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare c public.coupons%rowtype; d numeric;
begin
  select * into c from public.coupons where id=p_coupon_id for update;
  if not found or not c.active then raise exception 'Coupon is not active'; end if;
  if c.starts_at is not null and c.starts_at>now() then raise exception 'Coupon is not active yet'; end if;
  if c.expires_at is not null and c.expires_at<=now() then raise exception 'Coupon has expired'; end if;
  if c.usage_limit is not null and c.used_count>=c.usage_limit then raise exception 'Coupon usage limit reached'; end if;
  if coalesce(p_subtotal,0)<c.min_order then raise exception 'Minimum order is %',c.min_order; end if;
  if c.type='percent' then d=coalesce(p_subtotal,0)*c.value/100; else d=c.value; end if;
  if c.max_discount is not null then d=least(d,c.max_discount); end if;
  return greatest(0,least(d,coalesce(p_subtotal,0)));
end $$;
grant execute on function public.yn_coupon_discount(uuid,numeric) to authenticated;

create or replace function public.validate_coupon(p_code text,p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.coupons%rowtype; d numeric;
begin
  select * into c from public.coupons where upper(code)=upper(trim(p_code)) limit 1;
  if not found then raise exception 'Coupon code not found'; end if;
  d=public.yn_coupon_discount(c.id,p_subtotal);
  return jsonb_build_object('id',c.id,'code',c.code,'type',c.type,'value',c.value,'discount',d,'min_order',c.min_order,'expires_at',c.expires_at);
end $$;
grant execute on function public.validate_coupon(text,numeric) to authenticated;

create or replace function public.apply_coupon_to_order(p_order_id uuid,p_code text)
returns numeric language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; c public.coupons%rowtype; d numeric;
begin
  select * into o from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  select * into c from public.coupons where upper(code)=upper(trim(p_code)) for update;
  if not found then raise exception 'Coupon code not found'; end if;
  d=public.yn_coupon_discount(c.id,o.subtotal);
  if exists(select 1 from public.coupon_redemptions where order_id=o.id) then raise exception 'Coupon already applied'; end if;
  insert into public.coupon_redemptions(coupon_id,user_id,order_id,code,discount_amount) values(c.id,auth.uid(),o.id,c.code,d);
  update public.coupons set used_count=used_count+1 where id=c.id;
  update public.orders set coupon_id=c.id,coupon_code=c.code,coupon_discount=d,total=greatest(0,subtotal+coalesce(fees,0)-d) where id=o.id;
  update public.coupon_assignments set status='used',used_at=now() where coupon_id=c.id and user_id=auth.uid() and status in ('available','claimed');
  return d;
end $$;
grant execute on function public.apply_coupon_to_order(uuid,text) to authenticated;

create or replace function public.claim_chat_reward(p_reward_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.chat_rewards%rowtype; v_wallet_id uuid; new_balance numeric; assignment_id uuid;
begin
  select * into r from public.chat_rewards where id=p_reward_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Reward not found'; end if;
  if r.status<>'sent' then raise exception 'Reward has already been claimed'; end if;
  if r.type in ('refund','envelope') then
    if coalesce(r.amount,0)<=0 then raise exception 'Invalid reward amount'; end if;
    insert into public.wallets(user_id,balance) values(auth.uid(),0) on conflict(user_id) do nothing;
    select id into v_wallet_id from public.wallets where user_id=auth.uid() limit 1;
    update public.wallets set balance=coalesce(balance,0)+r.amount where id=v_wallet_id returning balance into new_balance;
    begin
      insert into public.wallet_transactions(wallet_id,user_id,amount,type,description) values(v_wallet_id,auth.uid(),r.amount,'reward',case when r.type='refund' then 'Customer service refund' else 'Customer service envelope' end);
    exception when undefined_column then
      insert into public.wallet_transactions(wallet_id,amount,type,description) values(v_wallet_id,r.amount,'reward',case when r.type='refund' then 'Customer service refund' else 'Customer service envelope' end);
    end;
  elsif r.type='coupon' then
    if r.coupon_id is null then raise exception 'Coupon reward is missing a coupon'; end if;
    insert into public.coupon_assignments(coupon_id,user_id,status,assigned_by,claimed_at) values(r.coupon_id,auth.uid(),'claimed',r.admin_id,now())
      on conflict(coupon_id,user_id) do update set status='claimed',claimed_at=now()
      returning id into assignment_id;
    new_balance=null;
  end if;
  update public.chat_rewards set status='claimed',claimed_at=now() where id=r.id;
  return jsonb_build_object('type',r.type,'amount',r.amount,'balance',new_balance,'coupon_id',r.coupon_id);
end $$;
grant execute on function public.claim_chat_reward(uuid) to authenticated;

create or replace function public.assign_coupon_to_customer(p_coupon_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare a uuid;
begin
  if not exists(select 1 from public.profiles where user_id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
  insert into public.coupon_assignments(coupon_id,user_id,status,assigned_by) values(p_coupon_id,p_user_id,'available',auth.uid())
  on conflict(coupon_id,user_id) do update set status='available',assigned_by=auth.uid(),assigned_at=now()
  returning id into a;
  insert into public.notifications(user_id,target_role,title,message,type,link) values(p_user_id,'customer','You received a coupon','A new coupon was added to your rewards.','coupon','/rewards');
  return a;
end $$;
grant execute on function public.assign_coupon_to_customer(uuid,uuid) to authenticated;

-- Realtime for reward cards and assigned coupons.
DO $$ BEGIN BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rewards; EXCEPTION WHEN duplicate_object THEN NULL; END; END $$;
DO $$ BEGIN BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coupon_assignments; EXCEPTION WHEN duplicate_object THEN NULL; END; END $$;
