# Secret Code page rebuilt as a real theme studio

**What was wrong:** the old admin page edited a hand-made mock of the store. Most of what it saved
(per-element styles, labels, hidden items, category/banner choices) was never read by the customer
side, so only colors + a hard-coded Chiikawa preset ever showed up. It also defaulted to "CHIIKAWA".

**What it does now**
- Live preview is the *real* storefront in an iframe (Home, Wishlist, Cart, Checkout, Orders, Wallet,
  Profile, Product, Customer service) at phone / tablet / desktop width. "Select parts" = tap anything to
  restyle it; "Try it" = browse normally.
- Starts from the default look (empty config = zero changes). Colors, fonts (+Google Fonts link),
  corner roundness, wallpaper, banner picture, product columns, page width, nav style.
- ~30 restylable parts (cards, buttons, search, hero, banner, category chips, product image/name/price,
  bottom nav, panels, inputs...) each with background / picture / text color / border / radius /
  shadow / size / weight / spacing / opacity / hide.
- Text overrides (store name, hero text, search placeholder, nav labels...).
- Per-page background color + picture, categories and banners assigned to the theme.
- Floating text/picture elements and a scoped Custom CSS box for anything else.
- Secret code: generate / copy, duplicate-code detection, active toggle, unsaved-changes indicator.
- Customer runtime (`src/secretTheme.tsx`) turns the saved config into CSS, so what you see is what
  customers get. No SQL changes needed.

**Files:** `src/secretTheme.tsx` (new), `src/AdminSecretCode.tsx` (new), `src/main.tsx`
(old runtime + mock editor removed; Home/Nav read theme text, banners, categories), `src/style.css` (appended).

**Compatibility:** saved themes still load. Legacy mock-only fields (`previewStyles`,
`hiddenPreviewElements`) are ignored; recolor those parts under "Parts" instead.

**Not verified here:** `npm install` / `npm run build` could not run (no network). The new code passed a
syntax check and a unit test of the CSS generator; run `npm install && npm run build` before deploying.
