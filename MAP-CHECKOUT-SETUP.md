# Map checkout + live driver tracking (Grab-style)

## What it does
- **Secret Code → Delivery tab**: per theme, choose *City / province form* or *Map checkout*. In map mode, tick the categories that use the map (same switch as Admin → Categories).
- **Checkout** (map mode, and every cart item is from a ticked category): pin-on-map picker with address search and "use my location", delivery price by distance (Admin → Settings), name/phone/driver note. Anything else keeps the city / province form, so overseas orders still work.
- **Orders**: customer sees a live map with the driver, the route and an ETA. The driver is the admin: **Admin → Orders → Start live tracking** on the delivery phone.

## Setup
1. Supabase SQL Editor: run `supabase-map-checkout.sql` (also `supabase-grab-map-delivery.sql` and `supabase/migrations/20261008_background_delivery_tracking.sql` if not run yet).
2. Admin → Settings: set store location, delivery prices and driver picture.
3. Secret Code → Delivery: pick **Map checkout**, tick categories, press **Save**.
4. Deploy `supabase/functions/update-rider-location` (needed for background tracking in the native app).
5. `npm install`, then build/deploy as usual.

## Driver phone
- **Native app (Capacitor)**: keeps sending GPS in the background, even with the screen off. See `BACKGROUND-DELIVERY-TRACKING.md`.
- **Browser fallback**: works only while the page is open and the screen is on (the app keeps the screen awake). Browsers cannot track in the background.

## Free services used (fine for a small shop)
OpenStreetMap/CARTO tiles, Nominatim search, OSRM demo routing. All three have fair-use limits; for heavy traffic switch to a paid provider (Mapbox, Google, or a self-hosted OSRM).

## Notes
- Distance price uses straight-line distance from your store, not road distance.
- The rider position is hidden from the customer as soon as tracking stops or the order is completed/delivered/cancelled.

## Alfie (admin assistant)
- Only appears for a signed-in admin, on /admin pages. Customers never see or hear it.
- Speaks with a British voice. Speech needs one tap on the page first (browser rule); Alfie then greets you once per session. The speaker button above the mic mutes/unmutes the voice.
- Say "Alfie, help" for the command list. Examples: give me a summary, today's sales, unpaid orders, latest order, open order 1234, approve payment for order 1234, set order 1234 to shipped, start live tracking for order 1234, turn on map checkout for toys.
- Approvals, status changes and sign out always ask you to say "confirm" first.
