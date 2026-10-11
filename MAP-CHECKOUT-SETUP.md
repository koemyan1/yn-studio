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
