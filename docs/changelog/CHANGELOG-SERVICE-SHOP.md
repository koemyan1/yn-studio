# Pay-first service shop

Printing, Copy, Social post, Poster and Logo now work like the CV maker: choose options, see a live price, pay with Bakong KHQR first, then follow the order.

- New SQL: `supabase/sql/supabase-service-shop.sql` (catalog, prices, options, orders, private buckets, notification trigger).
- New server module `server/serviceShop.js`: `/api/service/quote`, `/api/service/order`, `/api/service/status`; service orders are included in `/api/bakong/sync`.
- Shared price maths `shared/serviceMath.js` (server real total + browser preview).
- Customer: `src/ServiceOrder.tsx` (form, pick-up/delivery, summary, payment, tracker, downloads). Admin: `src/AdminServiceShop.tsx` (Service prices, Service orders).
- Admin Settings gets Store name + Store address; `BakongPayModal` accepts a service order.
- The old request form stays as the fallback. Setup: [SERVICE-SHOP-SETUP](../setup/SERVICE-SHOP-SETUP.md).
