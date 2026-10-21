-- YN Studio wallet transaction fix.
-- Run this AFTER the existing wallet/order SQL and rewards SQL.
-- Fixes: wallet_transactions.balance_before cannot be NULL.

create or replace function public.admin_adjust_wallet(p_user_id uuid,p_amount numeric,p_description text default null)
returns numeric language plpgsql security definer set search_path=public as $$
declare old_balance numeric; new_balance numeric; v_wallet_id uuid;
begin
  if not exists (select 1 from public.profiles where user_id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
  if p_amount is null or p_amount=0 then raise exception 'Amount cannot be zero'; end if;
  insert into public.wallets(user_id,balance) values(p_user_id,0) on conflict(user_id) do nothing;
  select id,coalesce(balance,0) into v_wallet_id,old_balance from public.wallets where user_id=p_user_id limit 1 for update;
  if v_wallet_id is null then raise exception 'Customer wallet could not be created'; end if;
  new_balance:=old_balance+p_amount;
  update public.wallets set balance=new_balance where id=v_wallet_id;
  insert into public.wallet_transactions(wallet_id,user_id,amount,balance_before,balance_after,type,description)
  values(v_wallet_id,p_user_id,p_amount,old_balance,new_balance,
    case when p_amount>0 then 'admin_credit' else 'admin_debit' end,
    coalesce(p_description,case when p_amount>0 then 'Admin added money' else 'Admin deducted money' end));
  return new_balance;
end; $$;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text) to authenticated;

create or replace function public.claim_chat_reward(p_reward_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.chat_rewards%rowtype; v_wallet_id uuid; old_balance numeric; new_balance numeric; assignment_id uuid;
begin
  select * into r from public.chat_rewards where id=p_reward_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Reward not found'; end if;
  if r.status<>'sent' then raise exception 'Reward has already been claimed'; end if;
  if r.type in ('refund','envelope') then
    if coalesce(r.amount,0)<=0 then raise exception 'Invalid reward amount'; end if;
    insert into public.wallets(user_id,balance) values(auth.uid(),0) on conflict(user_id) do nothing;
    select id,coalesce(balance,0) into v_wallet_id,old_balance from public.wallets where user_id=auth.uid() limit 1 for update;
    new_balance:=old_balance+r.amount;
    update public.wallets set balance=new_balance where id=v_wallet_id;
    insert into public.wallet_transactions(wallet_id,user_id,amount,balance_before,balance_after,type,description)
    values(v_wallet_id,auth.uid(),r.amount,old_balance,new_balance,'reward',case when r.type='refund' then 'Customer service refund' else 'Customer service envelope' end);
  elsif r.type='coupon' then
    if r.coupon_id is null then raise exception 'Coupon reward is missing a coupon'; end if;
    insert into public.coupon_assignments(coupon_id,user_id,status,assigned_by,claimed_at)
    values(r.coupon_id,auth.uid(),'claimed',r.admin_id,now())
    on conflict(coupon_id,user_id) do update set status='claimed',claimed_at=now()
    returning id into assignment_id;
    new_balance:=null;
  end if;
  update public.chat_rewards set status='claimed',claimed_at=now() where id=r.id;
  return jsonb_build_object('type',r.type,'amount',r.amount,'balance',new_balance,'coupon_id',r.coupon_id);
end; $$;
grant execute on function public.claim_chat_reward(uuid) to authenticated;
