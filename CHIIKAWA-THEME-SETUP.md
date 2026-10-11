# CHIIKAWA Secret Theme Setup

This project update adds a pastel kawaii preset that is only activated when a signed-in customer enters the secret code `CHIIKAWA`. Normal storefront styling remains the default outside the activated theme. The existing admin secret-theme editor and category-to-theme mapping remain in use.

## Apply to Supabase
1. Open Supabase Dashboard → SQL Editor.
2. Confirm `supabase-secret-themes-and-store-location.sql` has already been applied.
3. Run `supabase-chiikawa-secret-theme.sql`.
4. Confirm the signed-in admin has `profiles.role = 'admin'`.
5. Deploy the frontend from this ZIP.

## Set categories for the theme
Open Admin → Categories → Category visibility by theme. Tick `Chiikawa Secret Theme` beside each category that should appear while this theme is active. The current app behavior is: if no categories are assigned to a theme, all categories remain visible in that theme. Assign at least one category to make the list restrictive.

## Upload a separate theme banner
Open Admin → Secret Code, select `Chiikawa Secret Theme`, use **Upload banner for this secret theme**, then click **Save theme to Supabase**. Use an optimized image under 2 MB, ideally around 1600 × 500. The image is stored in the theme's `config.bannerImage` JSON field and shown only while the secret theme is active. It does not modify the normal marketplace banners.

## Important notes
- This code prepares the database seed and frontend changes; it does not connect to or modify your live Supabase project from this environment.
- The banner is stored as a data URL in JSON, so keep it small. A future improvement would move theme images to Supabase Storage and store only their public URL.
- The preset uses a more complete Chiikawa-inspired pastel style across the main customer-facing shopping screens. Add artwork you have permission to use through the theme image upload controls; this package does not include official licensed character assets. See `CHANGELOG-CHIIKAWA-COMPLETE.md` for changes and validation status.
