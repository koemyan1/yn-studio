-- Run after the existing debt schema. Lets a customer pay from their YN wallet.
create or replace function public.customer_pay_debt(p_amount numeric)
returns public.debt_accounts language plpgsql security definer set search_path=public as $$
declare a public.debt_accounts; w public.wallets; old_balance numeric; new_balance numeric; v_wallet_id uuid; paid numeric;
begin
 if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 perform public.accrue_customer_debt_interest(auth.uid());
 select * into a from public.debt_accounts where user_id=auth.uid() and enabled=true for update;
 if not found then raise exception 'Debt account is not enabled'; end if;
 paid:=least(p_amount,a.current_balance);
 insert into public.wallets(user_id,balance) values(auth.uid(),0) on conflict(user_id) do nothing;
 select id,coalesce(balance,0) into v_wallet_id,old_balance from public.wallets where user_id=auth.uid() for update;
 if old_balance < paid then raise exception 'Insufficient wallet balance. Add money to your wallet first.'; end if;
 new_balance:=old_balance-paid;
 update public.wallets set balance=new_balance where id=v_wallet_id;
 insert into public.wallet_transactions(wallet_id,user_id,amount,balance_before,balance_after,type,description) values(v_wallet_id,auth.uid(),-paid,old_balance,new_balance,'debt_payment','Debt payment');
 a.current_balance:=a.current_balance-paid;
 insert into public.debt_transactions(debt_account_id,user_id,type,amount,balance_after,note) values(a.id,auth.uid(),'payment',paid,a.current_balance,'Customer wallet payment');
 update public.debt_accounts set current_balance=a.current_balance,updated_at=now() where id=a.id returning * into a;
 return a;
end; $$;
grant execute on function public.customer_pay_debt(numeric) to authenticated;
