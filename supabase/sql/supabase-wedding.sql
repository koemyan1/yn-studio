-- Wedding invitation (public/wedding) + Admin -> Wedding page.
-- Run once in Supabase -> SQL Editor. Safe to run again.
--
--   * Guests (the anon key on the invitation page) can only ADD an RSVP and ADD / READ wishes.
--   * RSVPs are private: only a signed-in admin (profiles.role = 'admin') can read or delete them.
--   * Only an admin can delete a wish (to remove a bad message from the page).
--   * Needs the baseline `profiles` table (same admin rule as every other admin policy in this project).

-- 0) helper: is the signed-in user an admin? (identical to the one in supabase-service-shop.sql, so running either file first is fine)
create or replace function public.yn_svc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
$$;
revoke all on function public.yn_svc_is_admin() from public;
grant execute on function public.yn_svc_is_admin() to anon, authenticated;

-- 1) tables (same shape the invitation page writes)
create table if not exists public.rsvps (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  attending boolean not null default true,
  guests int not null default 1 check (guests between 1 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.wishes (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table public.rsvps  enable row level security;
alter table public.wishes enable row level security;

-- 2) guests (anon): add only
drop policy if exists "anyone can rsvp" on public.rsvps;
create policy "anyone can rsvp" on public.rsvps for insert to anon, authenticated with check (true);

drop policy if exists "anyone can wish" on public.wishes;
create policy "anyone can wish" on public.wishes for insert to anon, authenticated with check (true);

drop policy if exists "anyone can read wishes" on public.wishes;
create policy "anyone can read wishes" on public.wishes for select to anon, authenticated using (true);

-- 3) admin: read + delete RSVPs, delete wishes
drop policy if exists "admin reads rsvps" on public.rsvps;
create policy "admin reads rsvps" on public.rsvps for select to authenticated using (public.yn_svc_is_admin());

drop policy if exists "admin deletes rsvps" on public.rsvps;
create policy "admin deletes rsvps" on public.rsvps for delete to authenticated using (public.yn_svc_is_admin());

drop policy if exists "admin deletes wishes" on public.wishes;
create policy "admin deletes wishes" on public.wishes for delete to authenticated using (public.yn_svc_is_admin());
