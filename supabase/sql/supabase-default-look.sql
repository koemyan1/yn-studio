-- YN Studio: a "Default look" the admin designs in Theme Studio and everyone sees without a secret code.
-- Run once in Supabase -> SQL Editor (safe to run again). Needs the secret-theme tables (supabase-secret-themes-and-store-location.sql).
create or replace function public.get_default_look()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'config', t.config)
  from public.site_themes t
  where t.secret_code = '__default_look__' and t.active = true
  limit 1;
$$;
revoke all on function public.get_default_look() from public;
grant execute on function public.get_default_look() to anon, authenticated;
