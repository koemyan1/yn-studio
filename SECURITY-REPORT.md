# YN Studio – Security audit & hardening report

**Scope:** the code in `yn-studio-wallet-restyle.zip` (React/Vite app, Express server on Render, Supabase SQL files and edge functions, Capacitor mobile shell).
**Not in scope / not visible to me:** your live Supabase project (actual policies, auth settings, storage settings), your Render and Cloudflare dashboards, and the base database tables (`profiles`, `wallets`, `orders`, `order_items`, `products`, `cart_items` …) – their `create table` / policy SQL is **not** in the zip. Findings marked **unverified** depend on that.

> **No website is unhackable.** This work reduces risk and gives you detection and alerts; it does not eliminate risk. See "What is still not protected" at the end.

## How to read the status column
- **Fixed in code** – done in this patch; takes effect when you deploy.
- **You must run/enable** – I wrote it, but it only works after you run a SQL file or change a dashboard setting.
- **Decision for you** – changes behaviour, so I did not turn it on without asking.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High (unverified)** | **Prices and totals are written by the browser.** Checkout inserts `orders.total`, `subtotal`, `fees` and `order_items.unit_price` straight from the client (`main.tsx`, `place()`), and the server later confirms payment against `orders.total`. A customer using the browser console could create an order worth $0.01 and pay that. | **You must run** `supabase-security-hardening.sql` (adds `yn_check_order_integrity`, wired into KHQR, ABA and wallet payment). Starts in **report** mode (alerts, never blocks). **Decision for you:** switch to **enforce** in `/admin/security` after a few normal orders show no false alarms. |
| 2 | **Critical if present (unverified)** | **Role / money columns may be writable from the browser.** Admin status = `profiles.role = 'admin'`; the sign-up code itself writes `role:'customer'` from the client. If your `profiles` policy lets a user update their own row, anyone could make themselves admin; the same question applies to `wallets.balance` and `orders.payment_status`. The SQL RPCs for money (`bakong_apply_payment`, debt, admin_adjust_wallet…) are correctly locked down – this is about the *tables*. | **You must run** `supabase-security-audit.sql` (read-only) to see your real policies, then `supabase-security-hardening.sql` section D, which blocks these writes whatever the policies say (admins, your server and DB functions are exempt). |
| 3 | Medium | **Brute-force logins bypass your server.** The login form talks directly to Supabase Auth, so nothing on Render or Cloudflare sees those requests. | **You must enable** Cloudflare Turnstile (free) + Supabase CAPTCHA and Auth rate limits – `SECURITY-SETUP.md` §5–6. Client code is already in place and is inert until `VITE_TURNSTILE_SITE_KEY` is set. **Decision for you:** enforcing CAPTCHA in Supabase breaks login for *already-installed* mobile app builds until you ship a new build. |
| 4 | Medium | No security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy). | **Fixed in code.** CSP is **report-only** by default so it cannot break the design; review reports, then set `CSP_MODE=enforce`. |
| 5 | Medium | Rate limiter keyed on `req.ip` (behind Cloudflare that would be a Cloudflare address shared by many users, or spoofable) and never cleaned up (memory growth = a DoS on itself). | **Fixed in code:** real client-IP resolution for Render + Cloudflare, bounded memory, automatic expiry. |
| 6 | Medium | Unauthenticated, costly endpoints with no limit: `/api/aba/callback` (DB + PayWay call per hit) and `/api/bakong/health` (live call to Bakong per hit – could burn your Bakong API quota). | **Fixed in code:** rate-limited; health result cached 30 s. |
| 7 | Medium | Payment endpoints could be used to create unlimited pending rows (`bakong_payments`) per user. | **Fixed in code:** per-user limits on payment creation, order payment polling and CV saves. |
| 8 | Medium | Some functions callable by the logged-out key (e.g. `validate_coupon` → coupon-code guessing). | **You must run** hardening section E (revokes anonymous execute on logged-in-only functions). |
| 9 | Medium | Public storage buckets (`support-chat`, `service-uploads`, …) let any signed-in user upload without a size/type limit shown in the SQL. | **You must change** Supabase → Storage → each bucket: set a file-size limit (e.g. 5 MB) and allowed MIME types (images/pdf). |
| 10 | Low-Med | Error text from the database was returned to browsers (`/api/cv/save`, `/api/bakong/cv/create`); no global error handler. | **Fixed in code.** |
| 11 | Low-Med | Service worker cached every same-origin GET, including `/api/*` (would include admin dashboard data on a shared device). | **Fixed in code** (`public/sw.js`). |
| 12 | Low-Med | Site is also reachable at `…onrender.com`, so an attacker can skip Cloudflare entirely. | **Decision for you:** an "origin lock" (only accept traffic that passed Cloudflare) would break the installed mobile app and old links, so I did **not** enable it. Plan in `SECURITY-SETUP.md` §4.6. The app-level shield protects both addresses meanwhile. |
| 13 | Low | `PUBLIC_URL` unset ⇒ payment return URLs are built from the request `Host` header. | **You must set** `PUBLIC_URL` on Render (already listed in your env example). |
| 14 | Low | Passwords: sign-up form minimum is 6 characters. | **You must set** Supabase → Auth → minimum password length 10 (I did not raise the form minimum: it would stop existing users with shorter passwords from signing in). |
| 15 | Low | Bakong payment check accepts a response with a missing `toAccountId` / `currency` field. The QR's MD5 already binds amount + account, so risk is small. | Noted; not changed (could reject real payments if Bakong omits fields). |
| 16 | Low | Edge functions: webhook secret compared with `!==`; `update-rider-location` puts its token in the URL, doesn't range-check coordinates and echoes errors. | Noted; low impact. Not changed. |
| 17 | Info | No secrets are committed (`.gitignore` covers `.env`; no keys in `src/`); no `dangerouslySetInnerHTML`/`eval`/`innerHTML` in the client, so stored XSS risk is low. No dynamic SQL in functions. | Good as is. |
| 18 | Info | Admin screens are hidden client-side only (`AdminProtected`). That is fine **only** because every admin RPC re-checks `profiles.role` in the database – and items 2 and 8 decide whether table policies do too. | See #2. |
| 19 | Info | No `package-lock.json` in the zip, dependencies use `^` ranges. | Commit the lock file; run `npm audit` (I had no network to do it). |

## What was added (all $0, no new paid services, no new npm packages)

- `server/security/` – shield (headers, honeypot trap pages, scanner/injection filter on URL+query, rate limiting, strike scoring, automatic temporary IP blocks with escalating durations 15 min → 1 h → 6 h → 24 h → 7 days), event log, throttled alerts, admin API, order-integrity check.
- **Alerts** reuse your existing `notifications` table, which already feeds phone push and Telegram.
- `/admin/security` dashboard (Admin → System → Security): status badges, 24-hour counters, hourly chart, blocked IPs (unblock / block / "never block"), top sources, filterable event log, order-price-check switch.
- `supabase-security-hardening.sql`, `supabase-security-audit.sql`, `SECURITY-SETUP.md`, tests, and `tools/security-smoke.mjs`.
- Changed existing files: `server/index.js` (≈80 lines), `src/main.tsx` (login captcha hook, route, menu item), `public/sw.js`, `package.json` (test scripts), the two `.env` examples.

## How it was tested (and what was not)

- `node --test tests/security.test.mjs` – 27 unit tests (IP spoofing, Cloudflare chain, WAF false-positive list of your real URLs, block escalation/expiry, never blocking Cloudflare/allow-listed IPs, memory bounds, fail-open, admin API authorization, integrity modes). **All pass.**
- `tests/e2e-server.test.mjs` – 11 end-to-end checks of the real `server/index.js` against a *fake* Supabase and a minimal Express stand-in (no network here). **All pass.** Run it yourself with real Express: `npm run test:e2e`.
- `tools/security-smoke.mjs` – 18 checks against a local server. **All pass.**
- New React files type-check under `strict` against stubbed React typings; `main.tsx` parses cleanly. **I could not run `npm run build`** (no network to install dependencies) – please run it once before deploying.
- **The two SQL files were not executed** – no Postgres was available. They are idempotent and have rollback notes, but try them on a copy/test project first if you can.
- No real DDoS or load test was run (and none should be run against production). Flood protection is Cloudflare's job (below).

## What is still not protected (be realistic)

1. **Volumetric DDoS.** Node on Render cannot absorb a large flood; only Cloudflare in front can. Until the domain is proxied through Cloudflare (and the origin is locked down, #12), a determined flood can still exhaust your server or free-tier hours.
2. **Supabase endpoints are outside this layer.** Auth, REST and Storage are called directly from browsers; Cloudflare/Render cannot see them. Protection there = RLS policies, Auth rate limits, CAPTCHA, bucket limits.
3. **Unverified base schema** (#1, #2). Until you run the audit and hardening SQL, assume those could be exploitable.
4. **Business-logic gaps remain:** delivery fee and coupon-eligible amounts are still computed in the browser (only item prices + total are cross-checked); there is no server-side stock/limit check.
5. **WAF-lite is signature based** and looks at URL/query only (request bodies like CVs and chat are deliberately not pattern-scanned to avoid false positives). It will not stop a skilled attacker.
6. **Shared networks:** many Cambodian mobile users share one public IP (carrier NAT). An abusive neighbour can get an innocent IP blocked; blocks are short and one click to lift.
7. **Single server instance:** counters live in memory per instance (blocks are saved to the database and restored on restart). If you scale to several instances, limits become per-instance.
8. **No MFA** for admin accounts yet (Supabase supports TOTP, but the app has no screen for it); **no virus scanning** of uploads; **no tested backups** – free Supabase has no point-in-time restore, so export your data regularly.
9. **Accounts and secrets are human problems:** reused passwords, phished admins, leaked keys. Use a unique long admin password, rotate keys if you ever pasted them anywhere, and never put `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable.

## Privacy note
The log stores IP address, user agent, requested path (no query strings, no request bodies, no tokens) and, for admin actions, the admin's user id. Events are deleted automatically after 30 days.

## Things I deliberately did not do
No "hack-back", no probing of attackers' machines, no cameras/photos, no fingerprinting beyond IP + user-agent. Blocking is passive, temporary and reversible.

---

## Progress update (repo upgrade)

| Open item | Status |
|---|---|
| Browser writes prices/totals/fees into `orders` / `order_items` | **Addressed in code, not yet live.** `yn_place_order()` (`supabase/sql/supabase-server-side-order.sql`) rebuilds them in the database; checkout calls it. Rollout is staged: install the SQL, deploy the frontend, watch `/admin/security`, then `update public.security_settings set value='enforce' where key='order_insert_mode';`. Not run against a real database: test with `tests/sql/place-order.test.sql` first. |
| Base tables missing from the repo | **Measured, not fixed.** `docs/SCHEMA-COVERAGE.md` lists exactly what is missing; `supabase/README.md` shows the 5-minute export. Needs your live project. |
| Admin accounts have no second factor | Still open. |
| `package-lock.json` / `npm audit` | Still open (needs network access to generate). |

Remaining weak spot of server-side pricing: the delivery **pin** is still chosen in the browser (a customer can pick a pin near the store but give a far address). `require_delivery_pin = 'on'` only forces a pin to exist.
