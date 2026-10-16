-- YN Studio: AI assistant commands taught by the admin (Admin → AI Assistant).
-- Run once in the Supabase SQL editor. Only admins can read or change these rows.
create table if not exists public.assistant_skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  triggers text[] not null default '{}',
  kind text not null default 'reply' check (kind in ('reply','macro','code')),
  reply text,
  steps jsonb not null default '[]'::jsonb,
  code text,
  enabled boolean not null default true,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_skills enable row level security;
drop policy if exists "Admins manage assistant skills" on public.assistant_skills;
create policy "Admins manage assistant skills" on public.assistant_skills for all to authenticated
  using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'))
  with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin'));
notify pgrst, 'reload schema';
