-- Cart animation on the admin panel: lets the admin page see the OLD payment_status of an order,
-- so the cart only plays when an order changes from unpaid -> paid (not on every later edit).
alter table public.orders replica identity full;

-- make sure order changes are broadcast (safe to run more than once)
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; when others then null;
end $$;
