-- YN Studio custom email OTP verification
-- Run this once in Supabase SQL Editor.
-- Supabase Auth email confirmation should remain OFF because this flow sends its own OTP.

create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists email_otps_user_id_idx on public.email_otps(user_id);
create index if not exists email_otps_expires_at_idx on public.email_otps(expires_at);

alter table public.email_otps enable row level security;

revoke all on table public.email_otps from anon, authenticated;

-- Optional cleanup helper for old OTP rows.
create or replace function public.cleanup_expired_email_otps()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.email_otps where expires_at < now();
$$;
