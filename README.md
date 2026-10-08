# YN Studio Fresh — Updated

## Included in this version
- Customer cart redesign with quantity controls and order summary.
- Customer checkout now requires payment through the YN Studio ABA/KHQR flow and a payment receipt upload.
- Official `public/QR.PNG` KHQR included.
- Customer orders keep `payment pending` until admin verifies the payment.
- Admin Orders show customer name/email, payment method, payment status, and a signed receipt link.
- Admin Wallet Deposits show the linked customer.
- Admin Transactions show the linked customer.
- Admin Customers show wallet balance, order count, and transaction count.
- Admin-only dark mode. Customer pages remain light.

## Supabase migration
Run `supabase-order-payment.sql` in Supabase SQL Editor before deploying. It adds the order payment fields and automatically creates wallets for new/existing customers.

## Local
```bash
npm install
npm run dev
```

## Render
Build command:
```text
npm install; npm run build
```

Set these Render environment variables:
```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Rewards, Coupons & Support Chat
- Admin coupons: `/admin/coupons`
- Customer rewards: `/rewards`
- Customer/admin support chat supports image messages.
- Admin can send refund credits, gift envelopes, and coupons directly inside chat.
- Customers can claim chat rewards and apply coupon codes at checkout.
- Run `supabase-rewards-coupons.sql` in Supabase SQL Editor after the existing marketplace/order-payment SQL.


## Custom email OTP server

This version uses the YN Studio server to send the 6-digit signup verification code instead of Supabase Auth's confirmation-email SMTP.

1. Run `supabase-email-otp.sql` in Supabase SQL Editor.
2. Keep Supabase **Confirm email OFF**.
3. Add these **server-only** Render environment variables:
   - `SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role key
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `465`
   - `SMTP_USER` = `ynstudio04@gmail.com`
   - `SMTP_PASS` = your Google App Password
   - `OTP_SECRET` = a long random secret string
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Make sure the Render service is a **Web Service**, not a Static Site, so it can run the Node server.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, or `OTP_SECRET` as `VITE_*` variables or commit them to GitHub.
