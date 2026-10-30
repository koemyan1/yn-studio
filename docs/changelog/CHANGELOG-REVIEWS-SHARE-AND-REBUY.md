# Product reviews, share links and more sales per visit

## Set up (once)
1. Supabase -> SQL Editor: run `supabase/sql/supabase-product-reviews.sql` (safe to re-run). It creates the `product_reviews` table, the `product_rating_stats` view, the functions `can_review_product` / `submit_product_review`, and the public `review-photos` bucket.
2. Deploy. Set `PUBLIC_URL` on the server (already in `render.yaml`) to the shop address so link previews carry the right address.
3. Optional, Android/iOS app only: set `VITE_PUBLIC_URL` (default `https://ynstudio.site`) so the Share button inside the app shares the web address instead of `localhost`.

Until step 1 is done the app keeps working: the reviews section and stars simply stay hidden.

## 1. Reviews and star ratings
- Product page: stars + "(12 reviews)" under the name (tap to jump down), and a **Customer reviews** section: average, 5-to-1 bars, review list with "Verified buyer", optional photo (tap to enlarge), "Show more".
- **Only customers who bought the product can review it**, and the database checks that (a paid, not cancelled/rejected order that contains the product), not the browser. One review per customer per product; writing again edits it. Customers can delete their own review.
- Product cards show a small "star 4.8 (12)" once a product has a review.
- Admin > Sales > **Reviews** (`/admin/reviews`): all reviews with the product, Hide / Show / Delete. A hidden review stays hidden even if the customer edits it. The admin also gets a notification for each new review.
- To change who may review, edit `yn_has_bought_product()` in the SQL file and run it again.
- New: `src/Reviews.tsx`, `src/growth.css`, `supabase/sql/supabase-product-reviews.sql`.

## 2. Share button and link previews
- **Share** button on the product page: opens the phone's share sheet (Telegram, Messenger, WhatsApp...); on a browser without one it copies the link and shows "Link copied".
- **Link previews:** the server now writes the product name, price (with the old price if on sale), rating, description and photo into the page `<head>` for `/product/:id`, so a pasted link shows a proper card in Telegram / Facebook / WhatsApp. Every other page gets absolute default tags with the logo. Details: `server/ogPreview.js` (product data cached 5 min; at most 120 database lookups a minute; products that live only on a secret-theme page, such as Snacks, are never previewed; all text is HTML-escaped).
- **A shared link survives the login screen:** a logged-out visitor opening `/product/...` used to land on Home after signing in; now they land on that product (also after Google sign-in).
- The tab title shows the product name while on the product page.
- New: `server/ogPreview.js`, `tests/og-preview.test.mjs` (added to `npm test`). Edited: `server/index.js`, `index.html`, `src/main.tsx`.

## 3. More sales per visit
- **You may also like** (bottom of the product page): same category first, topped up with other products; never the current one, unpublished ones or Snacks-page items.
- **Recently viewed** (Home, under the "On sale" row, and bottom of the product page): the last products opened on this device; cleared on log out.
- **Buy again** on every order in Orders: puts all items back in the cart in one tap. Prices come from today's catalogue; items that were removed, unpublished or whose size/colour no longer exists are skipped and listed by name. Adding the same order twice adds to the quantity instead of making duplicate lines.
- New: `src/Growth.tsx`. Edited: `src/main.tsx`.

Checked: stand-in TypeScript check (no new errors), the new screens rendered in a browser with a fake database (review submit/edit/delete, stars, rails, Buy again merge/skip/price logic), `node --test` (59 pass).
Not checked: `npm run build` and the real server (Express and the Supabase packages were not installed where this was written), the SQL file on a real database, a real Telegram/Facebook preview, on-device test.
