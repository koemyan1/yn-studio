# Wallet payment fix (no screen changes)
The Pay with Wallet buttons (Checkout, Orders) look and work the same in the app. Only the database function behind them was hardened.
Re-run supabase-wallet-order-payment.sql in Supabase -> SQL Editor (even if you ran the old one).
- A wallet_transactions.type CHECK/enum that rejects 'order_payment' no longer makes the payment fail (it falls back to 'debt_payment' for the history row).
- A failing admin notification can no longer cancel the payment.
- A payment_method CHECK on orders no longer blocks marking the order paid.
- If a customer has duplicate wallet rows, the one with the money is used.
