-- YN Studio: FIX debt KHQR payments never being approved automatically. Run ONCE in Supabase -> SQL Editor. Safe to re-run.
-- Cause: when the server confirms a Bakong payment it calls the database with the service key, which has no signed-in user.
-- accrue_customer_debt_interest() rejected that call ("Not allowed"), so a debt payment was never applied (wallet top-ups and orders were fine).
-- After running this, pending KHQR debt payments from the last 24 hours are applied the next time the customer opens Debt.

drop function if exists public.accrue_customer_debt_interest(uuid);
create function public.accrue_customer_debt_interest(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  r record;
  v_total integer := 0;
begin
  if auth.uid() is not null          -- null = the server confirming a KHQR payment (service role) or the SQL editor
     and v_uid is distinct from auth.uid()
     and not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Not allowed';
  end if;
  for r in select id from public.debt_accounts where user_id = v_uid loop
    v_total := v_total + public._accrue_debt_account(r.id);
  end loop;
  return v_total;
end;
$$;
grant execute on function public.accrue_customer_debt_interest(uuid) to authenticated;
