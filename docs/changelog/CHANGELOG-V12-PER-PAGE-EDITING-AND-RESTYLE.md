# V12 – per-page editing in the Theme Studio + full Chiikawa restyle

## 1. Edit page by page (Admin → Secret theme editor)
New bar above the preview: **"Your changes go to  [Only Home | Every page]"** (it follows the page you open in the preview).
- **Only <page>** (default): parts, mascot picture / position / size / hide, wording and "tapped parts" you change are saved for THAT page only.
- **Every page**: the old behaviour – one change used everywhere.
- A page's own edits sit on top of the shared ones. **"Clear <page>'s own changes"** puts that page back to the shared look. Other pages are never touched.
- **New buttons / texts / pictures are now created for the page you're on** (Home → only Home). Before, they appeared on every page. The Elements list shows where each one lives and has "Only on <page>" / "Every page" buttons. Elements of other pages are no longer drawn (or draggable) in the preview.
- Added Notifications, Rewards and Debt as separate pages (they used to count as Home).
- Existing themes keep working: what was saved before stays shared until you override it on a page. Colours, fonts and dark mode stay shared; page backgrounds were already per page.
- Saved in the theme JSON as `pageOverrides` – no SQL change needed.
Files: `secretTheme.tsx` (effectiveTheme, pageOverrides, pageKeyFor), `AdminSecretCode.tsx`, `themeElements.tsx`, `admin.css`.

## 2. Chiikawa restyle (every customer page, mascots untouched)
Rebuilt `chiikawa.css` after the sample: hand-drawn wordmark with white halo, thin blue-outline search, banner, text-only category buttons, pastel product cards (single-line name, pink price, heart top-right), cream bottom nav with pink active tab, same on cart, product, checkout, orders, wallet, profile, rewards, notifications, support chat and debt.
- Removed leftover purple (icons, ABA button text, dashed upload box, profile icons) and the glued-on pink look on qty / remove / tab buttons.
- Fixed overflow on cart, product and checkout bar at 360–430px wide.
- Sky + moving clouds, grass and all mascot hooks (`--ck-m-*`, `--ck-dx/dy/s/d-*`) are unchanged, so the mascot pictures you upload later work as before.
- Gaegu font is now also loaded from `index.html`.
- Source with short selectors: `tools/chiikawa-art/chiikawa.src.css` → `python3 tools/chiikawa-art/build_css.py`.
