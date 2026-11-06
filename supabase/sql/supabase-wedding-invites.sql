-- Wedding invitations sent by the admin to a customer + the customer's guest list.
-- Run once in Supabase -> SQL Editor (after supabase-wedding.sql). Safe to run again.
--   * Admin (profiles.role = 'admin') creates an invitation for a customer (design + wording).
--   * The customer sees only THEIR invitation(s) and manages THEIR guests.
--   * A guest link /wedding/?i=<invite>&g=<guest> shows that guest's name on the envelope front.
--   * Visitors (anon) can't read the tables; they only call wedding_open() with the two ids.
create table if not exists public.wedding_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null default '',
  design jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.wedding_guests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.wedding_invites(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wedding_guests_invite_idx on public.wedding_guests(invite_id);
alter table public.wedding_invites enable row level security;
alter table public.wedding_guests  enable row level security;

drop policy if exists "owner reads invite" on public.wedding_invites;
create policy "owner reads invite" on public.wedding_invites for select to authenticated using (owner_id = auth.uid() or public.yn_svc_is_admin());
drop policy if exists "admin writes invite" on public.wedding_invites;
create policy "admin writes invite" on public.wedding_invites for all to authenticated using (public.yn_svc_is_admin()) with check (public.yn_svc_is_admin());

drop policy if exists "owner manages guests" on public.wedding_guests;
create policy "owner manages guests" on public.wedding_guests for all to authenticated
  using (exists (select 1 from public.wedding_invites i where i.id = invite_id and (i.owner_id = auth.uid() or public.yn_svc_is_admin())))
  with check (exists (select 1 from public.wedding_invites i where i.id = invite_id and (i.owner_id = auth.uid() or public.yn_svc_is_admin())));

-- what the invitation page calls (knowing the unguessable ids is the "key")
create or replace function public.wedding_open(p_invite uuid, p_guest uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_guest is not null then
    update wedding_guests set opened_at = coalesce(opened_at, now()) where id = p_guest and invite_id = p_invite;
  end if;
  select jsonb_build_object('config', i.config, 'design', i.design,
           'guest', (select g.name from wedding_guests g where g.id = p_guest and g.invite_id = i.id))
    into r from wedding_invites i where i.id = p_invite;
  return r;
end $$;
revoke all on function public.wedding_open(uuid, uuid) from public;
grant execute on function public.wedding_open(uuid, uuid) to anon, authenticated;
