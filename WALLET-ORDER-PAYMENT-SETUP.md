# Pay orders from the wallet

1. Run `supabase-wallet-order-payment.sql` once in Supabase -> SQL Editor.
2. Checkout now has **Pay with Wallet** under **Pay with KHQR**. It shows the customer's balance and is disabled when the balance is lower than the order total.
3. A pending order in **Orders** also gets a **Pay now with Wallet** button.
4. The wallet is charged by the database in one step (balance check, deduction, wallet transaction, order marked paid), always for the order total saved in the database. Admin gets an "Order paid with wallet" notification and the wallet transaction appears in Wallet history as "Order #... (wallet payment)".
5. **Top-ups are unchanged**: adding money to the wallet is still KHQR only.

If your `wallet_transactions.type` column has a CHECK constraint that rejects `order_payment`, add that word to the constraint.
