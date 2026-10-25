-- Live wallet page: lets the customer's Wallet page update by itself (balance + history), and play the
-- "money received" animation the moment another customer sends them money. Safe to run more than once.
-- Row-level security still applies: each customer only receives their own rows.
do $$ begin
  alter publication supabase_realtime add table public.wallets;
exception when duplicate_object then null; when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.wallet_transactions;
exception when duplicate_object then null; when others then null;
end $$;
