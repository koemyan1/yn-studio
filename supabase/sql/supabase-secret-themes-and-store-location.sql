-- YN Studio secret themes, category visibility, and store map link
create table if not exists public.site_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  secret_code text not null unique,
  active boolean not null default true,
  config jsonb not null default '{"background":"#160d27","surface":"#24153b","text":"#fff7ff","accent":"#c084fc","radius":18,"font":"Inter, system-ui, sans-serif","elements":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists site_themes_secret_code_lower_idx on public.site_themes (lower(secret_code));
create table if not exists public.category_theme_visibility (
  category_id uuid not null references public.categories(id) on delete cascade,
  theme_id uuid not null references public.site_themes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(category_id,theme_id)
);
alter table public.delivery_settings add column if not exists store_map_url text;
alter table public.site_themes enable row level security;
alter table public.category_theme_visibility enable row level security;
drop policy if exists "Active secret themes are readable" on public.site_themes;
create policy "Active secret themes are readable" on public.site_themes for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage secret themes" on public.site_themes;
create policy "Admins manage secret themes" on public.site_themes for all to authenticated using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
drop policy if exists "Read category theme visibility" on public.category_theme_visibility;
create policy "Read category theme visibility" on public.category_theme_visibility for select to anon, authenticated using (true);
drop policy if exists "Admins manage category theme visibility" on public.category_theme_visibility;
create policy "Admins manage category theme visibility" on public.category_theme_visibility for all to authenticated using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));

create table if not exists public.customer_theme_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_id uuid not null references public.site_themes(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.customer_theme_preferences enable row level security;
drop policy if exists "Customers manage their own theme preference" on public.customer_theme_preferences;
create policy "Customers manage their own theme preference" on public.customer_theme_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep secret codes private: customers activate through these RPCs instead of selecting theme rows.
drop policy if exists "Active secret themes are readable" on public.site_themes;
create or replace function public.activate_secret_theme(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_theme public.site_themes%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into v_theme from public.site_themes
    where active = true and lower(secret_code) = lower(trim(p_code))
    limit 1;
  if v_theme.id is null then return null; end if;
  insert into public.customer_theme_preferences(user_id,theme_id,updated_at)
    values(auth.uid(),v_theme.id,now())
    on conflict(user_id) do update set theme_id=excluded.theme_id,updated_at=now();
  return jsonb_build_object('id',v_theme.id,'name',v_theme.name);
end;
$$;
create or replace function public.get_customer_secret_theme()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id',t.id,'name',t.name,'active',t.active,'config',t.config)
  from public.customer_theme_preferences p
  join public.site_themes t on t.id=p.theme_id
  where p.user_id=auth.uid() and t.active=true
  limit 1;
$$;
revoke all on function public.activate_secret_theme(text) from public;
grant execute on function public.activate_secret_theme(text) to authenticated;
revoke all on function public.get_customer_secret_theme() from public;
grant execute on function public.get_customer_secret_theme() to authenticated;
