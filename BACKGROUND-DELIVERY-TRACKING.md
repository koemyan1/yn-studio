# YN Studio background delivery tracking

This version prepares YN Studio for native background GPS using Capacitor 8 and the free/open-source `@capgo/background-geolocation` plugin. The plugin supports background tracking on iOS and Android; on Android it keeps a foreground service alive, and on iOS it uses Core Location background updates.

## Cost
The plugin itself is free. Capacitor is open source. Building/testing locally does not require a paid plugin license. Publishing to app stores can have their own developer fees.

## Setup
1. Run `npm install`.
2. Run `npm run mobile:setup` to create Android/iOS projects and sync plugins. If a platform already exists, run `npx cap sync` instead.
3. In Supabase, run `supabase/migrations/20261008_background_delivery_tracking.sql`.
4. Deploy the `supabase/functions/update-rider-location` function.
5. Build/install the native app.
6. On iOS enable Location Updates background mode; the app must request the appropriate location permission. On Android 13+ allow notifications so the persistent tracking notification can be shown.
7. Admin opens an eligible order and taps **Start live tracking**. The app requests location permission and keeps updating until the admin taps Stop or the order reaches completed/delivered/cancelled/rejected.

## Important platform behavior
- Android can keep the native foreground service alive even if the app is swiped away, according to the plugin documentation.
- iOS supports background location updates when the app is backgrounded, but iOS may stop updates if the user force-quits the app; this is an OS restriction.
- Tracking is explicitly opt-in per active delivery and is not continuous when no delivery is active.
