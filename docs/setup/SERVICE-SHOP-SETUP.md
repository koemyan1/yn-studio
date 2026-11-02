# Pay-first services (Printing, Copy, Social post, Poster, Logo)

Customers fill a form built from **your** prices and options, pay with Bakong KHQR first, and only then does the request become a real job. The CV maker is unchanged.

```
customer form -> POST /api/service/order (server recomputes the price) -> KHQR -> paid -> Your requests: Paid > In progress > Ready > Done
```

Cost: **$0**. It uses only what you already run (Supabase, the Render server, Bakong, OpenStreetMap tiles).

## What you must do, in this order

1. **Bakong must already work** ([BAKONG-SETUP](BAKONG-SETUP.md)). Without it the Services page keeps the old "Request this" form.
2. **Supabase -> SQL Editor:** run `supabase/sql/supabase-service-shop.sql` once (safe to run again; it never overwrites prices you edited). It creates the catalog, prices, options and orders tables, two **private** storage buckets (`service-private` for customer files, `service-results` for finished files), the notification trigger and live updates.
3. **Deploy** the new code on Render (no new environment variables, no new packages).
4. **Admin -> Settings -> delivery:** fill **Store name** and **Store address** (new fields), and check the store latitude/longitude and the Google Maps link. Pick-up shows these; delivery fees use the base fee / extra fee already there.
5. **Admin -> Service prices:** set your real prices. Services start **switched off** with example prices. Switch each one on when ready.
6. **Push notifications** (optional): status changes create a row in `notifications`, so phones get pushes if you already set up [PUSH-SETUP](PUSH-SETUP.md).
7. **Have a Khmer speaker read** the Khmer text (the starter catalog and screens were machine-written).

## How prices work

- **Base price** (several per service): "A4 colour, per page", "Logo - basic"... Unit `page`, `copy` or `item` is multiplied by the quantity; unit `job` is charged once.
- **Quantity** = every number question marked "Multiplies the price" (pages x copies).
- **Option extras:** fixed (once), per unit (x quantity) or percent (of the base price only).
- **Delivery** (print and copy only): the delivery settings in Admin -> Settings, by distance from the store. Pins more than 100 km away are refused (a safety limit, not a business rule).
- The browser total is only a preview. The server recalculates from the catalog and ignores any price the browser sends.

## Orders

- A new order is `awaiting_payment`; it becomes `paid` only after the server sees the Bakong payment. Unpaid orders are **cancelled after 48 hours** (never deleted).
- Admin -> Service orders: filter, open an order, see choices, files, map, payment. Move it to In progress / Ready / Done (the customer is notified). Design orders need finished files uploaded before "Ready"; the customer then sees **Download**.
- **Refunds:** the app does not move money. Cancel with a reason, send the refund yourself, then record it ("I refunded...").
- Files: customers upload pictures / PDF up to 10 MB (max 5) to a private bucket; only they and admins can open them.

## Old requests

`service_requests`, `product_suggestions` and the public `service-uploads` bucket are untouched. A service that is off, has no price, or when Bakong is off still shows the old free-text form.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Customers still see "Request this" | Service switched off, no enabled price, Bakong not configured, or the SQL was not run |
| "Could not upload the file" | Run the SQL (it creates the private bucket) |
| Admin page says "Did you run supabase-service-shop.sql?" | Run it |
| Pick-up shows no address | Fill Store name/address in Admin -> Settings |

Tests: `npm test` (includes `tests/service-shop.test.mjs`: price maths, ownership, "client cannot change the price").
