# ABA PayWay setup (automatic payment confirmation)

Customers get a new checkout button: **Pay now with ABA PayWay**. It opens ABA's secure payment page
(ABA Pay, KHQR or card). When the customer pays, the order is marked **paid automatically** and the
admin gets a notification. The old "scan QR + upload receipt" checkout stays available and is used
automatically if PayWay is not configured.

## 1. Get PayWay credentials from ABA
Ask ABA PayWay for a **sandbox** merchant first. You need:
* `merchant_id`
* the **API key** (secret – server only)
* your app's public domain added to the allowed/whitelisted domains (the Render URL, e.g. `https://yn-studio.onrender.com`)
* the payment options you want enabled (KHQR / ABA Pay / cards)

## 2. Database
Run `supabase-aba-payway.sql` once in Supabase → SQL Editor.
Make sure customers can't edit `payment_status`, `status` or `aba_*` on their own orders
(the server uses the service-role key, which bypasses RLS).

## 3. Render environment variables
Copy the names from `.env.server.example` into Render → your service → Environment:

| Variable | Value |
|---|---|
| `ABA_PAYWAY_MERCHANT_ID` | from ABA |
| `ABA_PAYWAY_API_KEY` | from ABA (secret) |
| `ABA_PAYWAY_ENV` | `sandbox` while testing, `production` when live |
| `ABA_PAYWAY_PAYMENT_OPTION` | `abapay_khqr` (default). Others: `abapay`, `cards`, `bakong`… |
| `ABA_PAYWAY_CURRENCY` | `USD` (default). `KHR` also works; set `ABA_PAYWAY_KHR_RATE` (default 4100) |
| `PUBLIC_URL` | your public app URL, no trailing slash |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | same values as the VITE_ ones |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (**secret**) |

Redeploy. Open `https://YOUR-APP/api/aba/config` – it should say `{"enabled":true,...}`.

## 4. Test in the sandbox
1. Add something to the cart → Checkout → **Pay now with ABA PayWay**.
2. Pay with the sandbox method ABA gives you.
3. Back in the app, *My orders* shows the order as paid within a few seconds.

## How it works (and why it is safe)
* The browser never sees your API key. The server signs each payment request (HMAC-SHA512).
* The **amount always comes from your database**, never from the browser. A customer can only pay their own unpaid orders.
* ABA's callback (`POST /api/aba/callback`) is **never trusted by itself**: the server asks PayWay's
  `check-transaction-2` API for the real result, checks the paid amount equals the order total, and only then marks the order paid.
  Forged callbacks, pending payments and wrong amounts leave the order untouched.
* When the customer returns from ABA, and while *My orders* is open, `POST /api/aba/sync` re-checks pending PayWay orders (safety net if a callback is missed).
* Unpaid PayWay orders show a **Pay now with ABA PayWay** button in *My orders* so the customer can retry.

## Notes
* I could not call ABA's servers from the build environment, so the code follows ABA's published API
  (Purchase + Check Transaction 2) and was tested against a simulated PayWay/Supabase. Please run the sandbox test above before going live.
* If ABA rejects a request, check: domain whitelisted, `ABA_PAYWAY_PAYMENT_OPTION` enabled for your merchant, correct sandbox/production keys.
