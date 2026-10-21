# Admin panel animations

Motion for the whole admin side. Customer storefront is untouched (everything is scoped to `.admin`).

## New files
- `src/admin-motion.css` – every animation (loaded last, so it wins over older admin rules)
- `src/adminMotion.tsx` – `<CountUp/>` numbers, button ripple, card spotlight, first-open sidebar intro

## Edited
- `src/main.tsx` – 2 imports, `useAdminMotion()` at the top of `AdminShell`, dashboard `Stat` + Orders stats use `<CountUp/>`

## What moves
- **Every page**: content fades/rises in, title slides in, panels/tables/banners stagger in; scroll-progress bar at the top.
- **Sidebar**: logo floats + glows, links glide in one by one on first open, hover slide + icon bounce, active bar springs in.
- **Dashboard**: numbers count up, stat icons pulse rings and wobble on hover, cards lift with a cursor spotlight,
  welcome banner has a drifting gradient + floating orbs, quick links tilt their icons.
- **Orders / Customers / Wallet / Transactions / Debt / Requests / Support**: cards and rows stagger in, hover lift or accent bar,
  waiting statuses (pending / payment pending / processing) breathe, chat bubbles pop in.
- **Catalog pages (Products, Snacks, Categories, Themes, Product Mascots, Banners, Coupons)**: tiles/cards pop in and lift on hover.
- **Everywhere**: buttons press + ripple, primary buttons get a shine sweep, inputs glow on focus, notices drop in,
  empty states float, bottom sheets slide up, live notification toast springs in with a ringing bell and a draining timer bar.
- Light/dark switch cross-fades colours; the theme icon spins when it swaps.

## Safe by design
- Honors "reduce motion" (all of it switches off).
- Only the first 14 items of a list animate; heavy infinite effects are limited to the first few cards.
- No new npm packages, no SQL. To remove everything: delete the `admin-motion.css` import line in `main.tsx`.
