# Debt: delete completely + fresh start after payoff

Run `supabase-debt-delete-and-fresh-start.sql` once in Supabase -> SQL Editor (after supabase-debt-multi-currency.sql).

- Admin -> Debt Management -> select an account -> red **Delete debt** button. Removes the account, its whole ledger and its QR receipts (files too). Asks for confirmation first.
- When a customer pays a debt off, they no longer see it. If the admin later adds new debt, the old history is archived (hidden from the customer by the database itself) and the new debt starts fresh: original debt = the new amount, new start date, interest schedule restarts.
- Admin still sees the old rows (dimmed, labelled "Old paid-off debt") and a "Paid off" tag in the list. Use Delete debt to erase it entirely.
