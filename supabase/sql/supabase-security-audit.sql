-- YN Studio: READ-ONLY security audit. Run in Supabase -> SQL Editor (each block separately, or all at once) and
-- send me / keep the results. It changes nothing. It shows what the code in the zip could not: the live policies.

-- 1. Tables in public WITHOUT row level security (anything listed here is readable/writable by anyone with the public key unless grants block it)
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1;

-- 2. Every policy on the money / identity tables
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('profiles','wallets','wallet_transactions','orders','order_items','cart_items','carts','products','deposit_requests','categories')
order by tablename, cmd, policyname;

-- 3. Direct table privileges held by the browser roles (anon / authenticated)
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee order by table_name, grantee;

-- 4. Functions the logged-OUT public key can run
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.prokind = 'f' order by 1;

-- 5. Public storage buckets and who may upload
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 6. Triggers on the money tables (should include yn_guard_* after the hardening script)
select event_object_table as tbl, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema = 'public' and event_object_table in ('profiles','wallets','orders','order_items') order by 1, 2;

-- 7. Who is an admin right now (should be only people you expect)
select user_id, email, role from public.profiles where role = 'admin';
