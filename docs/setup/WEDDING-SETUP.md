# Wedding invitation + Admin → Wedding

The invitation is a static page in `public/wedding/` (no build step of its own). The Node server serves it at **`/wedding/`**, so it lives on the same domain as the shop. The admin page is **Admin → Overview → Wedding** (`/admin/wedding`).

## 1. Edit the invitation
`public/wedding/config.js`: names, date, venue, map link, programme, photos, gift QR, music.
Photos go in `public/wedding/images/`, music is `public/wedding/music.mp3`, the gift QR is `public/wedding/images/khqr.png` (all optional; a missing file is simply skipped).

## 2. Database (RSVPs + wishes)
1. Supabase → SQL Editor → run `supabase/sql/supabase-wedding.sql` (safe to run again).
2. In `public/wedding/config.js` set `supabaseUrl` and `supabaseKey` to the **same project URL and anon public key** the shop uses. Never put the `service_role` key here.
3. Until both are set the invitation runs in demo mode (answers stay in the guest's browser and never reach the admin page).

## 3. Deploy
Push to GitHub; Render rebuilds. Open `https://YOUR-DOMAIN/wedding/`.
Personal link: `https://YOUR-DOMAIN/wedding/?to=Sophea` greets that guest and pre-fills the forms (the admin page makes these in bulk).

## What the admin page does
- Counts: replies, coming, can't come, total people attending.
- Share: copy the link, save a QR of it, make personal links from a list of names.
- Replies: search, filter, delete, export CSV. RSVPs are private: only an admin can read them (row level security).
- Wishes: see and delete messages shown on the invitation.

## Files
`public/wedding/*`, `src/AdminWedding.tsx`, `src/admin-wedding.css`, `supabase/sql/supabase-wedding.sql`; small edits in `server/index.js` (route + no-cache for the page's own js/css), `public/sw.js` (the service worker ignores `/wedding`) and `src/main.tsx` (route + sidebar link).

## Visual editor (new)
Open **Admin -> Wedding -> Edit design** (or `/wedding/?edit=1`). Tap any text or block and drag it; change its text, size, colour, font, hide it, or add new text (Cover / Inside). Tabs: **Seal** (shape, picture, letters, your own image, colour, size, position), **Envelope** (body, flaps, edge), **Colours**, **Butterflies** (golden, count, size, speed), **Pages** (extra pages with their own colour or picture), **Items** (add images and text anywhere), **Sound** (background music + a sound when the seal is tapped), **Save**.
Save tab -> *Download design.js* -> replace `public/wedding/design.js` -> push. Put pictures and .mp3 files in `public/wedding/`.

## Send an invitation to a customer (guest list)
1. Supabase -> SQL Editor: run `supabase/sql/supabase-wedding-invites.sql` once (after `supabase-wedding.sql`).
2. Admin: log in to the site, open `/wedding/?edit=1`, design it, then **Save -> Send to customer** (customer's account email).
3. Customer: open `/wedding/guests.html` (link it from their account/order page), log in, type guest names (one per line), then Copy link / Share per guest.
4. Each guest link (`/wedding/?i=...&g=...`) opens the envelope with that guest's name on the front; the customer sees "Opened ✓".
