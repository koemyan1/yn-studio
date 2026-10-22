# Wedding e-invitations

New: `src/Invitations.tsx`, `src/invitations.css`, `supabase/sql/supabase-wedding-invitations.sql`. Edited: `src/main.tsx`.

## Admin (Admin -> Overview -> Wedding Invitations, `/admin/invitations`)
The editor follows five parts, with a live phone preview beside it:
1. **Bride & Groom Information**: groom and bride full names, both sets of parents.
2. **Wedding Details**: date, day of the week (fills itself from the date), time, reception time, venue / house address, Google Maps link, invitation wording.
3. **Ceremony Schedule**: any number of events, each with name, date and time. One-tap suggestions for ពិធីសូត្រមន្ត, ជាវខាន់ស្លា, ហែជំនូន, ចងដៃ, កាត់សក់, ពិសាភោជនាហារ. Events can be added and removed.
4. **Invitation Design**: template (6 presets that set colours, font, opening and butterflies), groom and bride photos, pre-wedding gallery, colours, language (Khmer / English / bilingual), Khmer fonts per part (Khmer OS Muol Light, Khmer OS Muol Pali, or an easy-to-read body font; the real fonts are used when installed on the guest's device, otherwise Google's Moul / Moulpali), opening scene (Envelope, Curtains, Grand doors, Tap cover) with its own picture, flying butterflies, music (MP3 upload or link), additional text or special requests.
5. **Other Information**: phone, Telegram (optional), preferred completion date, special instructions for the designer.
Plus **Publish & share link**: link, copy, open, QR code, open counter.

Preferred completion date, special requests and designer instructions are stored in a separate admin-only table (`wedding_invitation_private`) and are never sent to guests.

## Blank canvas (new: `src/InviteCanvas.tsx`)
"New blank canvas" in the list, or the Guided form / Blank canvas switch at the top of the editor. Opens a full-screen builder:
- Add text (Khmer fonts incl. Muol Light / Muol Pali, and English scripts), images, buttons (link / map / call / Telegram), shapes, a countdown, and **freehand drawings**.
- Drag, resize (corner handles keep proportions; text corners scale the font), rotate, snap to page centre/edges, arrow-key nudge, double-click text to type on the page.
- Layers (front/back/forward/backward), lock, duplicate, copy/paste, undo/redo, zoom, multiple pages, page background colour/picture, per-item entrance animations (fade, slide, zoom) and loops (float, pulse, spin).
- Pages are 390 px wide and scale to each guest's screen. The opening scene, butterflies, music loop and share link work exactly as in the guided form.
- Buttons can also **go to another page** of the invitation. A page marked "Hidden page" is left out of the normal scroll and opens as its own screen (with a back arrow) when a button points to it; a normal page is scrolled to.
- Stored inside the existing `data` column (`data.mode = 'canvas'`, `data.canvas`), so no new SQL.

## Guests (`/i/:slug`)
- Public, no login. Only **published** invitations load (enforced by row level security, not just by the page).
- The YN Studio splash, install prompt, theme runtime and admin assistant are switched off on these pages.

## Setup
1. Run `supabase/sql/supabase-wedding-invitations.sql` in Supabase -> SQL Editor (table, policies, view counter, `invitation-assets` storage bucket, admin-only notes table). Safe to run again; run it again if you ran an earlier version.
2. Deploy. Nothing else to configure.

## Not verified
Written without installing dependencies, so `npm run build` and a real Supabase round trip have not been run. Please test one invitation end to end (upload, publish, open the link in a private window).
