# Bakong KHQR setup (automatic payment confirmation)

At checkout the customer taps **Pay with KHQR**. The app shows a one-time KHQR for exactly that
order (receiver `korn_koemyan@bkrt`, merchant name **YN Studio**, the order total, 10-minute expiry).
They scan it with any Bakong-connected banking app (ABA, ACLEDA, Wing, etc.). Within a few seconds the
server sees the payment through the Bakong API and marks the order **paid**; the admin gets a notification.

**Bakong KHQR is now the only way to pay in the app:** checkout, wallet top-ups and debt payments (the debt "Wallet" tab still pays from the customer's wallet balance). The old static ABA QR, receipt uploads and ABA PayWay buttons were removed. If `BAKONG_API_TOKEN` is missing, the pay buttons are disabled and customers see a notice, so set it before deploying.

## 1. Database
Run `supabase-bakong.sql` once in Supabase -> SQL Editor (orders columns, the `bakong_payments` table, and the `bakong_apply_payment` function that credits wallets / reduces debt exactly once).

## 2. Install packages
`npm install` (adds `bakong-khqr` and `qrcode`).

## 3. Render environment variables
| Variable | Value |
|---|---|
| `BAKONG_API_TOKEN` | your Bakong Open API token (**secret**, server only) |
| `BAKONG_ACCOUNT_ID` | `korn_koemyan@bkrt` |
| `BAKONG_MERCHANT_NAME` | `YN Studio` |
| `BAKONG_MERCHANT_CITY` | `Phnom Penh` |
| `BAKONG_CURRENCY` | `USD` (or `KHR`, then also `BAKONG_KHR_RATE`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_URL` | same as for the rest of the server |

Redeploy, then open `https://YOUR-APP/api/bakong/config`. It should say `{"enabled":true,...}`.

## 4. Test with a real small payment
Place an order for a small amount (e.g. $0.01 product), pay it from your banking app, and watch it flip to paid.
Bakong has no sandbox for this, so use a real small payment.

## Things that commonly go wrong
* **Token rejected (HTTP 401 in the Render logs):** the token is wrong or expired. Bakong tokens expire, so note the date and renew it in Bakong Open API.
* **HTML / HTTP 403 / timeouts in the Render logs:** the Bakong API is often restricted to Cambodian IP addresses and Render's servers are abroad. Fix: host the Node server somewhere with a Cambodian IP, or put a small proxy in Cambodia that forwards `POST /v1/check_transaction_by_md5`, then set `BAKONG_API_BASE_URL` to the proxy.
* **Order stays pending after paying:** check the logs for `Bakong mismatch` (wrong amount / currency / receiving account) or `Bakong API ...` lines.
* Never put the token in a `VITE_` variable or commit it. If it was ever pasted in chat or code, regenerate it.

## How it stays safe
* The amount comes from the database, never from the browser; a customer can only pay their own unpaid orders.
* Each QR has its own MD5. The server asks Bakong for that MD5 and verifies amount, currency and receiving account before marking paid.
* A Bakong transaction hash can only be attached to one order (unique index).

## What each payment does when confirmed
* **Order:** marked paid, admin notified.
* **Wallet top-up:** the amount is added to the wallet and a `deposit` entry appears in wallet transactions. If your `wallet_transactions.type` column has a check constraint that rejects `deposit`, change that word in `supabase-bakong.sql` to a value it allows.
* **Debt payment:** the amount is deducted from the debt (interest is accrued first) and recorded as a payment. Anything above the remaining debt goes to the wallet.

## Not changed
Old orders, deposit requests and debt receipt submissions stay visible in the admin pages for history. The ABA PayWay server routes still exist but nothing in the app calls them.
