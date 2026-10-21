# Chiikawa theme v2
- New `src/chiikawa.css` (replaces the old preset rules in `style.css`): sky/grass background, sticker cards with pastel rotation, mascot chips and corners, handwriting font, themed buttons/inputs/panels/wallet/empty states/bottom nav for all customer pages.
- New original artwork in `public/chiikawa/` (mascots, food & drink icons, sky, grass, 4 banners) + generators in `tools/chiikawa-art/`.
- Theme-only categories: `categories.theme_only_id` + storefront filtering (`main.tsx` Shop), Admin → Categories picker, Secret Code → Categories panel, Themes gallery tag, "(secret theme only)" label in the product form.
- Ready-made banner picker in Secret Code → Look; Themes gallery preview shows the banner and Chiikawa look.
- Category chip icons chosen from the category name (food, burger, sweet, drink, coffee, ice cream).
- `supabase-chiikawa-complete.sql` seeds the theme (code CHIIKAWA), banner, Food and Drink.

## Not verified here
`npm install` / `npm run build` could not be run in my environment (no network). TypeScript syntax of all edited files was checked and
the look was verified with static mock pages in a real browser, but please run `npm run build` before deploying.
