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

## Guests (`/i/:slug`)
- Public, no login. Only **published** invitations load (enforced by row level security, not just by the page).
- The YN Studio splash, install prompt, theme runtime and admin assistant are switched off on these pages.

## Setup
1. Run `supabase/sql/supabase-wedding-invitations.sql` in Supabase -> SQL Editor (table, policies, view counter, `invitation-assets` storage bucket, admin-only notes table). Safe to run again; run it again if you ran an earlier version.
2. Deploy. Nothing else to configure.

## Not verified
Written without installing dependencies, so `npm run build` and a real Supabase round trip have not been run. Please test one invitation end to end (upload, publish, open the link in a private window).
