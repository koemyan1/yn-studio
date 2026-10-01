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
