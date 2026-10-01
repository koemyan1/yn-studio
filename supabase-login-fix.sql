-- YN Studio login/account fix
-- Run this once in Supabase SQL Editor.
-- It creates a profile automatically whenever a new Supabase Auth user is created.
-- This prevents customer signup/login from depending on a client-side profiles INSERT.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1), 'Customer'),
    coalesce(new.email,''),
    'customer'
  )
  on conflict (user_id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- Make sure existing Auth users also have a customer profile if they are missing one.
insert into public.profiles (user_id, name, email, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email,''),'@',1), 'Customer'),
  coalesce(u.email,''),
  'customer'
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id=u.id);

-- IMPORTANT: Supabase Dashboard → Authentication → Providers → Email
-- If you want customers to log in immediately after signup, turn OFF
-- "Confirm email". If you keep it ON, customers must verify the 6-digit
-- code shown by the YN Studio signup screen before password login succeeds.
