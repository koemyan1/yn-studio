# Changelog

Newest first. Versioned releases (v3 to v22) are included in full below. Smaller feature notes are indexed at the end; each one is a full file in [`docs/changelog/`](docs/changelog/).

## Unreleased: easy-to-find "Write a review" + calmer loading screen

- **"Write a review" is now always visible**: under the product name, in the Customer reviews section, and under every item of a paid order (Orders + order screen). Buyers-only rule unchanged; non-buyers get a clear note instead of a missing button. **Run `supabase/sql/supabase-product-reviews.sql` again** (safe) so buyers with `delivered` / "counts as paid" order statuses can review.
- **New loading screen**: logo in a slim spinning ring, no floating blobs/glow/shine, shorter minimum time. Details: [docs/changelog/CHANGELOG-REVIEW-BUTTONS-AND-NEW-LOADER.md](docs/changelog/CHANGELOG-REVIEW-BUTTONS-AND-NEW-LOADER.md).
- Files: `index.html`, `src/main.tsx`, `src/Reviews.tsx`, `src/growth.css`, `supabase/sql/supabase-product-reviews.sql`.

## Unreleased: reviews, share links, more sales per visit

- **Run `supabase/sql/supabase-product-reviews.sql` once.** Star ratings + reviews on products (only customers who bought can review; photos; Admin > Reviews to hide/delete), a Share button, real link previews for shared product links (server writes name/price/rating/photo into the page), shared links now survive the login screen, plus "You may also like", "Recently viewed" and "Buy again" on past orders. Full notes: [docs/changelog/CHANGELOG-REVIEWS-SHARE-AND-REBUY.md](docs/changelog/CHANGELOG-REVIEWS-SHARE-AND-REBUY.md).
- **Animated loading screen** (YN logo) for first open, no more flash when the app starts: [docs/changelog/CHANGELOG-ANIMATED-LOADING-SCREEN.md](docs/changelog/CHANGELOG-ANIMATED-LOADING-SCREEN.md).
- Files: `src/Reviews.tsx`, `src/Growth.tsx`, `src/growth.css`, `server/ogPreview.js`, `src/main.tsx`, `server/index.js`, `index.html`, `public/preload.js`.

## Unreleased: Home page first pass

- Bell dot now shows only when there are unread notifications (with a count, 9+ max), live, on Home and every page header (`useUnreadCount`).
- Grey product skeleton cards while Home loads (replaces the "Finding something good" card); "No results for ..." message when a search finds nothing; clear (x) button in the search box.
- New "On sale" row (products with a lower price than the original, up to 10) above the grid; hidden while searching or filtering. Text key `saleTitle` is editable in Theme Studio.
- First banner loads eagerly / high priority, the rest lazily.
- Files: `src/main.tsx`, `src/home.css` (new), `src/notifications.css`.

## Unreleased: faster page opening + notifications restyle

- **Pages no longer show the full-screen loader on every navigation.** The login check is remembered for the tab (customer and admin), so moving between pages renders straight away; it still re-verifies in the background and on sign-out.
- **Smaller first download:** admin screens (Secret Code, Themes, Security, Assistant, Product Mascots), Services, CV Maker and the Leaflet map now load only when opened. `calcFee` moved to `src/deliveryFee.ts` so checkout pricing does not pull in the map. React / Supabase / icons / Leaflet get their own cached chunks (`vite.config.ts`).
- **Service worker v4:** built `/assets/` files are served from cache instantly; images/fonts show cached copy then refresh; HTML stays network-first so deploys appear.
- **Server:** gzip (`compression`, run `npm install`), 1-year immutable caching for `/assets/`, no-cache for HTML/sw.
- **Fonts** no longer block first paint (`index.html`).
- **Notifications page rewritten:** query fixed (own notifications only), loading skeleton, error + retry, All/Unread tabs, Mark all read, grouped Today/Yesterday/Earlier, relative times, type icons, tap opens the linked page, live updates. Styles in `src/notifications.css`.

## Unreleased: action feedback animations

- New `src/actionFx.tsx` + `src/actionFx.css` (free, no libraries). After something is done, a badge pops with a ring, a drawn icon, sparkles and a label, plus a light vibration on phones.
- **Hooked in directly:** remove from cart (the tapped row slides out, then a "Removed" badge), wishlist heart (small badge on the heart: saved / removed), coupon applied, reward received, support message sent (paper plane flies off the Send button).
- **Automatic for everything else:** when a toast or notice appears within a few seconds of a tap and says saved / added / sent / applied / removed / copied / created / success (English or Khmer), the matching badge plays. Error messages shake instead. Skipped on page open, while a payment / admin / cart scene is on screen, and for "Added to cart" (fly-to-cart already covers it).
- Fully off for "reduce motion". Files: `src/actionFx.tsx`, `src/actionFx.css`, `src/main.tsx` (import, `initActionFx()`, `<ActionFxHost/>`, and one-line calls in cart delete, wishlist toggle, coupon apply, reward claim, support send).

## Unreleased: site-wide motion layer

- New dependency-free layer (`src/motion.ts` + `src/motion.css`), $0, nothing to install or run in Supabase. Existing animations (page-in, product pop-in, fly-to-cart, rolling numbers, wallet scenes) are untouched.
- **Scroll reveal:** cart rows, order cards, transactions, notifications, reward cards, profile panels and section headings fade/slide in (staggered) the first time they scroll into view. Only items below the fold are hidden, and a 9 s safety net reveals anything that never intersects.
- **Tap ripple** on buttons, header icons, bottom-nav items and cards; **scroll-progress bar** at the top edge.
- Toast spring-in, notice slide-in, selection pop on size/colour chips, category rail and tabs, smooth focus glow on inputs (Wallet amount field lifts), gentle shake on an invalid field, header icon nudge + bell ring on hover, soft hover lift on list rows.
- Uses the independent CSS properties `translate` / `scale`, so Coraline / Spidey / Chiikawa themes keep their own `transform`. Admin pages are excluded from reveal and ripple.
- Fully off when the device asks for "reduce motion". Reveal uses `data-mv` (the Services page keeps its own `data-rv`).
- Files: `src/motion.ts`, `src/motion.css`, `src/main.tsx` (3 small edits: import, import, `initMotion()`).

## Unreleased: live Wallet page + "money received" animation

- The customer Wallet page now updates **by itself** (Supabase Realtime): balance and history refresh the moment money moves, and again when the customer returns to the tab. No manual reload.
- When another customer sends money while the page is open, a green banner slides in from the top: coins fall, the amount counts up, "From <name>", short vibration, closes after 6 s or on tap.
- **Run once:** `supabase/sql/supabase-wallet-realtime.sql` (RUN-ORDER 33c). Until it is run the page still works; it just refreshes when the tab is reopened.
- Files: `src/main.tsx` (WalletPage), `src/WalletTransfer.tsx` (`MoneyReceived`), `src/wallet.css`, `supabase/sql/supabase-wallet-realtime.sql`, `supabase/sql/RUN-ORDER.md`.

## Unreleased: wallet QR on demand + "money sent" animation

- The wallet QR is no longer on the page. A **QR icon sits in the Wallet header, right next to the language button**; tapping it (or **My QR** on the page) opens the QR as a sheet. The code is only requested the first time it is opened.
- The page now shows a slim strip instead: **Scan to send** and **My QR**. The sheet keeps **Scan to send**, **Save QR** and **Copy code**; Esc or a tap outside closes it.
- New success animation after a transfer: coins fly from "You" to the receiver along a dotted track, the receiver bounces, gets a green tick, a ring and a small confetti burst, then the amount counts up. A short vibration on phones that support it. Respects "reduce motion".
- Files: `src/WalletTransfer.tsx`, `src/wallet.css`, `src/main.tsx` (`Top` takes an optional `right` slot; Wallet page uses it).

## Unreleased: removed Wedding Invitations and the Video Editor

- Removed both admin pages (sidebar links, dashboard shortcuts and routes), the public invitation pages (`/i/...`), the "My invitations" block on the customer Services page, and the server's invitation link-preview route.
- Deleted their code and assets: `Invitations.tsx`, `InviteArt.tsx`, `InviteCanvas.tsx`, `Cinematic.tsx`, `cinematic/`, `invitations.css`, `AdminVideoEditor.tsx`, `avatar.tsx`, `public/avatar-doodle.svg`, `tools/cinematic-qa/`, `supabase-wedding-invitations.sql` (and its RUN-ORDER row).
- Your live Supabase data is untouched: the `wedding_invitations` table and its storage stay in the database, unused. Old changelog notes for these two features are kept as history.
- `qrcode` and `html-to-image` stay installed (the wallet QR and the CV PDF use them).

## Unreleased: wallet transfers by QR code

- Every customer has their own wallet QR on the **Wallet page** (`YNPAY:<random code>`; no user id, email or balance inside). Buttons: **Scan to send**, **Save QR**, **Copy code**.
- **Scan to send** opens the camera (also works from a saved photo or by typing the code), shows who you are paying, lets you pick the **dollar or riel wallet**, enter the amount (+ optional note), review, then confirm. Dollars stay dollars and riel stays riel.
- The money moves in one database transaction (both wallets locked in a fixed order, no double-spend). Limits: $0.01 / 100 riel minimum, $1,000 / 4,000,000 riel maximum, 20 transfers per hour. Both people get a wallet history row and a notification; the admin Transactions page shows them too.
- **Run once:** `supabase/sql/supabase-wallet-transfer.sql` (RUN-ORDER 33b). Until it is run, the QR panel shows "not set up yet".
- Files: `src/WalletTransfer.tsx` (new), `src/wallet.css`, `src/main.tsx` (import, panel on the Wallet page, readable type names on the transaction page), `supabase/sql/supabase-wallet-transfer.sql`.

## Unreleased: location + device on security events

- Every time the security shield detects or blocks someone it now records **approximate location** (country, region, city, latitude, longitude, clickable Google Maps link) and **device** (mobile / tablet / desktop / bot, OS + version, browser + version, brand / model when available). Shown in `/admin/security` (*Location & device*, *Map* link) and in the auto-block alert. Stored in each event's `details`, so no SQL is needed.
- Location comes from Cloudflare headers (turn on the free *Add visitor location headers* Managed Transform) with an optional free lookup fallback (`GEO_LOOKUP=off` disables it). Forged location headers are ignored unless the request really came through Cloudflare.
- Build fix: added `src/qrcode.d.ts` (tsc error TS7016 for the `qrcode` import in `Invitations.tsx`).
- Files: `server/security/{device,geo,intel}.js`, `store.js`, `shield.js`, `alerts.js`, `adminApi.js`, `src/AdminSecurity.tsx`, setup doc section 7b, 12 new tests.

## Unreleased: cinematic click-to-edit

- **Edit on preview** (Cinematic mode, button above the phone). Hover any part of the invitation to see it outlined, click it to select it; a panel opens beside the phone with exactly the fields behind that part (names, date, venue, parents, words, photos, programme items, love-story moments, gallery photos, gift QR codes, colours, wax seal, thank-you text, …). Changes show live and use the same data as the form.
- **All fixed wording is editable** (headings, labels, button texts) per language. Saved in `cine.texts`; "Standard wording" resets one.
- Empty sections show a "+ Add ..." band in edit mode so everything can be reached. Added "Open envelope" button for edit mode (a click only selects).
- Preview keeps its scroll position while you edit (it used to jump to the top on every keystroke).
- Fix: love-story strip layout (track was wider than the screen, heading not centred).
- **Add elements** (Edit on preview → Add): text, picture, button (link / @telegram / phone), shapes (circle, box, line, heart, diamond) and emoji stickers. They are placed on the section you are looking at, scroll with it, and are saved in `cine.extras`. Each has font, size, colour, gold foil, rounding, see-through, turn, movement (float, pulse, wiggle, sway, spin), layer order, duplicate and delete.
- **Drag / resize / turn on the preview**: drag to move (snaps to the centre line), corner dot to resize, top dot to turn (snaps to 15°), arrow keys to nudge, Delete to remove.
- **Built-in parts can be moved, resized, turned too** (arch photo, words, parents, couple frames, countdown, venue, map, love-story photos, thank-you text and logo, cover blocks), and photos have a "photo focus" to slide the picture inside its frame. Saved in `cine.tweaks`; "Reset position & size" undoes it.
- Guests never get the editing markup. Files: `src/cinematic/*`, `src/Cinematic.tsx`, `src/Invitations.tsx` (`CineInspector`), `src/invitations.css`.

## Unreleased: repo upgrade + server-side order pricing

- **Checkout is now priced by the database.** New `yn_place_order()` (`supabase/sql/supabase-server-side-order.sql`) rebuilds unit prices, delivery fee, subtotal and total from the catalogue and settings, applies the coupon, creates the order and its items, and clears the cart in one transaction. The browser no longer decides what an order costs. If the SQL is not installed yet, checkout falls back to the old path so nothing breaks during rollout.
- Direct browser inserts into `orders` / `order_items` are logged (`report`) and can be blocked (`enforce`, `order_insert_mode` setting). Admin "create order" is exempt.
- New `require_delivery_pin` setting, an unpaid-order brake (15 per hour), and a drift check between the total the customer saw and the server total.
- **Repo reorganised:** setup guides -> `docs/setup/`, change notes -> `docs/changelog/`, SQL scripts -> `supabase/sql/` with a documented run order, stray files -> `docs/archive/`. Nothing deleted. README rewritten.
- New `npm run schema:coverage` (finds tables/functions/buckets the app uses that no SQL file creates) and `tests/repo-hygiene.test.mjs`.
- Docs corrected: delivery price uses straight-line distance (OSRM only draws the route/ETA).
- **Not verified:** the SQL was not run against a real database and the frontend was only syntax-checked (no dependencies were installed). Run `tests/sql/place-order.test.sql` on a test project and `npm run build` before deploying.

## V22 – Admin AI assistant (Jarvis)

<sub>source: `docs/changelog/CHANGELOG-V22-ADMIN-ASSISTANT.md`</sub>

#### What's new
- **Floating bot avatar** on every admin page. Drag it anywhere (position is remembered); tap it to open the chat.
  On phones the chat opens as a bottom sheet. Hide it any time in AI Assistant → settings.
- **Better chat**: bubbles with times, typing dots, quick-command chips, step lines ("➜ Clicking Save"), voice in (mic), hands-free wake word, speak-replies toggle, clear chat.
- **Touch to stop**: while the assistant is working, any real touch / click / key press / scroll stops it at once
  (also the Stop button). Everything it does to the page checks for this, so a stopped task can't keep clicking.
- **New admin page: AI Assistant** (sidebar → System) to teach it commands:
  - *Reply*: answer with text (supports `{slots}` like "customer {name}")
  - *Steps*: go to a page, click, type, scroll, wait, dark mode, refresh
  - *Code*: your own JavaScript with `ctx.say / go / click / type / supabase …`
  - Enable/disable, edit, duplicate, delete, test, export / import JSON, "things it didn't understand" list.
- **Built-in store commands**: pending orders, sales (today/total), latest orders, find order YN-…, customers / products count,
  unread notifications, open any admin page, dark/light mode, refresh, plus weather, calculator, timers, notes, who-is.
- Destructive-looking clicks (delete, refund, cancel, sign out…) ask for a "yes" first.

#### Setup (once)
1. Run `supabase-admin-assistant.sql` in the Supabase SQL editor (creates `assistant_skills`, admin-only).
2. Deploy as usual. No new npm packages.

#### Files
- new: `src/assistantEngine.ts`, `src/AdminAssistant.tsx`, `src/AdminAssistantTeach.tsx`, `src/assistant.admin.css`, `supabase-admin-assistant.sql`
- edited: `src/main.tsx` (imports, sidebar item, `/admin/assistant` route, bot mounted in `App`)

#### Notes
- Admin only: the bot renders only for signed-in profiles with `role = 'admin'`, only on `/admin/*`, never in the theme-editor preview.
  The skills table has an admin-only RLS policy, so customers cannot read the commands or the code.
- Taught *code* runs in the admin's browser with the admin's session – only teach it code you trust.
- Voice needs Chrome / Edge / Safari and HTTPS.

## Location input update

<sub>source: `docs/changelog/CHANGELOG-V21.md`</sub>

- Removed the customer map picker and GPS-based location selection from delivery information and checkout.
- Customers can enter a city or province in a simple text field.
- Delivery city/province, customer name, phone, and optional delivery notes are saved to the existing Supabase `profiles` row using the existing `delivery_address` and `delivery_notes` fields.
- Checkout no longer requires latitude/longitude. Orders created with text-only locations do not enable live rider map tracking.
- When a delivery settings row exists, checkout uses its base delivery fee because a city/province text field cannot calculate route distance.

## YN Studio v20 — Admin customer accounts, manual orders, and map refresh

<sub>source: `docs/changelog/CHANGELOG-V20.md`</sub>

#### Admin → Customers
- Added a visible **Create Customer Account** action.
- Form captures name, email, and a temporary password (minimum 6 characters).
- New server endpoint `POST /api/admin/customers` validates the caller's bearer token, checks that the caller has the `admin` role in `profiles`, creates the Supabase Auth user with email confirmed, and creates the linked customer profile.
- The service-role key remains server-side. If profile creation fails, the newly created Auth user is removed to avoid an orphan account.

#### Admin → Orders
- Added a visible **Create Order** action.
- Admin selects an existing customer and published product, sets quantity and delivery fee, and can enter an address and phone.
- Creates the order and its line item, then refreshes the normal order list. If line-item creation fails, it attempts to remove the incomplete order.

#### Map
- Uses CARTO Voyager map tiles for a more detailed, navigation-app-style map.
- Added a purple YN pin with a motorbike glyph, clearer search box and rounded purple styling.
- Cambodia search restriction remains in the customer location picker.

#### Deploy notes
- Deploy both `src/` and `server/index.js`; the account endpoint requires the updated Node server.
- Existing server environment variables remain required, including `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_USER`, `SMTP_PASS`, and `OTP_SECRET`.
- Verify the logged-in admin has `profiles.role = 'admin'` and that RLS permits admins to insert into `orders` and `order_items`.
- A production build could not be verified in this workspace because `npm install` timed out. Check Render build logs before promoting this version to live.


#### v21 hotfix notes
- Admin-created orders no longer send `delivery_name`, which was not present in the deployed `orders` table schema.
- Customer creation builds an absolute API URL and gives a clear configuration message instead of passing a relative `/api/...` URL to an installed app/WebView. For installed builds, set `VITE_API_BASE_URL` to the public HTTPS URL of the Render server before building. On the Render website itself, the app uses the current origin automatically.
- Rebuild/redeploy the web app after changing Vite environment variables; they are embedded at build time.

## YN Studio v18 changes

<sub>source: `docs/changelog/CHANGELOG-V18.md`</sub>

- Location picker defaults to Cambodia, constrains map panning to Cambodia, and restricts place search to Cambodia (`countrycodes=kh`).
- Checkout now shows saved delivery information in a compact address tile and opens the map only after the customer chooses Add location / Add more address.
- Cart and checkout now permanently remove cart rows whose products are no longer published, so republishing later does not restore old cart items.
- Added `supabase-v18-coupon-fixes.sql` to make coupon deletion possible while retaining redemption history and to address legacy coupon `updated_at` trigger errors.
- Delivery distance fee settings remain available under Admin → Settings.

#### Required database step
Run `supabase-v18-coupon-fixes.sql` in Supabase SQL Editor. Review the SQL and take a database backup first.

#### Verification
A complete production build could not be completed in this workspace because dependency installation timed out. Deploy to a preview/staging service first and check Render build logs before replacing the live version.

## YN Studio v17 — Theme draft/publish workflow

<sub>source: `docs/changelog/CHANGELOG-V17.md`</sub>

- Theme edits are saved into `draft_config` and do not change the customer-facing published `config` until the admin presses **Publish theme**.
- New themes start unpublished; admins can **Save draft** or explicitly **Publish theme**.
- Theme list labels published themes versus draft/unpublished themes.
- Added `supabase-theme-drafts.sql`. Run it in Supabase SQL Editor before using this version.

#### Important
This is the first stage of the larger admin/customer redesign. It does not yet complete admin password-based account creation, the admin-created order workflow, or a full drag/drop editor that edits every element on every customer route. Those require additional UI and secure server-side implementation; they are not represented as completed here.

## YN Studio v16 changes

<sub>source: `docs/changelog/CHANGELOG-V16.md`</sub>

- Checkout submit button remains clickable when requirements are incomplete; pressing it shows the specific validation message instead of silently disabling the button.
- Customer profile no longer displays the delivery-location/map gate. Delivery selection and address entry are in checkout/payment.
- Checkout delivery form includes a “Save this as my default delivery address” option. Run `supabase-checkout-default-address.sql` in Supabase before using the new default flag.
- Admin coupons now have a permanent Delete action in addition to Enable/Disable.
- Unpublished products are hidden from cart/checkout data while their cart rows are preserved; publishing them again makes previously-added items visible again.

#### Still requires server-side work

Admin-created customer accounts with passwords must be implemented through a Supabase Edge Function using the service-role key (never expose that key in the browser). The existing customer deletion action uses the `admin_delete_customer` RPC. An admin order-creation workflow and a fully editable editor for every actual customer route are not completed in this incremental patch.

## V14 – same look on phone, tablet and computer + cart quantity fix

<sub>source: `docs/changelog/CHANGELOG-V14-SAME-LOOK-ON-EVERY-DEVICE.md`</sub>

#### 1. Quantity (+ / −) now stays inside the cart box (Chiikawa theme, phone)
- The pill never squeezes its buttons (round, fixed size), is a little more compact on phones, and always sits **inside the card on the right**; if the row is too narrow it drops under the price but stays right-aligned.
- Same rules for the Quantity pill on the product page. (`tools/chiikawa-art/chiikawa.src.css` → `src/chiikawa.css`)

#### 2. Tablet / computer = the phone page, bigger (storefront + Theme editor preview)
- Before: each device got different CSS (2 / 3 / 4 columns, other paddings, wide layouts), so an edit made on the phone could never look the same elsewhere.
- Now, on screens **wider than 700px** with the Chiikawa/secret theme on, the store is the **phone page (390 design px) centred and scaled up** (1× → up to 2×). Same columns, same sizes, same spacing, same positions of mascots / buttons / pictures. **Phones are untouched.**
- How: `src/fit.css` (zoom + centred column), `applyFit()` in `themeElements.tsx` (sets `data-yn-fit` / `--yn-k` on `<html>`, never on /admin), and `tools/postcss-yn-fit.mjs` (wired in `vite.config.ts`) which at build time makes every phone `@media (max-width…)` rule also apply in this mode and switches the wide-screen `min-width` rules off. New phone rules you add later are mirrored automatically.
- Theme editor: Phone / Tablet / Computer buttons now show the same page. Dragging, resizing, duplicating a mascot and the screen⇄page switch convert on-screen pixels back to phone design pixels, so saved numbers mean the same everywhere. (`themeElements.tsx`, `MascotHandles.tsx`, `secretTheme.tsx`, `AdminSecretCode.tsx`)
- Free pictures no longer get their own extra scaling on tablet/PC (the whole page is scaled once), so they cannot be scaled twice.

#### Tested / not tested
Tested in real Chrome with the project's real CSS: cart row and product grid at 360/390/430 (phone) and 390/768/1440 (2 columns, bar and qty pill identical, qty inside its card); CSS build step run on all stylesheets; syntax of every edited file; zoom / scroll / pointer maths.
NOT tested: `npm install`, `npm run build` and clicking through the live app / editor (no network here). Please run `npm run build`, then check Cart on a phone, open Admin → Secret Code → Phone / Tablet / Computer, and drag one mascot in the Tablet view.

## V13 – Snacks page, looping videos, per-photo background choice

<sub>source: `docs/changelog/CHANGELOG-V13-SNACKS-PAGE-AND-VIDEO.md`</sub>

#### Do this once
Run **supabase-snacks-page.sql** in the Supabase SQL editor (adds `products.store_page`). Until then everything else works; only saving a snack shows a reminder.

#### 1. Snacks page (Chiikawa theme only)
- Customers: a **Snacks** button at the end of the category buttons on Home (only while the Chiikawa theme is on) opens **/snacks**. The page has its own title / text and shows only snack products. Opening /snacks without the Chiikawa theme shows a friendly "unlock the theme" card.
- Admin → Catalog → **Snacks page**: list, **Add snack**, edit, publish / unpublish, delete – same form as a normal product (photos, price, options, SKU) without the category. Snack products never appear on Home or in the normal Products list.
- Theme Studio: Snacks is a real page in the editor (preview list, page background, elements, per-page edits), and its wording is editable in the Text tab (button label, small heading, title, intro). "Go to page" button actions can point to Snacks.

#### 2. Videos that loop (Theme Studio → Elements → 🎬 Video)
- Upload an MP4 / WebM (up to 50 MB, stored in the existing theme-assets bucket) or paste a video link.
- Plays by itself and **loops forever** by default; options: loop on/off, silent on/off (phones only autoplay silent videos), show play/pause buttons, fill or show-whole, corner roundness.
- Move and resize it like any element; put it on one page (default: the page you're on) or every page; it can also do a tap action or a float/wiggle animation.

#### 3. Remove background – choose per photo
The product form already removed backgrounds automatically. Now each new photo has its own button: **Keep background / Remove background**, plus the global "Remove the background of new photos" switch (and "transparent / one colour / random colour"). Works the same for Snacks.

Files: main.tsx, themeElements.tsx, secretTheme.tsx, AdminSecretCode.tsx, admin.css, chiikawa.css (+ tools/chiikawa-art/chiikawa.src.css), supabase-snacks-page.sql.

## V12 – per-page editing in the Theme Studio + full Chiikawa restyle

<sub>source: `docs/changelog/CHANGELOG-V12-PER-PAGE-EDITING-AND-RESTYLE.md`</sub>

#### 1. Edit page by page (Admin → Secret theme editor)
New bar above the preview: **"Your changes go to  [Only Home | Every page]"** (it follows the page you open in the preview).
- **Only <page>** (default): parts, mascot picture / position / size / hide, wording and "tapped parts" you change are saved for THAT page only.
- **Every page**: the old behaviour – one change used everywhere.
- A page's own edits sit on top of the shared ones. **"Clear <page>'s own changes"** puts that page back to the shared look. Other pages are never touched.
- **New buttons / texts / pictures are now created for the page you're on** (Home → only Home). Before, they appeared on every page. The Elements list shows where each one lives and has "Only on <page>" / "Every page" buttons. Elements of other pages are no longer drawn (or draggable) in the preview.
- Added Notifications, Rewards and Debt as separate pages (they used to count as Home).
- Existing themes keep working: what was saved before stays shared until you override it on a page. Colours, fonts and dark mode stay shared; page backgrounds were already per page.
- Saved in the theme JSON as `pageOverrides` – no SQL change needed.
Files: `secretTheme.tsx` (effectiveTheme, pageOverrides, pageKeyFor), `AdminSecretCode.tsx`, `themeElements.tsx`, `admin.css`.

#### 2. Chiikawa restyle (every customer page, mascots untouched)
Rebuilt `chiikawa.css` after the sample: hand-drawn wordmark with white halo, thin blue-outline search, banner, text-only category buttons, pastel product cards (single-line name, pink price, heart top-right), cream bottom nav with pink active tab, same on cart, product, checkout, orders, wallet, profile, rewards, notifications, support chat and debt.
- Removed leftover purple (icons, ABA button text, dashed upload box, profile icons) and the glued-on pink look on qty / remove / tab buttons.
- Fixed overflow on cart, product and checkout bar at 360–430px wide.
- Sky + moving clouds, grass and all mascot hooks (`--ck-m-*`, `--ck-dx/dy/s/d-*`) are unchanged, so the mascot pictures you upload later work as before.
- Gaegu font is now also loaded from `index.html`.
- Source with short selectors: `tools/chiikawa-art/chiikawa.src.css` → `python3 tools/chiikawa-art/build_css.py`.

## v11 – Chiikawa: text-only category buttons, tidy profile buttons

<sub>source: `docs/changelog/CHANGELOG-V11-CHIIKAWA-CATEGORY-PROFILE.md`</sub>

#### Home – category buttons
- All mascot/icon pictures are removed from the category buttons in the Chiikawa theme. Only the text is shown.
- Clean pill buttons: same height, text centred, no big empty gap on the left, never squashed, one swipeable row with snapping. Selected one is pink.
- The editor's "Mascots on the category buttons" group is removed (there is nothing to move any more). Saved themes that had those settings still load fine.

#### Profile – Admin Panel and Sign out
- Both buttons are now exactly the same size (56px high, full width), same text size, same icon size, centred, with an even 14px gap (before: different padding and an extra 8px on Sign out).
- The Account card is as tall as the Personal information card and the buttons sit at its bottom edge, lined up with "Save changes". Small pink icons in the card headers.

Files: `src/chiikawa.css`, `src/chiikawaMascots.ts`.
Checked: real Chrome render of the real stylesheets with the real markup at phone and desktop widths (before/after). NOT checked: full app build and the real Supabase data – please run `npm run build` and look at Home and Profile once.

## v10 – copied mascots stay in place and move, Lock / Unlock everything

<sub>source: `docs/changelog/CHANGELOG-V10-LOCK-AND-MASCOT-COPY-FIX.md`</sub>

Applies to Admin → Themes → Edit and Admin → Secret Code (same editor). Saved inside the theme JSON – **no SQL needed.**

#### 1. The copied mascot now stays in place like the original
- Cause: the original mascots are glued to the **page** (they scroll with it), but a copy was a free picture glued to the **screen**, so it slid away from the original as soon as the page scrolled or the screen size changed.
- Now every free picture has **Stays: On the screen / On the page (scrolls)** (floating bar → *Stays*, and Elements tab → *Where it stays*).
- *Copy* on a built-in mascot makes a **page** picture placed in the same spot of the store column, so it scrolls with the page exactly like the original. Mascots of a fixed bar (bottom navigation) are copied as **screen** pictures, because the bar itself does not scroll.
- Switching *Stays* converts the numbers so the picture does not jump.
- Page pictures: left-right = % of the store column, up-down = distance from the top of the page, size = real pixels (like the built-in mascots).
- Old themes are unchanged (every existing picture stays "On the screen").

#### 2. Movement now plays in the editor
- Cause: motion only ran in *Try it* mode. In *Edit on screen* the built-in mascots bobbed (CSS) but your pictures were frozen.
- Now movement (float, wiggle, fly around, bounce, sweep, fall, orbit…) plays in Edit mode too. The **selected** picture holds still so you can drag it; everything else keeps moving.
- New button below the preview: **⏸ Pause motion / ▶ Play motion** (preview only).
- Page pictures roam the whole page; screen pictures roam the screen.

#### 3. Lock (like Adobe Illustrator)
- **Lock** button in the floating bar of every kind of thing: your pictures/buttons/texts, built-in mascots, and store parts (cards, search bar…). 🔒 / 🔓 button on every row of the Elements list. Also *Lock this mascot* in the Mascots tab and *Lock it* in the Elements tab.
- A locked picture/mascot cannot be selected by tapping, dragged or resized – taps go through to what is underneath. It shows a small 🔒. A locked store part cannot be dragged. When you select a locked thing, its toolbar shows only **Unlock**.
- Below the preview: **🔓 Unlock everything (n)**, **🔒 Lock everything**, **⏸ Pause motion**.
- Locks are saved with the theme (like Illustrator files) and never affect customers.

#### Files
Edited: `src/themeElements.tsx`, `src/AdminSecretCode.tsx`, `src/secretTheme.tsx`, `src/MascotHandles.tsx`, `src/chiikawaMascots.ts`, `src/cool.css`.

#### Checked / not checked
Checked in real Chrome with the real `themeElements.tsx` bundled with React: motion plays in edit and live mode; selected picture pauses; page pictures scroll with the page and screen pictures do not; x position follows the store column on resize; dragging gives the right numbers; a locked picture ignores drag and lets taps through; Pause freezes motion. Syntax of every edited file.
NOT checked: `npm install` / `npm run build` and clicking through the full admin screen (no network here). Please run `npm run build`, then in Secret Code: Copy a top mascot, scroll the preview, give it a movement, press Lock everything and Unlock everything.

## v9 – weekly debt interest fixed + Chiikawa phone layout fixes

<sub>source: `docs/changelog/CHANGELOG-V9-DEBT-INTEREST-AND-CHIIKAWA-FIXES.md`</sub>

#### 1. Debt: the weekly interest never got added
Run **`supabase-debt-interest-fix.sql`** once in Supabase → SQL Editor (safe to re-run). Then reload Admin → Debt Management.

Causes found
- The function the app calls to add interest (`accrue_customer_debt_interest`) is not in any SQL file of the project, so nothing in the project added interest.
- Accounts created in Admin → Debt Management were saved without `next_interest_at` (the date of the next weekly interest), so there was never anything scheduled.
- Interest was only attempted when the *customer* opened their Debt page, and it could not catch up several missed weeks. The admin screen never triggered it.

Now
- Interest is added for **every** missed week, counted every 7 days from the account's **Start date** (or the day it was created). Example: $139 starting 5 Oct, fixed $5/week → $144 on 12 Oct, $149 on 19 Oct …
- Runs when the customer opens Debt, when an admin opens Debt Management, before every payment / new debt, and hourly if pg_cron exists on the project.
- No interest while the balance is 0 or the account is disabled; paying off clears the schedule and new debt later restarts it from its own date (no back-charging).
- Existing accounts are repaired and caught up when the SQL runs.
- Percent interest is charged on the balance at that moment (compounding); fixed interest is a flat amount each week. Interest keeps being added after the End date while money is still owed.
- Customer Debt page: new **Interest added** figure, correct **Additional debt**, and the **next interest date**; the history shows each week's interest with its date. Admin list shows the next interest date; a red banner appears if the SQL has not been run.

#### 2. Chiikawa theme fixes (phones)
- The banner was wider than the page (minimum height × aspect ratio pushed its width out): it stuck out to the right and made the page scroll sideways (up to ~78px at 320px wide). Fixed in `chiikawa.css` and `style.css`.
- The six bottom-bar buttons did not fit on phones narrower than ~400px and stuck out of the bar. They now shrink to fit.

#### Files
New: `supabase-debt-interest-fix.sql`
Edited: `src/main.tsx` (Debt pages), `src/chiikawa.css`, `src/style.css`, `src/customer.css`

#### Checked / not checked
Checked: a Python model of the accrual loop (your case, 8 missed weeks, percent, paid off, disabled, new debt after payoff); the Chiikawa home page rendered in real Chrome with the project's CSS at 320/360/390/768/1280px before and after (no sideways overflow after).
NOT checked: the SQL has not been executed (no Postgres here) – run it and check Admin → Debt Management; `npm run build`.

## v8 – duplicate mascots, same spot on every device, a mascot on every product

<sub>source: `docs/changelog/CHANGELOG-V8-DUPLICATE-MASCOTS-DEVICES-PRODUCT-MASCOTS.md`</sub>

Applies to Admin → Themes → Edit / Admin → Secret Code (same editor) and the new Admin → **Product Mascots** page.
Everything is saved inside the theme JSON – **no new SQL needed.**

#### 1. Duplicate a mascot (with its movement)
- Tap a built-in Chiikawa mascot in the preview → floating bar → **Copy**. Also in Mascots tab → **Duplicate this mascot**.
- The copy is a free picture placed next to the original, same picture, same size, and the **same movement** (the two top mascots bob, so their copies bob). Drag it anywhere, change its movement in the bar (*Move*: float, wiggle, fly around the screen, bounce, orbit…).
- Free pictures/buttons/text already had **Copy**; it now also copies the movement settings safely (no shared data between copy and original).

#### 2. Same place on every device
- Before: a free picture's x/y marked its *top-left corner* as a % of the screen but its width was in pixels, so "middle" was only the middle on one screen size.
- Now x/y are the **centre** of the picture (50 / 50 = dead centre on every phone, tablet and computer; 0/0 and 100/100 are the exact corners). The whole picture (text, borders, icons too) grows/shrinks with the screen width (phone = 1×, up to 1.6× on large screens), so proportions stay the same.
- Elements saved with the old system are converted automatically so they stay exactly where they were on a phone.
- New buttons in Elements tab: *Centre left-right / Centre up-down / Dead centre*. Use the Phone / Tablet / Computer buttons above the preview to check.
- Moving ("fly around", "bounce", "sweep", "fall") still reaches the real edges of each screen.
- Mascots that belong to a part of the store (search bar, product card, top bar…) are anchored to that part, so they follow it on every device.

#### 3. Product Mascots page (Admin → Catalog → Product Mascots)
- Pick the theme, tick *Show a mascot on every product*, choose **how many mascots** (slider) and press **Pick N random mascots for me**. Every product card gets one from that group at random.
- The pick depends only on the product id + a "shuffle number", so it is identical on every device and after reloads, and **a product added later gets its mascot automatically**. The page also updates live when a product is added.
- Also: 1–3 mascots per product, size, movement (still / float / wiggle / hop / pulse / mixed), *Shuffle who gets which*, add your own mascot pictures, and change or remove the mascot of one single product ("Change" → saved even after shuffling; "Back to automatic").
- Customers see it with that theme on the Home page and Wishlist. The Chiikawa preset's old fixed corner mascot on the cards steps aside while this is on. The "Mascots on the product cards" move/size/hide settings in the Mascots tab still apply to the new ones.
- The theme editor no longer overwrites these settings when you save a theme.

#### Files
New: `src/productMascotsCore.ts`, `src/ProductMascots.tsx`, `src/AdminProductMascots.tsx`
Edited: `src/themeElements.tsx`, `src/AdminSecretCode.tsx`, `src/secretTheme.tsx`, `src/MascotHandles.tsx`, `src/chiikawaMascots.ts`, `src/main.tsx` (card, route, menu), `src/cool.css`, `src/admin.css`

#### Checked / not checked
Checked: logic tests in Node (old-position migration, stable random pick, new product auto-assigned, overrides, junk-input clean-up); a real Chrome test of the exact overlay CSS at 360/390/768/1440/1920 px wide (centre, corners, rotation, fly-around reaching the screen edges); syntax of every edited file.
NOT checked: `npm install` / `npm run build` and clicking through the admin screens (no network or React install here). Please run `npm run build`, open Admin → Product Mascots once, and Duplicate a mascot in the editor before deploying.

## v6 – edit, move and re-skin ANY part in the theme editor

<sub>source: `docs/changelog/CHANGELOG-V6-MOVE-ANYTHING.md`</sub>

Applies to Admin → Themes → Edit and Admin → Secret Code (same editor). Customers get the result automatically (no SQL needed – it is saved inside the theme JSON).

#### What is new
- **Tap anything.** Tapping a thing that is not one of the named parts (any text, button, icon, label…) now makes it a "tapped part" with every tool. Blank space is still the page background.
- **Move up / down / sideways.** Every part has *Left-right* and *Up-down* sliders and ▲ ▼ nudge buttons in the floating bar, and you can **drag it in the preview** (mouse: just drag; phone/tablet: tap it once to select, then drag). The page layout around it does not jump.
- **Background.** Every part now has a Fill colour and a *Back picture* (before, only some had them).
- **Icon.** Every part (except plain pictures) has an *Icon* picture, *Icon size* and *Icon spot* (before / after / above the text). The picture replaces the part's own little icon; switch "Old icon" on to keep both. Icons are real elements, so they never clash with the Chiikawa mascots.
- Parts tab: same new controls, "Tapped parts" group in the part list.

#### Good to know
- A change applies to every part of the same kind (e.g. all product cards, all nav items). For one single free-standing item use the Elements tab.
- Saved theme JSON gets two new things: `customParts` (selectors of tapped parts) and, inside `components`, `moveX`, `moveY`, `icon`, `iconSize`, `iconSide`, `iconKeep`. Older themes work unchanged.

#### Files
New: `src/PartIcons.tsx`. Edited: `src/secretTheme.tsx`, `src/AdminSecretCode.tsx`.

#### Checked here / not checked
Checked in a real headless browser (with the app's own functions): generated CSS (move, icon, hiding the old icon, selector clean-up), picking a selector for tapped things, icon placement and re-adding after React re-renders, mouse drag + click vs. drag, touch only drags a selected part.
NOT checked: `npm install` / `npm run build` and the full admin screen (no network here). Please run `npm run build` and try Admin → Secret Code once.

## v5 – customer side redesign ("Aurora")

<sub>source: `docs/changelog/CHANGELOG-V5-CUSTOMER-REDESIGN.md`</sub>

Everything customer-facing (Login, Home, Product, Cart, Checkout, Orders, Wallet, Debt, Rewards,
Wishlist, Notifications, Support chat, Profile) has a new look and new motion. Admin screens are untouched.

#### New / changed files
- `src/customer.css`  – the whole redesign (imported last in `main.tsx`)
- `src/fx.ts`         – tiny motion helper (scroll state + cursor spotlight on cards)
- `src/main.tsx`      – 4 small edits: sliding nav indicator, page-transition wrapper (`RouteFx`), discount badge on product cards, imports
- `index.html`        – Outfit + Inter fonts, first-paint splash logo

#### What you get
- Animated aurora background with a soft dotted grid that drifts as you scroll
- Glass top bar and floating bottom dock with a **gradient pill that glides** between tabs
- **Page transitions**: pages slide + un-blur in with a stagger (forward = from the right, Back = from the left), new page starts at the top
- Product cards: staggered pop-in, scroll-reveal for cards further down, lift + cursor spotlight on hover, heart pop, `-NN%` badge when there is an original price
- Category chips become gradient pills (with 🍦 ☕ 🧋 🍰 🍔 🍱 icons for matching categories)
- Product page: soft studio-style gallery, gradient price, gradient option chips, glass sticky buy bar
- Cart: glowing gradient border on selected items, floating checkout bar that springs up
- Checkout / wallet / payment modals: blurred backdrop, spring-in cards
- Wallet + Home fallback hero: animated mesh gradient with a light sheen
- Orders: accent bar cards, pulsing status dots
- Chat: gradient "mine" bubbles with pop-in
- Sign-in: floating logo, animated gradient headline, frosted card
- Buttons: gradient with a sweeping shine on hover

#### Themes
The default storefront gets the new look. Secret-code themes (Chiikawa, custom) still layer on top exactly as before –
the redesign rules are switched off while a theme is on. Page transitions and the entrance animation work in every mode.

#### Notes
- Respects "reduce motion" (all animation is turned off for those users).
- Not verified here: `npm install` / `npm run build` and a visual check in a browser (no network / browser in this environment).
  Please run `npm run build` and look over each page once.
- Home-screen installs cache assets – if the old look shows, reload twice or reinstall the app.

#### v5.1 fixes
- Checkout button text was invisible: the fixed checkout bar sits outside the page container, so the gradient variable was undefined and the button had no background (white text on white). Tokens now live on `<html>`.
- Banner no longer zooms out/in while sliding (removed the Ken-Burns loop).

## v4 – auto background removal, clouds fix, new app icon

<sub>source: `docs/changelog/CHANGELOG-V4-PRODUCT-BG-CLOUDS-ICON.md`</sub>

#### Add / Edit product (Admin → Products)
- "Remove the background automatically" is now **ON by default**.
- It runs the moment you pick photos and the preview shows the cut-out (checkerboard = transparent) with a status:
  "Background removed ✓" or "Kept original (busy background)". Untick the box to keep originals.
- Save uploads exactly what the preview shows. Strength slider / colour fill options still work and re-run live.
- Option (variant) pictures are not cut out – only the main product photos.

#### Chiikawa clouds (and sky)
Cause: the page container (.shop, .detail, .cartPage…) was painted opaque cream by an older rule in style.css
(`html[data-secret-theme=on] .shop { background-color: var(--secret-bg) !important }`), so it hid both the blue sky and the drifting clouds that live on <body> behind the content.
Fix: chiikawa.css makes those containers transparent for the Chiikawa preset. A per-page colour chosen in the Studio still wins.
Verified in a headless browser with the real CSS: sky + moving clouds now show on Home.

#### App icon
- White, full-bleed square (no transparent corners / no purple tile) with the original YN letters cut out of yn-logo.png.
- Files: public/icon-192.png, icon-512.png, apple-touch-icon.png (180), favicon-32.png. manifest.webmanifest and index.html updated
  (separate "any" and "maskable" entries; letters sit inside the maskable safe zone; background_color white).
- In-app logo (yn-logo.png) is unchanged.
- Already-installed home-screen icons usually only update after removing and re-adding the app.

Not verified here: `npm install` / `npm run build` (no network). Please run `npm run build` before deploying.

#### Khmer font
- Cause of the "wrong" Khmer font: the Chiikawa theme (and any theme font) forced its own font with !important, so Khmer letters fell back to a random system font. The Khmer rule is now stronger and always wins when the app is in Khmer.
- New default: Noto Sans Khmer. New picker in Admin → Secret Code → Look → **Khmer font** (Noto Sans Khmer, Kantumruy Pro, Battambang, Siemreap, Hanuman, Content) with a live sample. Saved per theme (`khmerFont`), no SQL needed. Fonts load from Google Fonts only when a customer uses Khmer.

## Theme Studio v3 — what's new

<sub>source: `docs/changelog/CHANGELOG-V3-THEME-STUDIO.md`</sub>

#### Run these once (Supabase → SQL Editor)
1. `supabase-theme-studio-v3.sql` – creates the public `theme-assets` bucket so theme pictures are uploaded (without it pictures still work; they are embedded in the theme).
2. `supabase-aba-payway.sql` – only if you want ABA PayWay (see `ABA-PAYWAY-SETUP.md`).

#### Admin → Secret Code
| Tab | What you can do |
|---|---|
| **Look** | Colours, **Dark mode** (off / follow phone / always, with auto-made dark colours), **Background of everything** (gradient, moving gradient, frosted-glass cards, wallpaper), 🎲 *Surprise me* random look |
| **Categories** | Tick exactly which categories (and their products) this theme shows, with product counts. Option to hide uncategorised products. Overrides the older per-category table. |
| **Products** | Product pictures: keep / remove background / remove + one colour / **random colour per product** / random gradient. *Shuffle* re-rolls. Strength slider. Works live in the customer's browser; originals are never changed. |
| **Elements** | Add **buttons, text, pictures**. **Drag them in the preview**, resize with the pink corner. Choose what a button does, how it looks (gradient / solid / outline / glass / your own picture as the button face or icon, shape, shadow, hover), and how it moves. |
| Parts / Text / Layout & pages / Advanced | As before |

The preview bar has **Select parts / Move elements / Try it**, and a **Light / Dark** preview switch.
The whole Studio now follows the admin dark mode (and your phone/computer setting until you choose one).

##### Button actions
Open a store page · show a category · open a product · search a word · open a web link · call · Telegram ·
**switch Khmer ⇄ English** · **dark ⇄ light** · **random background colour** · **shuffle product picture colours** ·
confetti · pop-up message · scroll to top.

##### Movement
Float · pulse · wiggle · jump · spin · **fly around the screen** · **bounce off the edges** · sweep across (either way) · fall · orbit. Speed 1–10. (Customers with "reduce motion" turned on are not shown the flying animations.)

#### Customer app
* **Khmer / English button** in the top bar (and on the login screen). Remembered per device. All screens are covered: text already wrapped in `tr()` plus ~110 extra strings that are translated automatically (`src/lang.tsx`). Add more in the `KM` list there.
* **Dark mode** per theme (see above); customers can flip it with a button you add.
* Product cards, gallery and cart use the themed pictures.
* A few polish touches: lift/zoom on product cards, press feedback, page-in animations, smoother scrolling, nicer scrollbars. All respect "reduce motion".

#### Admin → Products
* The old "remove white background" option is replaced by a better remover that handles **any plain background colour**, with strength slider and optional **replace with colour / random colour**.
* ✂️ on an existing photo cuts its background out (the original file stays in storage).

#### ABA PayWay
New server endpoints (`/api/aba/*`) + a **Pay now with ABA PayWay** button in checkout and in *My orders*. See `ABA-PAYWAY-SETUP.md`.

#### Good to know
* Background removal is a colour-based cut-out (no AI): great for studio photos on plain backgrounds; photos with busy backgrounds are left unchanged, and *white products on white backgrounds* may lose parts — lower the strength.
* Existing themes keep working (old elements are converted automatically).
* Verified in a real browser with a simulated backend (dragging, resizing, actions, motion, dark mode, categories, product cut-outs, Khmer switch) and the PayWay server against a simulated PayWay/Supabase. I could not run `npm install`/`vite build` or reach ABA/Supabase from here, so please run `npm run build` and the ABA sandbox test before going live.

## Feature notes (index)

| Note | Summary |
|---|---|
| [Admin panel animations](docs/changelog/CHANGELOG-ADMIN-MOTION.md) | Motion for the whole admin side. Customer storefront is untouched (everything is scoped to .admin). |
| [Admin theme editor – edit right on the preview](docs/changelog/CHANGELOG-ADMIN-ONSCREEN-EDITOR.md) | Applies to Admin → Themes → Edit and Admin → Secret Code (same editor). |
| [Admin animated scenes (payment-success style)](docs/changelog/CHANGELOG-ADMIN-SCENES.md) | Illustrated, looping scenes for the admin side – same style as the "Payment received" animations. |
| [Admin Theme Editor Enhancements](docs/changelog/CHANGELOG-ADMIN-THEME-EDITOR-ENHANCEMENTS.md) | Added page-specific design settings to the Secret Code / theme editor, keyed independently for Home, Products, Cart, Wishlist, Orders, Walle... |
| [Admin theme editor follow-up](docs/changelog/CHANGELOG-ADMIN-THEME-EDITOR-REMAINING.md) | Added saved per-element button label, icon-name and action configuration controls. |
| [Admin v2](docs/changelog/CHANGELOG-ADMIN-V2.md) | Removed the Alfie voice assistant from the admin side. |
| [Animated loading screen (first open)](docs/changelog/CHANGELOG-ANIMATED-LOADING-SCREEN.md) | The YN logo splash lives outside #root, so starting the app no longer restarts it; same look for the busy overlay. |
| [Authentication restore](docs/changelog/CHANGELOG-AUTH-RESTORE.md) | Restored direct Supabase auth.signUp and auth.signInWithPassword from the Vite frontend. |
| [Back button on every inner page](docs/changelog/CHANGELOG-BACK-BUTTON.md) | Added the back button to **Cart, Orders, Wallet and Profile** (they were the only customer pages whose header had none). Home is the root pa... |
| [Shopping-cart animations (customer paid + admin new paid order)](docs/changelog/CHANGELOG-CART-SCENES.md) | New: src/CartScenes.tsx, src/cartScenes.css, supabase-realtime-orders-cart.sql. Edited: src/main.tsx. |
| [CHIIKAWA Secret Theme — follow-up polish](docs/changelog/CHANGELOG-CHIIKAWA-COMPLETE.md) | Expanded the Chiikawa preset styling across customer marketplace cards, banners, product details, cart/checkout, order/transaction cards, an... |
| [Chiikawa theme v2](docs/changelog/CHANGELOG-CHIIKAWA-V2.md) | New src/chiikawa.css (replaces the old preset rules in style.css): sky/grass background, sticker cards with pastel rotation, mascot chips an... |
| [Chiikawa theme v3 – moving clouds + editable mascots](docs/changelog/CHANGELOG-CHIIKAWA-V3-CLOUDS-MASCOTS.md) | New seamless strip public/chiikawa/clouds.svg (generator: tools/chiikawa-art/gen_clouds.py). |
| [CORALINE secret theme](docs/changelog/CHANGELOG-CORALINE.md) | A moonlit, hand-stitched look: midnight-navy denim, torn cream paper, brass buttons, thread stitching, a haunted house under a full moon and... |
| [CV maker: 6 new designs (13 in total)](docs/changelog/CHANGELOG-CV-6-NEW-DESIGNS.md) | New designs (picked on the first screen of the CV maker, shown blank like the others): |
| [CV maker ($3) + Bakong payment fix](docs/changelog/CHANGELOG-CV-MAKER-AND-PAYMENT-FIX.md) | 1. Supabase -> SQL Editor: run supabase-cv-maker.sql (table cv_orders + wallet payment function). |
| [CV privacy + new admin look (v3 "Midnight")](docs/changelog/CHANGELOG-CV-PRIVACY-ADMIN-V3.md) | src/CvMaker.tsx |
| [CV maker: unlimited items + auto-fit](docs/changelog/CHANGELOG-CV-UNLIMITED-AUTOFIT.md) | Education, experience, skills, soft skills, languages, certificates, achievements and references: no more limit (the old caps were 2-8). Ref... |
| [Debt: delete completely + fresh start after payoff](docs/changelog/CHANGELOG-DEBT-DELETE-FRESH-START.md) | Run supabase-debt-delete-and-fresh-start.sql once in Supabase -> SQL Editor (after supabase-debt-multi-currency.sql). |
| [Debt KHQR: auto-approve + saving the QR](docs/changelog/CHANGELOG-DEBT-KHQR-FIX.md) | 1. Run supabase-debt-khqr-fix.sql once in Supabase -> SQL Editor. (Also folded into supabase-debt-interest-fix.sql for new installs.) |
| [Debt in Khmer riel + US dollars](docs/changelog/CHANGELOG-DEBT-RIEL.md) | 1. Run supabase-debt-multi-currency.sql once in Supabase -> SQL Editor (after supabase-debt-interest-fix.sql). Existing debt accounts become... |
| [Delivery truck + motorbike: logo fits the delivery box](docs/changelog/CHANGELOG-DELIVERY-LOGO-FIT.md) | Truck: logo is now medium and sits fully inside the white cargo box (it used to poke above the purple stripe and below over the bumper/wheel... |
| [Homepage speed (many products)](docs/changelog/CHANGELOG-HOMEPAGE-SPEED.md) | Cause: the homepage asked Supabase for each product's first option and then that option's first price, one product at a time (2 requests per... |
| [Admin can enable / disable bottom-nav pages (every theme, including the default)](docs/changelog/CHANGELOG-NAV-VISIBILITY.md) | 1. Run supabase-nav-visibility.sql once (adds delivery_settings.nav_hidden). |
| [Option photos disappearing after editing a product](docs/changelog/CHANGELOG-OPTION-PHOTOS.md) | Saving an edited product deleted every option photo file from storage, then re-saved the options pointing at those same (now deleted) files. |
| [Order tracking view](docs/changelog/CHANGELOG-ORDER-TRACKING.md) | 1. Run supabase-order-tracking-statuses.sql once (adds 4 statuses: arrived/left China warehouse, arrived/left Cambodia warehouse). |
| [Payment received: a different animation per payment type](docs/changelog/CHANGELOG-PAYMENT-SCENES.md) | New files: src/PaymentScenes.tsx, src/paymentScenes.css. Edited: src/main.tsx, src/payment.css. |
| [Payment-received celebration + Services page motion](docs/changelog/CHANGELOG-PAYMENT-SUCCESS-AND-SERVICES-MOTION.md) | Shown after every KHQR payment (order, wallet top-up, debt). |
| [Phone push notifications](docs/changelog/CHANGELOG-PHONE-PUSH.md) | New: supabase-push.sql, supabase/functions/send-push, src/push.ts, src/PushToggle.tsx, src/push.css, tools/generate-vapid.mjs, PUSH-SETUP.md... |
| [Pictures everywhere, parts that stay on screen, loading page, default look](docs/changelog/CHANGELOG-PICTURES-STICKY-LOADING.md) | Run in Supabase -> SQL Editor once: supabase-default-look.sql and supabase-loading-screen.sql. |
| [Products appear in a random order](docs/changelog/CHANGELOG-RANDOM-PRODUCT-ORDER.md) | No SQL. Home and the Snacks page now shuffle the product cards every time the page is opened, so products do not stay in the same place. |
| [Product reviews, share links and more sales per visit](docs/changelog/CHANGELOG-REVIEWS-SHARE-AND-REBUY.md) | 1. Run supabase-product-reviews.sql once. Reviews + stars, Share button, link previews, You may also like, Recently viewed, Buy again. |
| [Secret Theme Editor Update](docs/changelog/CHANGELOG-SECRET-THEME-EDITOR-UPDATE.md) | Moved theme configuration and editing controls below the live storefront preview. |
| [Secret Theme Preview Accuracy Update](docs/changelog/CHANGELOG-SECRET-THEME-PREVIEW-ACCURACY.md) | Reworked the admin storefront preview to follow the customer home page's structure more closely: marketplace heading, notification/profile a... |
| [Secret Theme Activation Route Fix](docs/changelog/CHANGELOG-SECRET-THEME-ROUTE-FIX.md) | Secret-code activation no longer forces a full browser reload. |
| [Secret Code page rebuilt as a real theme studio](docs/changelog/CHANGELOG-SECRET-THEME-STUDIO.md) | What was wrong:** the old admin page edited a hand-made mock of the store. Most of what it saved |
| [Services page (replaces Wishlist in the bottom bar)](docs/changelog/CHANGELOG-SERVICES-PAGE.md) | 1. Run supabase-services.sql once in Supabase -> SQL Editor (tables service_requests + product_suggestions, bucket service-uploads, admin no... |
| [Snack orders get their own status flow and animations](docs/changelog/CHANGELOG-SNACK-ORDER-FLOW.md) | 1. Run supabase-snack-order-statuses.sql once (adds "Waiting for a delivery driver" and "Out for delivery"). |
| [SPIDEY secret theme](docs/changelog/CHANGELOG-SPIDEY.md) | 1. Run supabase-spidey-secret-theme.sql in the Supabase SQL Editor (creates the theme with code SPIDEY). |
| [Stay logged in (no more surprise log-outs)](docs/changelog/CHANGELOG-STAY-LOGGED-IN.md) | Protected used to go to the login page on ANY auth event that had no session, and getSession() returning nothing during a bad connection cou... |
| [Video Editor: own page in Admin](docs/changelog/CHANGELOG-VIDEO-EDITOR-PAGE.md) | The editor lives at /admin/video (src/AdminVideoEditor.tsx). It is now: |
| [Admin video editor + doodle avatar](docs/changelog/CHANGELOG-VIDEO-EDITOR.md) | No SQL. Deploy, then Admin menu > Studio > Video Editor (/admin/video). |
| [Wallet payment fix (no screen changes)](docs/changelog/CHANGELOG-WALLET-PAY-FIX.md) | The Pay with Wallet buttons (Checkout, Orders) look and work the same in the app. Only the database function behind them was hardened. |
| [Wallet page restyle](docs/changelog/CHANGELOG-WALLET-RESTYLE.md) | src/wallet.css (new, imported in main.tsx) + new WalletPage in main.tsx. No SQL or server changes. |
| [Wallet in Khmer riel AND US dollars (+ checkout payment choice at the top)](docs/changelog/CHANGELOG-WALLET-RIEL.md) | 1. Run supabase-wallet-riel.sql once in Supabase -> SQL Editor (after supabase-bakong.sql and supabase-debt-multi-currency.sql). |
| [Separate riel wallet (riel and dollars are completely different balances)](docs/changelog/CHANGELOG-WALLET-SEPARATE-RIEL.md) | Run in Supabase -> SQL Editor, in this order (safe to re-run): |
