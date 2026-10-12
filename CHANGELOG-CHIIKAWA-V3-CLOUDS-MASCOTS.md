# Chiikawa theme v3 – moving clouds + editable mascots

## Clouds
- New seamless strip `public/chiikawa/clouds.svg` (generator: `tools/chiikawa-art/gen_clouds.py`).
- `chiikawa.css`: two cloud layers (big/front, small/back) drift **right → left** across the top of every customer page, endless loop, with a little parallax. Paused automatically for people who use "reduce motion".
- The old fixed clouds were removed from `sky.svg` so every cloud moves.

## Mascots – Admin → Secret Code → **Mascots** tab (new)
- Every mascot picture is now a replaceable "slot": top-left / top-right / next to store name / search bar / each kind of category button
  (incl. food, burger, cake, drink, coffee, ice-cream) / product-card corners / inner-page top bar / bottom-bar trio / empty pages / wallet card / no-photo product / loading.
- For each place: **Replace picture** (PNG with transparent background works best), move left-right / up-down, size %, hide, reset.
- **Drag in the preview:** open the Mascots tab, then drag the pink dashed boxes on the phone preview. (Boxes appear on the page you are previewing – switch the "Preview page" menu to reach Cart / Wallet etc.)
- **Clouds:** replace the strip, change speed (seconds per trip), height, size, or hide them.
- **Put a mascot anywhere:** "Add a free mascot picture" creates a normal draggable picture element (Elements tab) – it can also fly around the screen or open a page when tapped.
- Saved inside the theme JSON (`mascotImages`, `mascotPos`, `cloudSeconds`) – **no new SQL needed**.

## Files
New: `src/chiikawaMascots.ts`, `src/MascotHandles.tsx`, `public/chiikawa/clouds.svg`, `tools/chiikawa-art/gen_clouds.py`
Edited: `src/secretTheme.tsx`, `src/themeElements.tsx` (one type), `src/AdminSecretCode.tsx`, `src/chiikawa.css`, `src/cool.css`, `src/admin.css`, `public/chiikawa/sky.svg`, `tools/chiikawa-art/gen_art.py`

## Not verified here
No network / no browser in my environment: `npm install`, `npm run build` and a visual check were NOT run (syntax of all edited TS files was checked). Please run `npm run build` and look at the Mascots tab once before deploying.
