# CORALINE secret theme

A moonlit, hand-stitched look: midnight-navy denim, torn cream paper, brass buttons, thread stitching, a haunted house under a full moon and a black cat with button eyes.

## Setup
1. Run `supabase-coraline-secret-theme.sql` in the Supabase SQL Editor (after `supabase-secret-themes-and-store-location.sql`). Safe to rerun. It creates the theme with code **CORALINE**.
2. Deploy. Customers enter `CORALINE` in the secret-code box (Customer Service page). Admin screens and normal mode are never themed.
3. It also appears as the preset **"Coraline moonlit house"** in Admin > Secret code, so the theme can be edited like Chiikawa/Spidey.

## What was added
- `src/coraline.src.css` (source) -> `src/coraline.css` (generated), imported in `src/main.tsx`.
- `tools/coraline-art/build_css.py` expands the selector shorthands and generates the hand-torn `clip-path` edges. After editing the source run, from the project root: `python3 tools/coraline-art/build_css.py`
- `public/coraline/`: `night.svg` (moon, house, trees; windows flicker, respects reduced-motion), `cat.svg`, `cat-x.svg`, `button.svg`, `button-gold.svg`, `paper.svg`, `denim.svg`, `banner.svg`. All original artwork.
- Preset entry `coraline` in `THEME_PRESETS` (`src/secretTheme.tsx`) and `supabase-coraline-secret-theme.sql`.

## Covered screens
Home (header, search, banner, category chips, product cards, sale tags, hearts), bottom bar, inner-page header, product page (gallery, options, sticky actions), cart, checkout (payment options, summary, coupon), orders, wallet, profile, rewards, notifications, support, all forms, buttons and status pills.

## Notes
- `radius` is intentionally unset in the preset: the engine would otherwise force plain rounded corners over the torn edges.
- Search, bottom bar, category chips, hearts, product cards, gallery and buttons use slightly stronger selectors than the Theme Studio's own part rules, so Studio colour tokens cannot repaint them. Other parts remain fully editable in the Studio.
- The banner (`banner.svg`) has "Free Delivery / For every electronic products" drawn in it using each phone's own handwriting font (web fonts cannot load inside a CSS background image). To use different text or your own artwork, upload a banner image in Admin > Secret code.
- Fonts (Gaegu, Schoolbell, Patrick Hand) load from Google Fonts through the theme's `fontUrl`.
- Product photos now fill the paper frame (`productImage.fit = cover`).
- The film's characters themselves are not drawn (copyrighted artwork); the theme uses original motifs only.
- Not built with `npm run build` here (no network for `npm install`). It was checked in headless Chromium against the real `style.css`/`cool.css`/`customer.css` and a copy of the engine's token rules. Please run `npm run build` once.
