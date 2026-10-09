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

## Purple Map, distance delivery pricing, rider avatar

1. Open the Supabase SQL Editor and run `supabase-grab-map-delivery.sql` once. This creates the admin-controlled delivery settings row and the public delivery-avatar storage bucket.
2. Deploy the app, then open Admin → Settings.
3. Set the store pickup coordinates, starting delivery fee, included kilometres, and extra fee per distance step.
4. Upload a rider avatar. The customer Map uses this picture for the rider marker when GPS coordinates are being reported. Rider tracking still needs the existing native/background tracking setup and a courier device to share location.
5. Customers must choose their drop-off point on the purple Map in checkout. The app requests road distance from the public OSRM routing service and calculates the fee using the saved admin rules; if routing is temporarily unavailable, it estimates from straight-line distance.

## Visual theme editor

Admin → Themes includes a phone canvas with Text, Image, Button, and Widget elements. Select and drag elements, use the resize handle or Width field, and zoom the editor view in/out. Image elements can use a public image URL or upload into the `theme-assets` bucket. The preview uses published product data; saved theme elements are rendered on the customer theme home page.

The theme phone preview now mounts the same customer `Shop` component used by the live storefront (with the unsaved editor configuration passed in), so it displays the actual published products and customer home layout rather than a static drawing.

In Theme Studio, use **Customer preview** to see the actual storefront or **Drag & resize** to edit saved canvas elements; both views share the same unsaved theme config.
