# YN Studio – Security setup (all free)

Do the steps **in this order**. Every step can be undone. Budget: **$0** (Cloudflare Free, Supabase Free, Render, Telegram/push you already use, UptimeRobot Free).

## 0. Before you touch anything
- Make a copy of your project (git commit/branch) and export your important tables (Supabase → Table Editor → export, or `supabase db dump` with the free CLI).
- Open **your own** public IP (search "what is my IP") – you will allow-list it in step 3.

## 1. Deploy the code
1. `npm install`
2. `npm test` (27 unit tests) and `npm run build` (must succeed – I could not run the build for you).
3. Commit and let Render deploy.
4. Open `https://YOUR-SITE/api/health` → `{"ok":true}`. Open the site, log in, browse – it should look and behave exactly as before.
5. Emergency off-switch if anything misbehaves: set Render env `SECURITY_SHIELD=off` and redeploy.

## 2. Database (Supabase → SQL Editor)
1. Run `supabase-security-audit.sql`. Read the results (or send them to me): tables without RLS, policies on `profiles / wallets / orders`, what `anon` may execute, public buckets, who is admin. **Anything unexpected in "who is admin" is an emergency.**
2. Run `supabase-security-hardening.sql` (ideally on a copy of the project first).
3. Test, as a normal customer: sign up, edit profile name, add to cart, check out with **wallet** and with **KHQR**, top up wallet. As admin: change an order status, scan/mark an order paid, adjust a wallet. All must still work.
4. Prove the guard works (optional, in the browser console while signed in as a normal customer): `await supabase.from('profiles').update({role:'admin'}).eq('user_id', (await supabase.auth.getUser()).data.user.id)` → afterwards your role must still be `customer`, and `/admin/security` shows a "Database tamper attempt".
5. Run the audit again and keep both outputs.

## 3. Render environment variables (Dashboard → Environment)
| Variable | Value |
|---|---|
| `PUBLIC_URL` | `https://ynstudio.site` (your real https address, no trailing slash) |
| `ALLOW_IPS` | your own IPs, comma separated (so you can never lock yourself out) |
| `NODE_ENV` | `production` |
| `CSP_MODE` | leave unset (= report-only) for now |
Never put `SUPABASE_SERVICE_ROLE_KEY`, `BAKONG_API_TOKEN` or `ABA_PAYWAY_API_KEY` in a `VITE_` variable.

## 4. Cloudflare Free (this is what stops big floods)
1. Create a free account → **Add a site** → your domain → Free plan. Change the nameservers at your registrar to the two Cloudflare gives you.
2. **DNS**: the records for `@` and `www` pointing to Render must show the **orange cloud (Proxied)**. (Keep Render's own domain verification records grey if Render asks.)
3. **SSL/TLS** → Overview: **Full (strict)**. Edge Certificates: *Always Use HTTPS* ON, *Minimum TLS* 1.2, *Automatic HTTPS Rewrites* ON. Turn **HSTS** on (max-age 6 months) only after you confirmed https works everywhere.
4. **Security** → Settings: *Security level* Medium; *Browser Integrity Check* ON; **Bot Fight Mode** ON. After enabling, place a test KHQR order and (if you use it) an ABA PayWay order. If PayWay callbacks stop arriving, turn Bot Fight Mode off – the app still confirms ABA payments when the customer returns (`/api/aba/sync`).
5. **Security → WAF**: enable the **Free Managed Ruleset** if it is offered. **Custom rules** (free plan allows 5):
   - *Block obvious probes* – action **Block**:
     `(http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "wp-login") or (http.request.uri.path contains "xmlrpc") or (http.request.uri.path contains "phpmyadmin")`
   - *Unexpected HTTP methods* – action **Block**:
     `not http.request.method in {"GET" "HEAD" "POST" "OPTIONS"}`
   - *Admin from abroad* – action **Managed Challenge** (a challenge, not a block, so you can still log in while travelling):
     `starts_with(http.request.uri.path, "/admin") and ip.geoip.country ne "KH"`
   - **Rate limiting rule** (free plan includes one; check the options your dashboard offers): match `starts_with(http.request.uri.path, "/api/")`, count per IP, about 60 requests per 10 seconds, action Block.
6. **Origin lock (optional – ASK YOURSELF FIRST).** Today the site can still be reached at `…onrender.com`, which skips all of the above. Closing that door breaks anything still using that address (the installed mobile apps use `VITE_API_BASE_URL`). Plan: (1) point `VITE_API_BASE_URL` at your Cloudflare domain and ship a new mobile build; (2) then add a Cloudflare *Transform Rule* that adds a secret header and ask me to add the matching check on the server. I have **not** enabled this.
7. **Emergency:** if the site is being flooded → Cloudflare → Security → *Under Attack Mode* ON. Turn it off when the alerts stop.

## 5. Brute-force protection for login (Cloudflare Turnstile – free)
1. Cloudflare → Turnstile → **Add widget** → hostname = your domain (add `localhost` too if the mobile app should work) → Mode **Managed**. You get a *Site key* and a *Secret key*.
2. Render → set `VITE_TURNSTILE_SITE_KEY` = the **site key** → redeploy (it is a build-time variable). Check that login still works (visitors normally see nothing).
3. Only now: Supabase → Authentication → **Attack Protection** → enable CAPTCHA → provider *Cloudflare Turnstile* → paste the **secret key**.
   ⚠ From this moment, sign-in/sign-up requests **without** a captcha token are refused by Supabase. Installed mobile apps built before this change will not be able to log in until you publish a new build (`npm run build && npx cap sync`). If you have customers on old builds, do step 3 after the new app is out.
4. Supabase → Authentication → **Rate Limits**: lower sign-in attempts per IP (e.g. to 10–15 per 5 minutes) and OTP/email limits.
5. Supabase → Authentication → Sign In / Providers → **minimum password length 10**. Remove providers you do not use. In **URL Configuration** list only your real site URLs as redirect targets.
6. Give admin accounts a long unique password. (TOTP two-factor exists in Supabase but this app has no screen for it yet – not implemented.)

## 6. Storage limits (Supabase → Storage → each public bucket → Edit)
Set a **file size limit** (e.g. 5 MB) and **allowed MIME types** (`image/png, image/jpeg, image/webp` and `application/pdf` where needed) on `support-chat`, `service-uploads`, `product-images`, `banner-images`, `deposit-receipts`, `debt-receipts`.

## 7. The dashboard and alerts
- Sign in as admin → **Admin → System → Security** (`/admin/security`).
- Alerts arrive through the channels you already configured (`PUSH-SETUP.md`, `TELEGRAM-SETUP.md`): they are normal admin notifications titled "Security: …". Alerts are throttled (e.g. one "IP auto-blocked" per 5 minutes with a count of the rest).
- Test the alert: from a phone on mobile data (not your allow-listed IP) open `https://YOUR-SITE/wp-login.php` once → you should get a "Security: IP auto-blocked" notification and see the IP in the dashboard; click **Unblock**.
- Check "Cloudflare detected" shows green after step 4 (if it stays orange, traffic is still reaching Render directly).

## 8. Turning the strict modes on (after a quiet week)
- **Content-Security-Policy:** dashboard → "CSP reports" count. If it stays near zero while you click through the shop, Render → `CSP_MODE=enforce`. If reports name a legitimate host, add it with `CSP_CONNECT_EXTRA=https://that-host` (or ask me).
- **Order price check:** `/admin/security` → *Order price check* → **Enforce**, after normal orders (wallet + KHQR, with and without coupons, variant products) produced no "Order price check failed" alerts.

## 9. Tests you can run any time
```
npm test                        # 27 unit tests of the protection logic
npm run test:e2e                # starts the real server with a fake database
npm run dev:server              # (npm start) then in another terminal:
npm run security:smoke          # safe checks against http://localhost:3000
node tools/security-smoke.mjs --url https://YOUR-SITE --yes   # read-only checks on production (never blocks you)
```
`--aggressive` adds honeypot/injection/rate-limit probes to a remote site and **will block your own IP for ~15 minutes** unless you first allow-list it. Only test sites you own. Do **not** run flood/DDoS tools against production – Cloudflare may treat you as an attacker and it can take the shop offline.

## 10. Free monitoring
- UptimeRobot or Better Stack (free): monitor `https://YOUR-SITE/api/health` every 5 min, alert to email/Telegram.
- Supabase → Logs → Auth logs: look for bursts of failed sign-ins.
- Monthly: `npm audit`, review blocked IPs, rotate any key that was ever pasted into chat/email, check Cloudflare's IP list (https://www.cloudflare.com/ips/) against `server/security/ip.js` (changes are rare; twice a year is enough).

## If you think you were hacked
1. Cloudflare → Under Attack Mode. 2. Supabase → Authentication → sign out all users / change JWT secret only if keys leaked (this logs everyone out). 3. Rotate `SUPABASE_SERVICE_ROLE_KEY`, `BAKONG_API_TOKEN`, `ABA_PAYWAY_API_KEY`, Telegram/VAPID secrets in Render/Supabase. 4. Run the audit SQL and look at "who is admin" and recent `wallet_transactions`. 5. Keep the `/admin/security` event list (screenshot/export) – it is evidence if you report to the police or your bank.
