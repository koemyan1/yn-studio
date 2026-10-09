# YN Studio v18 changes

- Location picker defaults to Cambodia, constrains map panning to Cambodia, and restricts place search to Cambodia (`countrycodes=kh`).
- Checkout now shows saved delivery information in a compact address tile and opens the map only after the customer chooses Add location / Add more address.
- Cart and checkout now permanently remove cart rows whose products are no longer published, so republishing later does not restore old cart items.
- Added `supabase-v18-coupon-fixes.sql` to make coupon deletion possible while retaining redemption history and to address legacy coupon `updated_at` trigger errors.
- Delivery distance fee settings remain available under Admin → Settings.

## Required database step
Run `supabase-v18-coupon-fixes.sql` in Supabase SQL Editor. Review the SQL and take a database backup first.

## Verification
A complete production build could not be completed in this workspace because dependency installation timed out. Deploy to a preview/staging service first and check Render build logs before replacing the live version.
