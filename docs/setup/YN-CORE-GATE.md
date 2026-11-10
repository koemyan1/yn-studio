# YN CORE GATE: five coins + Face ID in front of the admin

## What it does

1. You hold your phone to **any** of the five coins. It opens `/yn-core` and shows five coins turning slowly in a ring. The coin you tapped lights up gold.
2. You tap the other coins (any order, each once). You have **5 minutes from the first tap** to link all five.
3. When all five are lit, the coins fuse into one core and the page asks for **Face ID / Touch ID**.
4. A passed check opens the **boss-only pages** (YN CORE and Admins) for 20 minutes (it stays open while you work, with a hard stop at 2 hours). **Your normal admin login still applies on top.**

By default the ritual guards only those boss-only pages, because admins you appoint (see `YN-CORE-OWNER.md`) have no coins and must keep using the normal admin. Running the shop alone? Set `YN_CORE_GATE_SCOPE=all` and the whole admin sits behind the ritual.

Every tap sends you an alert ("coin 03 tapped (2/5)"). A failed Face ID check burns the five taps and alerts you.

## Before you turn it on (do this in order)

1. Finish `YN-CORE-SETUP.md`: SQL, pepper, `PUBLIC_URL`, a passkey (YN CORE > Security) and your 10 recovery codes.
2. Activate all five coins in YN EMERGENCY and write each URL to its NTAG215 sticker. Test each tap on a spare sticker first. **Do not lock a sticker read-only until you have tested it.**
3. Try the whole ritual with the gate still **off** (the default). The page shows "Test mode" and nothing is locked.
4. Only then set `YN_CORE_GATE=on` in Render and redeploy. Keep one logged-in admin session open in a second browser while you test, so a mistake cannot lock you out.

## Settings (server only)

| Variable | Default | Meaning |
|---|---|---|
| `YN_CORE_GATE` | off | `on` = the guarded pages answer 404 and their API answers 403 until the ritual succeeds |
| `YN_CORE_GATE_SCOPE` | `owner` | `owner` = guard YN CORE + Admins only. `all` = guard the whole admin (only right if you are the sole admin) |
| `YN_CORE_COIN_MODE` | `gate` | `redirect` = the old behaviour (a coin leads to its destination) |
| `YN_CORE_GATE_TAP_MIN` | 5 | minutes to tap all five coins |
| `YN_CORE_UNLOCK_MIN` | 20 | minutes the admin stays open (slides while in use) |
| `YN_CORE_UNLOCK_MAX_MIN` | 120 | hard stop |

## NTAG215 facts

- It holds one fixed URL and cannot sign each tap. Anyone who holds a phone to a coin can read and copy its URL. **The five taps are the ritual; the Face ID passkey is the real lock.**
- If a coin is lost or copied: YN CORE > coin > Regenerate URL or Revoke, then rewrite the sticker.
- iPhone opens a new browser tab per tap. That is fine: progress lives in a signed cookie, not in the page.

## What it does NOT protect (read this)

- It protects the guarded **pages** and the server's matching **`/api/admin/...`** routes (everything under `/api/admin` with `YN_CORE_GATE_SCOPE=all`). The browser also talks to Supabase directly (row level security). Someone who stole your admin password could still use that path. Keep a strong password and 2-step login on Supabase and on your admin account.
- While the gate is on, the **mobile app's** admin screens cannot use `/api/admin` (the cookie is not sent cross-origin).
- YN EMERGENCY and its recovery screen stay reachable with the gate closed, because they are how you get back in if a coin is lost. They need your login, a passkey, and (for recovery) a one-time code and a 30-minute wait with an alert.
- All five coins are required. If one is lost: use the recovery path above (login + passkey + recovery code), then regenerate that coin.
- Cookies: `HttpOnly`, `SameSite=Lax`, signed with the YN CORE pepper (so rotating the pepper works like it does for coin URLs). They contain no secret, only "coins 1,3,4 tapped until 10:05" or "unlocked until 10:20".

## Cloudflare

Keep the cache rule from `YN-CORE-SETUP.md`: **bypass cache** for `/nfc/*`, `/api/*` and `/yn-core`.

## Tests

`node --test tests/core-gate.test.mjs` (no network, no database). 16 tests: ritual order and window, bots, forged or swapped cookies, replayed challenges, wrong passkey, expiry and hard stop, gate off by default, admin pages 404 / API 403 while locked.
