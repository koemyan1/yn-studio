# YN CORE: NFC coins 01–05, YN EMERGENCY, passkeys

YN CORE gives you five independently managed NFC coins. Each coin is an ordinary NFC sticker that holds **one permanent URL**. Everything that can change (where a tap leads, whether the coin works, who may reconfigure it) lives on the **server**.

- **YN CORE** (`/admin/core`): the five coins, destinations, rotation, analytics, tap log, pause / regenerate / revoke, passkeys, audit log.
- **YN EMERGENCY** (`/admin/emergency`): the private place where each coin is activated for the first time. It locks itself coin by coin, and for good after the fifth coin. `/admin/emergency/recover` is the only way to reopen it.
- It is **off** until you set `YN_CORE=on`. With it off, every YN CORE address answers 404 and the rest of the site is unchanged.

## What an NFC sticker can and cannot do (read this first)

- A normal sticker (NTAG213/215/216) holds a fixed URL. **It cannot rewrite itself and your server cannot write to it.** Only a phone with a writer app can, and only until the sticker is locked.
- So "automatic rotation" never means rewriting the sticker. The URL on the sticker stays the same; the **server** changes the destination (or switches the coin off). Rotating the *address itself* (regenerate) is a manual action that needs a passkey and a trip to the sticker with your phone. Do not lock a sticker (read-only) until you have tested it, and test on a spare first.
- Anyone who holds a phone to the sticker can read the URL, and can copy it to another sticker. The URL is a *capability*, not a login: it only ever opens what you set for that coin and never an admin page. If a sticker is lost or copied, regenerate (or revoke) the coin and its old URL dies.
- iPhones cannot write NFC tags from Safari (Web NFC is Android Chrome only). Use an NFC writer app on iPhone, or the “Write to sticker” button on Android Chrome. Reading works on iPhone XS and newer.
- Optional later upgrade: NTAG 424 DNA stickers sign a different URL on every tap, which gives true per-tap credentials with no rewriting. They need a different tag type and extra server code (not included).

## Setup

1. **Database** (Supabase → SQL Editor): run `supabase/sql/supabase-yn-core.sql` once. It only creates new `yn_core_*` tables and functions. Try it on a test project first.
2. **Server settings** (Render → Environment). Never put these in a `VITE_` variable:

   | Variable | Value |
   |---|---|
   | `YN_CORE` | `on` |
   | `YN_CORE_PEPPER_CURRENT` | `v1` |
   | `YN_CORE_PEPPER_V1` | a long random secret (at least 32 characters). Make one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `PUBLIC_URL` | `https://ynstudio.site` (must be https; this is also the passkey address) |
   | `YN_CORE_ALLOWED_HOSTS` | optional: comma list of websites destinations may point to (subdomains included) |
   | `YN_CORE_RECOVERY_DELAY_MIN` | optional, default 30: waiting time before recovery can be opened |
   | `YN_CORE_RECOVERY_WINDOW_MIN` | optional, default 15: how long YN EMERGENCY stays open after recovery |

   Back up the pepper somewhere safe. **If it is lost, every coin URL stops working** (the database only holds a keyed hash of each URL). Redeploy the Node server afterwards.
3. **Cloudflare** (if you use it): add a cache rule to **bypass cache** for `/nfc/*` and `/api/*`.
4. **Passkeys**: sign in with your password, open **YN CORE → Security**, and add this device (Face ID / Touch ID / fingerprint). You get 10 recovery codes **once**: print or write them down and keep them offline. Add a second device or security key too.
5. **Activate coins**: open **YN EMERGENCY**, pick coin 01, approve with Face ID / passkey, set a name and first destination, activate. The URL appears **once**: write it to the sticker (writer app, or “Write to sticker” on Android Chrome), then tap the sticker once. The coin card shows “✓ sticker tested” after the first real tap.
6. Repeat for each coin. Each one asks for Face ID / passkey again: the session is single-use and ends the moment the coin is activated.
7. After coin 05, YN EMERGENCY locks. The menu item disappears and `/admin/emergency` answers 404 (the code stays in the app).

## How it stays safe

| Rule | How |
|---|---|
| Unpredictable URLs | 32 random bytes from the OS (256 bits), 43 URL-safe characters, one per coin and per regeneration. No counters, names or short IDs. |
| Tokens are not stored | Only `HMAC-SHA256(pepper, token)` is saved. A database leak cannot rebuild any URL. The URL is shown once. |
| Face ID without fake Face ID | Real WebAuthn: `userVerification: required`, platform authenticator preferred. The device checks your face; the server only receives a signature and checks the “user verified” flag. No biometric data exists in this project. |
| Per-coin auto-lock | The init session is single-use, one coin only, 5 minutes, kept in browser memory. The database function that activates the coin consumes the session in the same transaction. A replay, another coin or another action is refused. |
| Final lock | The same function sets `init_locked` when the 5th coin becomes active. The server then answers 404 for the page and the API; hiding the menu is only cosmetic. |
| Recovery | Fresh passkey **and** a one-time offline recovery code **and** a waiting period (default 30 min) with an alert to admins, who can cancel. It reopens initialization for a short window that closes by itself and re-locks when all five coins are active. |
| Revocation | Per coin, instant. Regenerate gives a new URL; the old one can keep working for a grace period you choose (0 = dies at once). |
| Server-side rotation | Destinations have priority, weekdays, daily hours and dates. “Rotate” mode steps through the available destinations on a timer. It is computed when someone taps, so no scheduled job is needed. |
| Logs | The token never reaches logs: `/nfc/<token>` is written as `/nfc/:token` everywhere. Taps store a daily anonymous visitor code, country and device class, not IP addresses; 90-day retention. |
| Audit | Append-only, hash-chained table of every sensitive action. |
| Open redirects | Destinations must be https to a public website (no IPs, localhost, ports or logins), optionally restricted by `YN_CORE_ALLOWED_HOSTS`. |
| Where it works | Passkeys are bound to the `PUBLIC_URL` address. Other addresses (for example `onrender.com`) and the mobile app are refused for passkey actions. |

## Everyday use

- Change where a coin leads: **YN CORE → coin → Destinations**. Takes effect on the next tap.
- Lost or copied sticker: coin → **Regenerate URL** (then rewrite the sticker) or **Revoke coin**.
- Pause a coin: taps show a neutral “Not found” until you resume.
- Crawlers and link previews are recognised and not counted.

## Lost every passkey

Recovery needs a passkey, so if you lost all of them you cannot use the web screens, on purpose. Break-glass (you, with Supabase SQL Editor access):

1. Sign in normally (password), add a new passkey in **YN CORE → Security**. Adding a *first* passkey needs a login from the last 10 minutes. First revoke the lost ones so the page treats you as having none:
   `update yn_core_admin_credentials set revoked_at = now() where user_id = '<your user id>';`
2. New recovery codes are created when the new passkey is added if none exist. Old codes: `delete from yn_core_recovery_codes where user_id = '<your user id>';` first.
3. To reopen initialization directly: `update yn_core_state set recovery_window_until = now() + interval '15 minutes';`

Anyone who can run SQL on your project can do this, so protect your Supabase account (strong password + 2-step login).

## Rotating the server secret (pepper)

Add `YN_CORE_PEPPER_V2`, set `YN_CORE_PEPPER_CURRENT=v2`, **keep V1**. Existing URLs keep working and are re-keyed to V2 the next time each one is tapped. Remove V1 only when every coin has been tapped (or regenerated). Sessions and visitor codes switch immediately; recovery codes keep working as long as V1 is present.

## Known limits

- Single admin account model: all admins share one audit trail; passkeys belong to each admin separately.
- Synced passkeys (iCloud Keychain, Google Password Manager) are accepted and marked “synced”. If that is not acceptable for you, use a security key.
- Destination changes need only your admin session (they are audited and validated). Irreversible coin actions need a passkey.
- The pepper lives in Render’s environment. Anyone with Render access can read it.
- Voice (the future “YN CORE” voice assistant): not wired in. Design rule when you add it: voice may read status and pause a coin with confirmation, but must never activate, regenerate, revoke or reopen, and must not use the assistant “code skills” to reach these endpoints. Browser speech recognition may send audio to the browser vendor.

## Tests

`node --test tests/core.test.mjs` runs the unit tests (tokens, WebAuthn with a software authenticator, rotation, URL rules). To also run the database tests against the real SQL, point `YN_CORE_TEST_PG=host:port` at a **scratch** Postgres where the SQL file has been applied (never your real project).
