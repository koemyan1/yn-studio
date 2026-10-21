# V13 – Snacks page, looping videos, per-photo background choice

## Do this once
Run **supabase-snacks-page.sql** in the Supabase SQL editor (adds `products.store_page`). Until then everything else works; only saving a snack shows a reminder.

## 1. Snacks page (Chiikawa theme only)
- Customers: a **Snacks** button at the end of the category buttons on Home (only while the Chiikawa theme is on) opens **/snacks**. The page has its own title / text and shows only snack products. Opening /snacks without the Chiikawa theme shows a friendly "unlock the theme" card.
- Admin → Catalog → **Snacks page**: list, **Add snack**, edit, publish / unpublish, delete – same form as a normal product (photos, price, options, SKU) without the category. Snack products never appear on Home or in the normal Products list.
- Theme Studio: Snacks is a real page in the editor (preview list, page background, elements, per-page edits), and its wording is editable in the Text tab (button label, small heading, title, intro). "Go to page" button actions can point to Snacks.

## 2. Videos that loop (Theme Studio → Elements → 🎬 Video)
- Upload an MP4 / WebM (up to 50 MB, stored in the existing theme-assets bucket) or paste a video link.
- Plays by itself and **loops forever** by default; options: loop on/off, silent on/off (phones only autoplay silent videos), show play/pause buttons, fill or show-whole, corner roundness.
- Move and resize it like any element; put it on one page (default: the page you're on) or every page; it can also do a tap action or a float/wiggle animation.

## 3. Remove background – choose per photo
The product form already removed backgrounds automatically. Now each new photo has its own button: **Keep background / Remove background**, plus the global "Remove the background of new photos" switch (and "transparent / one colour / random colour"). Works the same for Snacks.

Files: main.tsx, themeElements.tsx, secretTheme.tsx, AdminSecretCode.tsx, admin.css, chiikawa.css (+ tools/chiikawa-art/chiikawa.src.css), supabase-snacks-page.sql.
