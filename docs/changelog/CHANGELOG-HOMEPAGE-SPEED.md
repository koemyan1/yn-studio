# Homepage speed (many products)

Cause: the homepage asked Supabase for each product's first option and then that option's first price, one product at a time (2 requests per product, in a row), and kept the spinner up until all of them finished. Every card also ran its own wishlist query, and in non-original themes every product picture was downloaded and background-cut at once, even off-screen.

Changes
- main.tsx `displayPrices()`: option prices for ALL products in 2 batched requests (was 2 per product). Used on Home and on the Snacks page.
- Home loads products, categories, banners and the theme category list together (Promise.all) instead of one after another; products show as soon as prices are back (or after 2.5 s at most, prices then fill in).
- Home shows 24 products first and loads 24 more as you scroll (also resets when you search or pick a category).
- Wishlist is read once per page (`loadWish()`), not once per product card; hearts still update instantly.
- secretTheme.tsx `ThemedImg`: background cut-out only starts for pictures near the screen.
- imageTools.ts: new `optimizeImage()` (max 1200 px, WebP, falls back to JPEG/PNG if the browser cannot encode WebP). Used for product photos and option photos when the admin saves a product. Background-removed photos are now max 1200 px and WebP instead of up to 2000 px PNG.

Not changed: pictures already uploaded stay as they were. Re-saving a product (or re-uploading its photo) in the admin makes the new, smaller version.
