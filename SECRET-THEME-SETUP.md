# Secret Theme + Store Location setup

1. Open Supabase Dashboard → SQL Editor.
2. Run `supabase-secret-themes-and-store-location.sql` against the project's existing database.
3. Make sure the signed-in admin's `profiles.role` is `admin`. The SQL uses this existing role model for admin-only theme editing.
4. Deploy the updated frontend.
5. In Admin → Secret Code, create a theme, set a unique secret code, customize colors, background, text/image elements, drag elements on the preview canvas, then save.
6. In Admin → Categories, check the theme(s) allowed to show each category. If no category is assigned to a theme, all categories remain visible in that theme.
7. In Admin → Settings, paste the store's Google Maps share link and save delivery settings.

Customers activate a theme from Customer Service using its code. The selection is saved in `customer_theme_preferences` by authenticated user, so it follows their account on another device. Customers can restore the default appearance at any time using **Go back to normal mode** in Customer Service.

Notes:
- Uploaded canvas images are embedded as data URLs in the theme JSON. Keep images optimized/small so the Supabase row does not become excessively large.
- The Google Maps link is stored in `delivery_settings.store_map_url`; latitude/longitude fields continue to be used for delivery-distance calculations.
