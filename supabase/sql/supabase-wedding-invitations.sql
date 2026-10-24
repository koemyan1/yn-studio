-- YN Studio: Wedding e-invitations (admin builds them, guests open a public link, no login needed).
-- Run once in Supabase -> SQL Editor. Safe to run again.

-- 1) The invitations. `data` holds everything the admin edits (names, date, opening style, songs, butterflies...).
create table if not exists public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null default 'Wedding invitation',
  published boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  views integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- If a table with this name already existed (an older or partial version), the block above is skipped,
-- so make sure every column this feature needs is there. Safe to run any number of times.
alter table public.wedding_invitations add column if not exists slug text;
alter table public.wedding_invitations add column if not exists title text not null default 'Wedding invitation';
alter table public.wedding_invitations add column if not exists published boolean not null default false;
alter table public.wedding_invitations add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.wedding_invitations add column if not exists views integer not null default 0;
alter table public.wedding_invitations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.wedding_invitations add column if not exists created_at timestamptz not null default now();
alter table public.wedding_invitations add column if not exists updated_at timestamptz not null default now();
create unique index if not exists wedding_invitations_slug_key on public.wedding_invitations(slug);
create index if not exists wedding_invitations_created_idx on public.wedding_invitations(created_at desc);
alter table public.wedding_invitations enable row level security;

-- Anyone (even signed out) may read a PUBLISHED invitation. Drafts are visible to admins only.
drop policy if exists "invitations public read" on public.wedding_invitations;
create policy "invitations public read" on public.wedding_invitations for select
  using (published = true or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin insert" on public.wedding_invitations;
create policy "invitations admin insert" on public.wedding_invitations for insert
  with check (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin update" on public.wedding_invitations;
create policy "invitations admin update" on public.wedding_invitations for update
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitations admin delete" on public.wedding_invitations;
create policy "invitations admin delete" on public.wedding_invitations for delete
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

create or replace function public.yn_invitations_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists yn_invitations_touch on public.wedding_invitations;
create trigger yn_invitations_touch before update on public.wedding_invitations
  for each row execute function public.yn_invitations_touch();

-- 2) Guests cannot update the table, so a tiny function counts the opens (published invitations only).
create or replace function public.invitation_count_view(p_slug text) returns void
language sql security definer set search_path = public as $$
  update public.wedding_invitations set views = views + 1 where slug = lower(p_slug) and published = true;
$$;
revoke all on function public.invitation_count_view(text) from public;
grant execute on function public.invitation_count_view(text) to anon, authenticated;

-- 3) Storage for the opening picture, gallery photos and songs (public read, admin write).
insert into storage.buckets (id, name, public) values ('invitation-assets', 'invitation-assets', true)
  on conflict (id) do update set public = true;
drop policy if exists "invitation assets public read" on storage.objects;
create policy "invitation assets public read" on storage.objects for select using (bucket_id = 'invitation-assets');
drop policy if exists "invitation assets admin insert" on storage.objects;
create policy "invitation assets admin insert" on storage.objects for insert
  with check (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitation assets admin update" on storage.objects;
create policy "invitation assets admin update" on storage.objects for update
  using (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "invitation assets admin delete" on storage.objects;
create policy "invitation assets admin delete" on storage.objects for delete
  using (bucket_id = 'invitation-assets' and exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- 4) Admin-only notes (preferred completion date, special requests, designer instructions).
-- Kept in their own table because guests may read the published invitation row above.
create table if not exists public.wedding_invitation_private (
  invitation_id uuid primary key references public.wedding_invitations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.wedding_invitation_private enable row level security;
drop policy if exists "invitation private admin all" on public.wedding_invitation_private;
create policy "invitation private admin all" on public.wedding_invitation_private for all
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- 5) Sending an invitation to a customer + personal guest links (a name per link, unlimited).
-- The admin picks the customer in the editor; the invitation then shows on that customer's Services page,
-- where they can use the original link or add names. Every name gets its own link that fills the
-- guest-name space on the opening page.
alter table public.wedding_invitations add column if not exists customer_id uuid references auth.users(id) on delete set null;
create index if not exists wedding_invitations_customer_idx on public.wedding_invitations(customer_id);

create or replace function public.yn_inv_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin');
$$;
create or replace function public.yn_inv_owns(p_invitation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.yn_inv_is_admin() or exists(select 1 from public.wedding_invitations i where i.id = p_invitation and i.customer_id = auth.uid());
$$;
grant execute on function public.yn_inv_is_admin() to anon, authenticated;
grant execute on function public.yn_inv_owns(uuid) to authenticated;

-- A customer can read their own invitation (even while it is still a draft). Everyone can read published ones.
drop policy if exists "invitations public read" on public.wedding_invitations;
create policy "invitations public read" on public.wedding_invitations for select
  using (published = true or customer_id = auth.uid() or public.yn_inv_is_admin());

create table if not exists public.wedding_invitation_guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.wedding_invitations(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  opens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wedding_invitation_guests_inv_idx on public.wedding_invitation_guests(invitation_id, created_at desc);
alter table public.wedding_invitation_guests enable row level security;

drop policy if exists "guests owner read" on public.wedding_invitation_guests;
create policy "guests owner read" on public.wedding_invitation_guests for select using (public.yn_inv_owns(invitation_id));
drop policy if exists "guests owner insert" on public.wedding_invitation_guests;
create policy "guests owner insert" on public.wedding_invitation_guests for insert with check (public.yn_inv_owns(invitation_id));
drop policy if exists "guests owner update" on public.wedding_invitation_guests;
create policy "guests owner update" on public.wedding_invitation_guests for update using (public.yn_inv_owns(invitation_id)) with check (public.yn_inv_owns(invitation_id));
drop policy if exists "guests owner delete" on public.wedding_invitation_guests;
create policy "guests owner delete" on public.wedding_invitation_guests for delete using (public.yn_inv_owns(invitation_id));

-- Owners may only rename a guest; the code and the open counter cannot be changed from the app.
revoke update on public.wedding_invitation_guests from anon, authenticated;
grant update (name) on public.wedding_invitation_guests to authenticated;
revoke all on public.wedding_invitation_guests from anon;

-- Safety net against runaway scripts: 10,000 names per invitation (far more than any wedding).
create or replace function public.yn_inv_guest_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.wedding_invitation_guests where invitation_id = new.invitation_id) >= 10000 then
    raise exception 'Guest limit reached for this invitation';
  end if;
  return new;
end $$;
drop trigger if exists yn_inv_guest_cap on public.wedding_invitation_guests;
create trigger yn_inv_guest_cap before insert on public.wedding_invitation_guests for each row execute function public.yn_inv_guest_cap();

-- The public page asks for the name that belongs to a link. Only a matching (published invitation + code) answers.
create or replace function public.invitation_guest_name(p_slug text, p_code text, p_count boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select g.name into v
  from public.wedding_invitation_guests g join public.wedding_invitations i on i.id = g.invitation_id
  where i.slug = lower(p_slug) and i.published and g.code = lower(p_code);
  if v is not null and p_count then
    update public.wedding_invitation_guests set opens = opens + 1 where code = lower(p_code);
  end if;
  return v;
end $$;
revoke all on function public.invitation_guest_name(text, text, boolean) from public;
grant execute on function public.invitation_guest_name(text, text, boolean) to anon, authenticated;
