-- YN Studio order barcode + custom status system
-- Run this once in the Supabase SQL Editor.

create table if not exists public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  color text not null default '#7c3aed',
  sort_order integer not null default 0,
  active boolean not null default true,
  marks_paid boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_statuses enable row level security;

drop policy if exists "order statuses active read" on public.order_statuses;
create policy "order statuses active read" on public.order_statuses
for select using (
  active = true
  or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

drop policy if exists "admins manage order statuses" on public.order_statuses;
create policy "admins manage order statuses" on public.order_statuses
for all using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
) with check (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')
);

insert into public.order_statuses(name,label,color,sort_order,active,marks_paid) values
('pending','Pending','#a66a00',10,true,false),
('payment pending','Payment pending','#a66a00',20,true,false),
('paid','Paid','#16834e',30,true,true),
('processing','Processing','#7c3aed',40,true,true),
('shipped','Shipped','#2563eb',50,true,true),
('completed','Completed','#16834e',60,true,true),
('cancelled','Cancelled','#bd3552',70,true,false)
on conflict (name) do update set
  label=excluded.label,
  color=excluded.color,
  sort_order=excluded.sort_order,
  marks_paid=excluded.marks_paid;
