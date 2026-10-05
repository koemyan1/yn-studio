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
