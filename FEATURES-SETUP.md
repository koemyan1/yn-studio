# YN Studio Feature Upgrade

This version adds:

- Customer notifications
- Admin notifications
- Customer wishlist + wishlist page
- Wishlist count on customer profile
- Wallet transaction detail pages
- Global loading bar for customer and admin route changes
- Redesigned customer profile
- Customer service / support tickets
- Admin customer-service inbox with replies and closing
- Automatic notifications for orders, wallet deposits, wallet transactions and support replies
- Existing seamless banner loop and no banner dots are preserved

## Supabase setup

Run the complete `supabase-marketplace-upgrade.sql` in the Supabase SQL Editor. It contains both the previous marketplace changes and the new wishlist/notification/support tables, RLS policies and notification triggers.

## Local check

```bash
npm install
npm run build
```

## Render

Commit and push the project to the GitHub repository connected to Render. Render should run the existing build command (`npm install && npm run build`).

The new database tables must be created in Supabase before the new customer/admin screens can load their data.


## Product choice images + PWA

Run `supabase-product-choice-images.sql` once in Supabase SQL Editor. Admins can then attach an image to each product choice. Customer product pages show the selected choice image and support multiple product images with swipe/arrows/thumbnails.

The build is also PWA-enabled via `public/manifest.webmanifest` and `public/sw.js`. On supported browsers, an Install button appears automatically; on iPhone Safari use Share → Add to Home Screen.

## Themes + delivery tracking

Run `supabase-themes-delivery.sql` once in the Supabase SQL Editor.

### Admin theme builder
- Admin → Themes creates unlimited themes with a secret activation code.
- The editor has a phone preview, colors, title/subtitle/button, PNG/JPG hero, MP4 hero video, page accent colors, and category unlock selection.
- Theme media is stored in the `theme-assets` bucket.
- Selected categories are hidden from customers until a valid theme code is activated.

### Customer activation
- Customer Service has a simple **Theme code** box.
- A valid active code is checked by the secure `activate_theme()` RPC.
- The customer's existing account and order code do not change.

### Delivery location
- Customers can save a GPS delivery location from Profile.
- Checkout is blocked until latitude/longitude is saved.
- The saved location is copied to the order at checkout.

### Category-specific live delivery tracking
- Admin → Categories can enable **tracking** for selected categories.
- If an order contains a tracked category, the order gets `tracking_enabled=true`.
- Admin Orders shows **Update rider location** for tracked orders and uses the admin device's GPS.
- Customers see an OpenStreetMap-based delivery map in Orders with their delivery pin and a 🏍️ rider marker when the rider location has been updated.

The customer can still order theme categories normally: they use the same product/cart/checkout flow as every other product.
