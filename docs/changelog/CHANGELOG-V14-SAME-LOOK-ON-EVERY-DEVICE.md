# V14 – same look on phone, tablet and computer + cart quantity fix

## 1. Quantity (+ / −) now stays inside the cart box (Chiikawa theme, phone)
- The pill never squeezes its buttons (round, fixed size), is a little more compact on phones, and always sits **inside the card on the right**; if the row is too narrow it drops under the price but stays right-aligned.
- Same rules for the Quantity pill on the product page. (`tools/chiikawa-art/chiikawa.src.css` → `src/chiikawa.css`)

## 2. Tablet / computer = the phone page, bigger (storefront + Theme editor preview)
- Before: each device got different CSS (2 / 3 / 4 columns, other paddings, wide layouts), so an edit made on the phone could never look the same elsewhere.
- Now, on screens **wider than 700px** with the Chiikawa/secret theme on, the store is the **phone page (390 design px) centred and scaled up** (1× → up to 2×). Same columns, same sizes, same spacing, same positions of mascots / buttons / pictures. **Phones are untouched.**
- How: `src/fit.css` (zoom + centred column), `applyFit()` in `themeElements.tsx` (sets `data-yn-fit` / `--yn-k` on `<html>`, never on /admin), and `tools/postcss-yn-fit.mjs` (wired in `vite.config.ts`) which at build time makes every phone `@media (max-width…)` rule also apply in this mode and switches the wide-screen `min-width` rules off. New phone rules you add later are mirrored automatically.
- Theme editor: Phone / Tablet / Computer buttons now show the same page. Dragging, resizing, duplicating a mascot and the screen⇄page switch convert on-screen pixels back to phone design pixels, so saved numbers mean the same everywhere. (`themeElements.tsx`, `MascotHandles.tsx`, `secretTheme.tsx`, `AdminSecretCode.tsx`)
- Free pictures no longer get their own extra scaling on tablet/PC (the whole page is scaled once), so they cannot be scaled twice.

## Tested / not tested
Tested in real Chrome with the project's real CSS: cart row and product grid at 360/390/430 (phone) and 390/768/1440 (2 columns, bar and qty pill identical, qty inside its card); CSS build step run on all stylesheets; syntax of every edited file; zoom / scroll / pointer maths.
NOT tested: `npm install`, `npm run build` and clicking through the live app / editor (no network here). Please run `npm run build`, then check Cart on a phone, open Admin → Secret Code → Phone / Tablet / Computer, and drag one mascot in the Tablet view.
