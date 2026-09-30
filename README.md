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


## 


## Secret Kawaii Customer Theme
- Customer-only secret theme is activated from Profile → Secret Theme.
- Secret code: `KAWAII`
- Theme applies consistently to customer pages only; admin remains unchanged.
- Product detail includes a working native share/copy-link action.
- Character image URLs are documented in `public/chiikawa-assets.json` and reference the official Chiikawa character page.
- Before commercial launch, confirm permission to use the character artwork.
