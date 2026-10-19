# Wallet in Khmer riel

1. Run `supabase-wallet-riel.sql` once in Supabase -> SQL Editor (after supabase-bakong.sql and supabase-debt-multi-currency.sql).
2. Set `BAKONG_KHR_RATE` on Render (e.g. `4100`). It is the riel-per-dollar rate used for top-ups and for showing balances. Leave `BAKONG_CURRENCY` as `USD` (order QR codes stay in dollars).
3. Deploy.

## What changed
* **Wallet page:** the amount box is now in riel (min 100 ៛). The KHQR shown is a riel QR (currency KHR) for exactly that amount, and the server checks the payment in riel with Bakong before crediting.
* **Balance in riel:** wallet balance, wallet history, transaction details, and the balance shown on Checkout, Orders and CV payment are all shown in riel.
* **How it is stored:** the wallet is still kept in US dollars so orders, debt and admin adjustments keep working. A top-up of X ៛ adds X / rate dollars, using the rate saved when the QR was made, so later rate changes never alter a top-up already in progress. Balances are shown as dollars x rate.
* Debt payments by KHQR and order QR codes are unchanged (dollars).
* Admin pages still show wallet amounts in dollars.

## Notes
* If the rate changes later, existing balances change in riel by the same ratio, because they are stored in dollars. Keep the rate steady if you want riel balances to stay put.
* Not built or tested here (no network): run `npm run build`, then try a small real top-up (e.g. 100 ៛).
