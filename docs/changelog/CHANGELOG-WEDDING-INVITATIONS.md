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

## Opening page layout, guest names and personal links
- **Move the open button anywhere**: Opening scene -> "Move them on the preview" lets the admin drag the button on the phone preview (stored as % of the screen, so it sits in the same spot on every phone).
- **Guest-name space (optional)**: tick "Add a blank space for the guest's name", drag it anywhere, choose size and colour. The name is shown in Khmer OS Muol Light (Google Moul as fallback). No name = nothing shown.
- **Send to a customer** (the invitation is a finished service made by the admin; there is no order button): pick the customer, press **Send to customer** (publishes it if needed). It appears as a card under "Your wedding invitation" on that customer's **Services** page. Tapping the card opens a sheet to add guest names. **Take back** removes it from the customer's page.
- **Personal links, unlimited**: the customer (or the admin for them) can use the original link or add a name, or paste many names (one per line). Each name gets its own link `/i/<slug>/<code>` that fills the name space. They can copy, share, rename and remove names; a removed name's link opens the invitation without a name. Each link shows how many times it was opened.
- SQL (same file, run again): `customer_id` on invitations, table `wedding_invitation_guests`, owner-only policies, `invitation_guest_name()` lookup. Safety cap of 10,000 names per invitation.

## Cinematic mode (third choice next to Guided form and Blank canvas)
New: `src/cinematic/*` (framework-free: `art.ts` original SVG elements and paper textures, `cinematic.ts` envelope + opening + cover, `sections.ts` the scrolling sections, `text.ts` all fixed Khmer/English wording, `cinematic.css`), `src/Cinematic.tsx` (React shell). No new dependencies: the motion uses the browser's built-in Web Animations API, CSS and a few scroll handlers (GSAP was not needed).
- **Envelope** (88% of the screen width): back panel, card inside, left/right/bottom pocket panels with edge shadows, a scalloped 3D flap with the name logo and a gold scalloped line, cream lining, the shadow the closed flap casts, a gold wax seal with an uneven poured edge lit by SVG specular lighting with the crest pressed in. Idle float and pointer / phone tilt.
- **Opening (about 5.9 s):** seal pressed, lifted with a growing shadow, set aside off screen; flap folds back 180° (behind the card once past 90°); card drawn out at a slight angle while the envelope settles; envelope dropped out of frame; card comes to the camera; fade through dark into the cover. Music starts on the tap. Honours `prefers-reduced-motion`.
- **Cover** fits one screen in portrait and landscape: crest, title, name logo (names reveal left to right, flourish draws, heart pops, butterfly flies in), English names, invitation line, ថ្ងៃ | ទី | ខែ | ឆ្នាំ row, lunar date, venue, scroll cue.
- **Sections:** formal words (arch photo, line-by-line reveal, both sets of parents) · couple (scalloped frames) · countdown in Khmer numerals over a slow blessing marquee · programme (gold thread draws with scroll, line icons draw and glow) · love story (pinned sideways strip, day to dusk) · candlelight (touch the water: ripples and a floating lotus lantern) · masonry gallery with a swipeable full-screen viewer · venue (Google Map embed, Open Maps, Save to Calendar .ics) · gift QR codes (always visible, Save QR) · thank you (candles light one by one, share via Telegram / Messenger / Facebook / copy link, name logo, footer credit "Design inspired by ynstudio" linking to ynstudio.site). A section is left out when it has nothing in it.
- **Khmer rules applied:** Khmer is always HTML text, never SVG text; gold-foil Khmer has extra padding so vowel signs and subscripts are not clipped; reveal masks use negative insets and are cleared afterwards; line-height ≥ 1.8; no letter-spacing on Khmer; Khmer numerals in Khmer mode; parents as “លោក …” then “និងលោកស្រី …”.
- **Admin:** everything is editable (names in Khmer and English, name-logo short names, parents, date, lunar date, venue, map pin, words, blessing, thanks, photos, love-story moments, gift QR codes, three palette presets plus custom colours and foil, language, guest name on the envelope, music) with the live phone preview. **Create preview picture** makes the 1200×630 link-preview image from the cover photo and names.
- **Link previews:** `server/index.js` now answers `/i/:slug` (and `/i/:slug/:code`) with that invitation's own title, description and image in the HTML (Khmer-first title, `og:*`, `twitter:*`), read from the published row only. Falls back to the normal page on any problem. CSP `frame-src` now allows Google Maps for the map embed.
- **Testing:** `tools/cinematic-qa/` holds the browser test page and scripts (real Chromium at 320×568, 390×844, 740×360, 1280×800). See its README.

## Guests (`/i/:slug`, `/i/:slug/:code`)
- Public, no login. Only **published** invitations load (enforced by row level security, not just by the page).
- The YN Studio splash, install prompt, theme runtime and admin assistant are switched off on these pages.

## Setup
1. Run `supabase/sql/supabase-wedding-invitations.sql` in Supabase -> SQL Editor (table, policies, view counter, `invitation-assets` storage bucket, admin-only notes table). Safe to run again; run it again if you ran an earlier version.
2. Deploy. Nothing else to configure.

## Not verified
Written without installing dependencies, so `npm run build` and a real Supabase round trip have not been run. Please test one invitation end to end (upload, publish, open the link in a private window).

## Cinematic mode: new seal, opening and colours (update)
Files: `src/cinematic/art.ts`, `cinematic.ts`, `cinematic.css`, `types.ts`; `src/Invitations.tsx`, `src/invitations.css`; `tools/cinematic-qa/index.html`. No new SQL, no new dependencies.

**The opening now tells one physical story (about 5.3 s, no cuts):**
1. The seal is pressed, a jagged crack runs across it and a few wax crumbs fall (phones vibrate briefly where allowed).
2. The flap lifts. The upper half of the seal is stuck to the flap and goes with it; the lower half stays on the envelope as a broken remnant. Warm light spills out of the patterned lining.
3. The card is drawn up and held for a moment so the names can be read (on short landscape screens it never rises off the top).
4. The envelope sinks away, the card comes to the camera, its light fills the screen and settles into the cover (this replaces the old fade through black, and the seal no longer flies off screen).

**Unique details:** a lotus pressed into the wax (embossed, not a glossy ball), a lotus-lattice lining inside the envelope and flap, gold dust drifting in the light on the envelope screen, a soft ring that pulses on the seal as the "tap here" cue.

**Colour fixes:**
- Four palettes, each five colours chosen to work together (paper, card cream, night, foil, wax): Jade + ruby wax (new default), Silk magenta + jade wax, Blush + wine wax, Indigo + pearl wax. Invitations saved with the old green palette (`olive`) pick up the new Jade automatically.
- New **Wax seal** colour for custom palettes (left empty = a wax that suits the foil).
- Gold text on cream was unreadable: headings, names and labels on light paper now use a deeper foil; ink colour is derived from the paper. Pale envelopes (Blush) use the deeper foil on the flap too.
- The cover and the envelope screen are lit and shaded with the palette's own night colour instead of flat black; the old olive-black is gone from the dark sections.
- Nothing in the stylesheet is a fixed gold or brown any more; all of it follows the palette.

**Tested** in real Chromium at 320×568, 390×844, 740×360 and 1280×800 (frames at exact times, real-time run, reduced motion, replay). Khmer fonts were not installed in the test machine, so check the Khmer wording on a real phone.
