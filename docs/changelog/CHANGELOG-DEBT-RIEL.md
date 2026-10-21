# Debt in Khmer riel + US dollars
1. Run supabase-debt-multi-currency.sql once in Supabase -> SQL Editor (after supabase-debt-interest-fix.sql). Existing debt accounts become USD.
2. Deploy.
Admin > Debt Management: choose USD or Riel when creating an account. A customer can have one dollar account and one riel account.
To add riel (or dollars) to a customer who already owes the other one: open their account, pick the currency in Add new debt, enter the amount. The second account is created automatically with the same interest settings.
Totals at the top are shown per currency. Riel amounts and riel percent interest are whole riel.
Customer Debt page: tabs appear when they owe both. Wallet and Bakong KHQR are dollars, so they pay the USD account only; riel is recorded by the admin with Record payment.
Not built or tested here (no network): run npm run build once.
