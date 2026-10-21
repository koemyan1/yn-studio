# YN Studio

A Cambodian online store: customer shop, cart and checkout, wallet and debt accounts, KHQR / ABA payments, live delivery map, a CV maker, secret themes, and a full admin panel. Web app + Android/iOS (Capacitor).

**Stack:** React + Vite + TypeScript (`src/`) · Node/Express server (`server/`) · Supabase (Postgres, Auth, Storage, Realtime) · Bakong KHQR and ABA PayWay · Capacitor for mobile · hosted on Render.

## Quick start

```bash
npm install
npm run dev          # frontend on http://localhost:5173
npm run dev:server   # API/payment server (needs the env vars below)
npm run build        # type-check + production build
npm test             # security + repo-hygiene tests
npm run test:e2e     # server end-to-end tests
```

## Environment variables

Set on Render (see `render.yaml`). Secrets must never use a `VITE_` prefix.

| Variable | Needed for |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend build (public values) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Server: sign-up, payments, security dashboard (**service key is secret**) |
| `PUBLIC_URL` | Payment callbacks |
| `BAKONG_API_TOKEN`, `BAKONG_ACCOUNT_ID`, `BAKONG_MERCHANT_NAME`, `BAKONG_CURRENCY` (+ `BAKONG_KHR_RATE`, `BAKONG_QR_MINUTES`, ...) | KHQR payments |
| `ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, `ABA_PAYWAY_ENV` (+ `_CURRENCY`, `_KHR_RATE`, ...) | ABA PayWay (optional) |
| `SECURITY_SHIELD`, `RL_*`, `BLOCK_SCORE`, `ALLOW_IPS`, `TRUSTED_PROXY_CIDRS`, `CSP_*`, `HSTS_SUBDOMAINS` | Security shield tuning (all optional) |

## Where things are

| Folder | Contents |
|---|---|
| `src/` | Frontend. `main.tsx` is the app shell and most pages; separate files for admin themes, CV maker, services, map checkout, assistant. |
| `server/` | `index.js` (API, payments) and `security/` (rate limits, blocking, order-integrity, alerts). |
| `supabase/sql/` | The SQL scripts you run in the Supabase SQL Editor. **Order: [`supabase/sql/RUN-ORDER.md`](supabase/sql/RUN-ORDER.md).** |
| `supabase/` | See [`supabase/README.md`](supabase/README.md) (baseline export, migrations, edge functions). |
| `docs/setup/` | Step-by-step setup guides (below). |
| `docs/changelog/` | One note per feature/release. The overview is [`CHANGELOG.md`](CHANGELOG.md). |
| `docs/SCHEMA-COVERAGE.md` | Generated: which tables/functions/buckets the app uses that no SQL file creates. |
| `docs/archive/` | Old files kept for reference, not used. |
| `tests/`, `tools/` | Node tests (`tests/sql/` has the database self-test) and helper scripts. |

## Setup guides

| Topic | Guide |
|---|---|
| Sign-up / login | [AUTH-SETUP](docs/setup/AUTH-SETUP.md) |
| KHQR payments (Bakong) | [BAKONG-SETUP](docs/setup/BAKONG-SETUP.md) |
| ABA PayWay | [ABA-PAYWAY-SETUP](docs/setup/ABA-PAYWAY-SETUP.md) |
| Paying orders from the wallet | [WALLET-ORDER-PAYMENT-SETUP](docs/setup/WALLET-ORDER-PAYMENT-SETUP.md) |
| Map checkout and delivery pricing | [MAP-CHECKOUT-SETUP](docs/setup/MAP-CHECKOUT-SETUP.md), [CATEGORY-DELIVERY-FEE-SETUP](docs/setup/CATEGORY-DELIVERY-FEE-SETUP.md), [CITY-PROVINCE-LOCATION-SQL-SETUP](docs/setup/CITY-PROVINCE-LOCATION-SQL-SETUP.md) |
| Background delivery tracking (mobile) | [BACKGROUND-DELIVERY-TRACKING](docs/setup/BACKGROUND-DELIVERY-TRACKING.md) |
| Order statuses and barcode scanning | [ORDER-BARCODE-STATUS-SETUP](docs/setup/ORDER-BARCODE-STATUS-SETUP.md) |
| Push notifications / Telegram | [PUSH-SETUP](docs/setup/PUSH-SETUP.md), [TELEGRAM-SETUP](docs/setup/TELEGRAM-SETUP.md) |
| Secret themes | [SECRET-THEME-SETUP](docs/setup/SECRET-THEME-SETUP.md), [CHIIKAWA-THEME-SETUP](docs/setup/CHIIKAWA-THEME-SETUP.md) |
| Other features | [FEATURES-SETUP](docs/setup/FEATURES-SETUP.md) |
| Security | [SECURITY-REPORT](SECURITY-REPORT.md) (findings, what is still open) and [SECURITY-SETUP](docs/setup/SECURITY-SETUP.md). Dashboard: `/admin/security` |

## Deploying on Render

Web Service, build `npm install && npm run build`, start `npm start`. The server serves the built frontend and the API. Add the variables above in the Render dashboard.

## How checkout works (important for money)

- **Prices, delivery fee and total are calculated by the database**, function `yn_place_order()` in `supabase/sql/supabase-server-side-order.sql`. The browser only sends the cart item ids, the delivery pin and the coupon code. Until that SQL is installed the app falls back to the old browser-calculated path.
- **Delivery fee** = starting fee for the first `base_km`, then `extra_fee` per `extra_km` step, using **straight-line distance** between the store and the pin (Admin -> Settings). A category can override the fee or make delivery free. The OSRM road route on the map is only for drawing the route and the ETA, it does not change the price.
- A payment is only trusted if `orders.total` matches the order-integrity check (`integrity_mode`: `report` or `enforce`, in `/admin/security`).

## Known gaps

See [`SECURITY-REPORT.md`](SECURITY-REPORT.md) and [`docs/SCHEMA-COVERAGE.md`](docs/SCHEMA-COVERAGE.md). The biggest: the base tables are not in the repo yet ([`supabase/README.md`](supabase/README.md) shows how to export them), and admin accounts have no second factor.
