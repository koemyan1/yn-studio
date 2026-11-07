# Wedding: "Garden" (Braya) theme + full admin editor

New admin page: **Admin -> Overview -> Wedding editor** (`/admin/wedding-editor`, `/admin/wedding-editor?i=<invite id>`).

## What it does
- Edits **every part** of the garden invitation with a live phone preview: Cover (names, video, picture, button, music), Couple (wording, both portraits), Date (date and time, Khmer + lunar text, calendar and countdown headings), Schedule (add / remove / reorder rows, icons), Venue (name, map, YouTube), Gallery (upload many, reorder, delete), Gift (QR, holder, account), Thanks + ending, Style (colours, background), and a show/hide switch for each section.
- Same draft -> sent flow as the envelope theme: **Save draft**, **Save as new copy**, **Send to customer** (by account email; it appears on their Services page), preview link, link to the customer guest page. Saved in `wedding_invites` (`config = { theme: 'braya', braya: {...} }`), so guest personal links (`/wedding/?i=<invite>&g=<guest>`) work unchanged.
- Pictures are resized in the browser and uploaded to the existing public `invitation-assets` bucket (falls back to embedding the picture if the upload is not allowed). Unsaved edits are kept in this browser until saved.
- The invitation list on **Admin -> Wedding** now shows an Edit button that opens the right editor for each theme, plus "New garden invitation" / "New envelope invitation".

## Files
New: `src/AdminWeddingBraya.tsx`, `src/admin-wedding-braya.css`, `public/wedding/braya/*` (the theme itself; `?embed=1` is the live-preview mode used by the editor).
Edited: `src/main.tsx` (route + sidebar item), `src/AdminWedding.tsx` (links), `public/wedding/boot.js` (+ `index.html` version) so a saved garden invitation opens the garden page, `server/security/shield.js` (CSP `frame-src` allows YouTube for the venue video).

## Setup
No new SQL or dependencies. Needs `supabase/sql/supabase-wedding-invites.sql` (already required by the envelope theme) and, for picture upload, `supabase-wedding-invitations.sql` (creates `invitation-assets`).

## Not verified
Written without installing dependencies: `npm run build` and a real Supabase round trip have not been run. Test: open the page, edit, Save draft, open the preview link in a private window, then Send to a test customer.

## Update: gold text + Khmer OS Muol Pali
- All text in the garden invitation is now deep gold. Titles, names and section headings use a gold foil; body text is solid gold with a soft cream halo, and text that sits straight on the flowers has a cream panel behind it so it stays readable. Names on the cover and ending picture use a bright gold foil with a dark gold edge (readable on light and dark pictures).
- Headings, names, the open button and Khmer section titles use **Khmer OS Muol Pali** (Google's Moulpali is the fallback on devices without it). Extra padding and line-height keep Khmer vowel signs from being clipped.
- Admin -> Wedding editor -> Style: new **Light gold** colour and a **Heading font (Khmer)** choice (Muol Pali / Muol Light / easy-to-read). Invitations saved with the old brown / grey text colours are switched to the new gold automatically.
- Files: `public/wedding/braya/braya.css`, `braya.js`, `content.js`, `index.html`; `src/AdminWeddingBraya.tsx`.
- Invitation name: editable at the top of Wedding editor (and in the Save tab); renaming a saved invitation saves the name immediately, without touching other unsaved edits.
