# SQL run order (best effort)

These are the scripts you paste into **Supabase -> SQL Editor**. They live here, not in `supabase/migrations/`, on purpose: the Supabase CLI runs everything in `migrations/` in file-name order, and these files have no timestamps.

> **Read this first.** The order below is derived from (a) ordering the files state themselves in their header comments, (b) a dependency scan (a file that touches a table another file creates), and (c) topic grouping where neither applies. It has **not** been run end to end on an empty database, and the base tables are missing from the repo, so a clean rebuild is not possible yet. For an existing live project you normally only run the *newest* files. Run `supabase-security-audit.sql` to see what your project already has.

Several functions are defined in more than one file; **the file run last wins**. The chains that matter:

| Function | Defined in (in run order) |
|---|---|
| `pay_order_with_wallet` | wallet-order-payment -> **security-hardening** |
| `admin_adjust_wallet` | order-payment -> **wallet-transaction-fix** |
| `claim_chat_reward` | rewards-coupons -> **wallet-transaction-fix** |
| `admin_upsert_debt` | debt-admin -> debt-dates -> debt-interest-fix -> **debt-multi-currency** |
| `admin_add_debt` | debt-enhanced -> debt-interest-fix -> **debt-delete-and-fresh-start** |
| `bakong_apply_payment` | bakong -> debt-multi-currency -> wallet-riel -> debt-riel-pay -> **wallet-separate-riel** |
| `customer_pay_debt_khr` | debt-riel-pay -> **wallet-separate-riel** |

Legend for the *Why here* column: **stated** = the file's own header says so; **detected** = dependency scan; **inferred** = grouped by topic only.

## 0. Baseline (NOT in this repo yet)

| # | File | Why here |
|---|---|---|
| - | (your exported schema) | profiles, wallets, orders, products, carts... see docs/SCHEMA-COVERAGE.md and supabase/README.md |

## 1. Foundation

| # | File | Why here |
|---|---|---|
| 1 | `supabase-marketplace-upgrade.sql` | several later files depend on it (detected: needs a table the earlier file creates) |
| 2 | `supabase-fix-connections.sql` | inferred (no dependency found; grouped by topic) |
| 3 | `supabase-realtime-orders-cart.sql` | inferred (no dependency found; grouped by topic) |
| 4 | `supabase-order-payment.sql` | header: run before deploying the checkout update (stated in the file) |
| 5 | `supabase-default-look.sql` | inferred (no dependency found; grouped by topic) |

## 2. Orders, wallet & coupons

| # | File | Why here |
|---|---|---|
| 6 | `supabase-wallet-order-payment.sql` | detected: needs a table the earlier file creates |
| 7 | `supabase-rewards-coupons.sql` | header: after marketplace/order-payment SQL (stated in the file) |
| 8 | `supabase-v18-coupon-fixes.sql` | detected: needs a table the earlier file creates |
| 9 | `supabase-wallet-transaction-fix.sql` | header: AFTER the wallet/order SQL and rewards SQL (stated in the file); redefines admin_adjust_wallet and claim_chat_reward |
| 10 | `supabase-order-statuses-barcode.sql` | inferred (no dependency found; grouped by topic) |
| 11 | `supabase-order-tracking-statuses.sql` | detected: needs a table the earlier file creates |
| 12 | `supabase-snack-order-statuses.sql` | detected: needs a table the earlier file creates |
| 13 | `supabase-product-choice-images.sql` | inferred (no dependency found; grouped by topic) |
| 14 | `supabase-checkout-default-address.sql` | inferred (no dependency found; grouped by topic) |
| 15 | `supabase-city-province-location-fix.sql` | inferred (no dependency found; grouped by topic) |
| 16 | `supabase-category-delivery-fee.sql` | inferred (no dependency found; grouped by topic) |

## 3. Delivery map

| # | File | Why here |
|---|---|---|
| 17 | `supabase-grab-map-delivery.sql` | detected: needs a table the earlier file creates (3 later files need delivery_settings from it) |
| 18 | `supabase-map-checkout.sql` | detected: needs a table the earlier file creates |
| 19 | `supabase-loading-screen.sql` | detected: needs a table the earlier file creates |
| 20 | `supabase-nav-visibility.sql` | detected: needs a table the earlier file creates |

## 4. Payments (Bakong / ABA)

| # | File | Why here |
|---|---|---|
| 21 | `supabase-bakong.sql` | creates bakong_payments; later wallet/debt files depend on it |
| 22 | `supabase-aba-payway.sql` | inferred (no dependency found; grouped by topic) |

## 5. Debt & Riel wallet (order is spelled out in the file headers)

| # | File | Why here |
|---|---|---|
| 23 | `supabase-debt-admin.sql` | header: after the existing debt schema (stated in the file) - the debt tables themselves come from the baseline |
| 24 | `supabase-debt-customer-payment.sql` | header: after the existing debt schema (stated in the file) |
| 25 | `supabase-debt-dates.sql` | header: after the previous debt functions (stated in the file) |
| 26 | `supabase-debt-enhanced.sql` | detected: needs a table the earlier file creates |
| 27 | `supabase-debt-interest-fix.sql` | detected: needs a table the earlier file creates |
| 28 | `supabase-debt-multi-currency.sql` | header: AFTER supabase-debt-interest-fix.sql (stated in the file) |
| 29 | `supabase-debt-delete-and-fresh-start.sql` | header: AFTER supabase-debt-multi-currency.sql (stated in the file) |
| 30 | `supabase-debt-khqr-fix.sql` | inferred (no dependency found; grouped by topic) |
| 31 | `supabase-wallet-riel.sql` | header: after supabase-bakong.sql and supabase-debt-multi-currency.sql (stated in the file) |
| 32 | `supabase-debt-riel-pay.sql` | header: AFTER supabase-wallet-riel.sql and supabase-debt-khqr-fix.sql (stated in the file) |
| 33 | `supabase-wallet-separate-riel.sql` | header: AFTER supabase-debt-riel-pay.sql (stated in the file); final writer of bakong_apply_payment |
| 34 | `supabase-debt-customer-access-fix.sql` | header: after the debt tables/functions exist (stated in the file) |

## 6. Themes

| # | File | Why here |
|---|---|---|
| 35 | `supabase-secret-themes-and-store-location.sql` | detected: needs a table the earlier file creates |
| 36 | `supabase-theme-studio-v3.sql` | inferred (no dependency found; grouped by topic) |
| 37 | `supabase-chiikawa-secret-theme.sql` | detected: needs a table the earlier file creates |
| 38 | `supabase-chiikawa-complete.sql` | detected: needs a table the earlier file creates |
| 39 | `supabase-coraline-secret-theme.sql` | header: after supabase-secret-themes-and-store-location.sql (stated in the file) |
| 40 | `supabase-spidey-secret-theme.sql` | detected: needs a table the earlier file creates |
| 41 | `supabase-snacks-page.sql` | inferred (no dependency found; grouped by topic) |

## 7. Other features

| # | File | Why here |
|---|---|---|
| 42 | `supabase-admin-assistant.sql` | inferred (no dependency found; grouped by topic) |
| 43 | `supabase-cv-maker.sql` | detected: needs a table the earlier file creates |
| 44 | `supabase-cv-private.sql` | detected: needs a table the earlier file creates |
| 45 | `supabase-push.sql` | inferred (no dependency found; grouped by topic) |
| 46 | `supabase-services.sql` | detected: needs a table the earlier file creates |
| 47 | `yn-studio-feature-fix.sql` | inferred (no dependency found; grouped by topic) |
| 47b | `supabase-wedding-invitations.sql` | NEW: wedding e-invitations; needs `profiles` (admin role check). Independent of the other files, run any time |

## 8. Security (last; redefines pay_order_with_wallet)

| # | File | Why here |
|---|---|---|
| 48 | `supabase-security-audit.sql` | read-only check: run it BEFORE and AFTER the next two |
| 49 | `supabase-security-hardening.sql` | must come after supabase-wallet-order-payment.sql: both define pay_order_with_wallet and the later one wins |
| 50 | `supabase-server-side-order.sql` | NEW: server-side pricing; needs supabase-security-hardening.sql (uses its settings/log helpers) |
| 51 | `supabase-security-audit.sql` | (run again) |
