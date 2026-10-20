# Separate riel wallet (riel and dollars are completely different balances)

Run in Supabase -> SQL Editor, in this order (safe to re-run):
1. `supabase-debt-riel-pay.sql`
2. `supabase-wallet-separate-riel.sql`   <- this one replaces the riel functions from file 1
Then deploy server + app.

## How it works now
* `wallets.balance` = dollars. `wallets.balance_khr` = riel. No conversion between them.
* Top up in riel -> riel wallet. Top up in dollars -> dollar wallet.
* Riel debt: paid from the riel wallet, or with a riel KHQR. Dollar debt: dollar wallet or dollar KHQR.
* Overpaying a debt by KHQR puts the extra into the wallet of the same currency.
* Wallet page shows both balances; history rows show their own currency (and which wallet).
* Orders and CV payments are priced in dollars, so they still use the dollar wallet.
* Admin: customer card shows the riel balance too; transactions list shows each row in its own currency.
* BAKONG_KHR_RATE is no longer used for the wallet.

Money already in wallets (including riel top-ups made before this update, saved as dollars) stays in dollars.
