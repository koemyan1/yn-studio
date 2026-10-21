# CHIIKAWA secret theme — setup (v2, full-site storybook look)

Secret code: **CHIIKAWA** (not case sensitive). Customers enter it in **Messages → Secret theme**.

## 1. Run the SQL once
Supabase → SQL Editor → run `supabase-chiikawa-complete.sql` (safe to re-run). It
* adds `categories.theme_only_id` (a category that exists only inside one secret theme),
* creates/refreshes the **Chiikawa Secret Theme** (code `CHIIKAWA`) with the new look and the "Delivery 9-10 days" banner,
* creates the extra **Food** and **Drink** categories for this theme only.

Prerequisite: `supabase-secret-themes-and-store-location.sql` was already run (it was for the earlier theme).

## 2. Deploy
`npm install && npm run build` (then your normal Render deploy). New files: `src/chiikawa.css`, `public/chiikawa/*`.

## What customers get
Every customer page (home, product, wishlist, cart, checkout, orders, wallet, profile, rewards, chat, notifications)
gets: sky + grass background, handwriting font, sticker-style pastel cards, mascot-faced category chips,
cute bottom bar with the mascot trio. Normal mode and the admin panel are unchanged.

## Admin
* **Admin → Themes** shows the theme card (preview with its banner, code hidden by default, "theme-only categories" tag).
* **Edit → Look → Home banner**: upload your own picture, or tap one of the 4 ready-made banners
  (Delivery 9-10 days / Yummy food / Sip sip drinks / Welcome). Press **Save theme**.
* **Edit → Categories → Categories only for this theme**: add more theme-only categories (+ Food, + Drink, or any name).
* **Admin → Categories**: every category card has *Only for one theme*; the "Add category" bar has a "Show everywhere / Only in: …" picker.

## Products
* Products you add normally appear in normal mode AND in the Chiikawa theme (nothing to do).
* To sell something only to your Chiikawa customer: Admin → Products → set Category to **Food** or **Drink**
  (they are marked "secret theme only"). Those products appear only while the theme is unlocked.

## Notes / limits
* Theme-only categories are hidden by the storefront (home list, chips, search). They are not a security boundary:
  someone who already has a direct product link can still open that product page.
* The handwriting fonts (Gaegu / Patrick Hand) load from Google Fonts; offline devices fall back to a rounded system font.
* Mascots are original drawings in a kawaii style — not official Chiikawa artwork. To use licensed art, replace the
  files in `public/chiikawa/` (same names) and nothing else needs to change.
* Banner words are part of the picture. Re-generate with `tools/chiikawa-art/gen_banners.py` or upload your own.
