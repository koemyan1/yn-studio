-- YN Studio Themes + delivery locations + category tracking
alter table public.categories add column if not exists delivery_tracking_enabled boolean not null default false;
alter table public.profiles add column if not exists delivery_lat numeric;
alter table public.profiles add column if not exists delivery_lng numeric;
alter table public.profiles add column if not exists delivery_address text;
alter table public.profiles add column if not exists delivery_notes text;
alter table public.profiles add column if not exists phone text;
alter table public.orders add column if not exists delivery_lat numeric;
alter table public.orders add column if not exists delivery_lng numeric;
alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists delivery_name text;
alter table public.orders add column if not exists delivery_phone text;
alter table public.orders add column if not exists delivery_notes text;
alter table public.orders add column if not exists tracking_enabled boolean not null default false;
alter table public.orders add column if not exists rider_lat numeric;
alter table public.orders add column if not exists rider_lng numeric;
alter table public.orders add column if not exists tracking_updated_at timestamptz;

create table if not exists public.themes (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 secret_code text not null unique,
 active boolean not null default true,
 config jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.themes enable row level security;
drop policy if exists "themes admin manage" on public.themes;
create policy "themes admin manage" on public.themes for all using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "themes active read" on public.themes;
create policy "themes active read" on public.themes for select using (active=true);

create table if not exists public.theme_activations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 theme_id uuid not null references public.themes(id) on delete cascade,
 activated_at timestamptz not null default now(),
 unique(user_id, theme_id)
);
alter table public.theme_activations enable row level security;
drop policy if exists "theme activations own read" on public.theme_activations;
create policy "theme activations own read" on public.theme_activations for select using (user_id=auth.uid());
drop policy if exists "theme activations own insert" on public.theme_activations;
create policy "theme activations own insert" on public.theme_activations for insert with check (user_id=auth.uid());
drop policy if exists "theme activations admin" on public.theme_activations;
create policy "theme activations admin" on public.theme_activations for all using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create or replace function public.activate_theme(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t themes%rowtype;
begin
 select * into t from public.themes where upper(secret_code)=upper(trim(p_code)) and active=true limit 1;
 if not found then raise exception 'Invalid or inactive theme code'; end if;
 insert into public.theme_activations(user_id,theme_id) values(auth.uid(),t.id) on conflict(user_id,theme_id) do nothing;
 return jsonb_build_object('id',t.id,'name',t.name,'config',t.config);
end $$;
grant execute on function public.activate_theme(text) to authenticated;

create or replace function public.my_active_themes()
returns setof public.themes language sql security definer set search_path=public as $$
 select t.* from public.themes t join public.theme_activations a on a.theme_id=t.id where a.user_id=auth.uid() and t.active=true order by a.activated_at desc;
$$;
grant execute on function public.my_active_themes() to authenticated;

-- Customers may update only their own delivery location; admins may update rider coordinates.
drop policy if exists "profiles own delivery update" on public.profiles;
create policy "profiles own delivery update" on public.profiles for update using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

-- Order location/tracking access follows the existing order ownership/admin model.
drop policy if exists "orders customer update delivery" on public.orders;
create policy "orders customer update delivery" on public.orders for update using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (user_id=auth.uid() or exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

insert into storage.buckets (id,name,public) values ('theme-assets','theme-assets',true) on conflict (id) do update set public=true;
drop policy if exists "theme assets public read" on storage.objects;
create policy "theme assets public read" on storage.objects for select using (bucket_id='theme-assets');
drop policy if exists "admins upload theme assets" on storage.objects;
create policy "admins upload theme assets" on storage.objects for insert with check (bucket_id='theme-assets' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "admins delete theme assets" on storage.objects;
create policy "admins delete theme assets" on storage.objects for delete using (bucket_id='theme-assets' and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

-- Security hardening: theme secrets are never directly readable by customers; activation is only through the RPC.
drop policy if exists "themes active read" on public.themes;
drop policy if exists "theme activations own insert" on public.theme_activations;
drop policy if exists "orders customer update delivery" on public.orders;

create or replace function public.public_theme_category_ids()
returns uuid[] language sql security definer set search_path=public as $$
 select coalesce(array_agg(distinct (value::text)::uuid), '{}')
 from public.themes t, jsonb_array_elements_text(coalesce(t.config->'category_ids','[]'::jsonb)) v
 where t.active=true;
$$;
grant execute on function public.public_theme_category_ids() to anon, authenticated;
alter table public.orders
  add column if not exists tracking_active boolean not null default false,
  add column if not exists tracking_token text,
  add column if not exists tracking_started_at timestamptz;

create index if not exists orders_tracking_token_idx on public.orders(tracking_token) where tracking_token is not null;
