# Wedding e-invitations

New: `src/Invitations.tsx`, `src/invitations.css`, `supabase/sql/supabase-wedding-invitations.sql`. Edited: `src/main.tsx`.

## Admin (Admin -> Overview -> Wedding Invitations, `/admin/invitations`)
- Create / edit / publish / unpublish / delete invitations, with a live phone preview next to the form.
- Names, message, date and time, venue, map link, phone button, programme steps, photo gallery.
- **Opening scene (tap to open)**: Envelope, Curtains, Grand doors, Tap cover. The admin picks the style and the opening picture.
- **Flying butterflies**: on/off, count (1-24), size, one colour or mixed pastels.
- **Songs**: upload MP3s (max 15 MB) or paste a direct link. Several songs play in a loop; music starts on the guest's tap.
- Six colour palettes, three font styles, custom accent colour, English or Khmer fixed labels.
- Share link `https://<your-domain>/i/<name>`, copy button, open button, QR code, open counter.

## Guests (`/i/:slug`)
- Public, no login. Only **published** invitations load (enforced by row level security, not just by the page).
- The YN Studio splash, install prompt, theme runtime and admin assistant are switched off on these pages.

## Setup
1. Run `supabase/sql/supabase-wedding-invitations.sql` once in Supabase -> SQL Editor (table, policies, view counter, `invitation-assets` storage bucket).
2. Deploy. Nothing else to configure.

## Not verified
Written without installing dependencies, so `npm run build` and a real Supabase round trip have not been run. Please test one invitation end to end (upload, publish, open the link in a private window).
