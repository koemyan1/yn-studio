# v4 – auto background removal, clouds fix, new app icon

## Add / Edit product (Admin → Products)
- "Remove the background automatically" is now **ON by default**.
- It runs the moment you pick photos and the preview shows the cut-out (checkerboard = transparent) with a status:
  "Background removed ✓" or "Kept original (busy background)". Untick the box to keep originals.
- Save uploads exactly what the preview shows. Strength slider / colour fill options still work and re-run live.
- Option (variant) pictures are not cut out – only the main product photos.

## Chiikawa clouds (and sky)
Cause: the page container (.shop, .detail, .cartPage…) was painted opaque cream by an older rule in style.css
(`html[data-secret-theme=on] .shop { background-color: var(--secret-bg) !important }`), so it hid both the blue sky and the drifting clouds that live on <body> behind the content.
Fix: chiikawa.css makes those containers transparent for the Chiikawa preset. A per-page colour chosen in the Studio still wins.
Verified in a headless browser with the real CSS: sky + moving clouds now show on Home.

## App icon
- White, full-bleed square (no transparent corners / no purple tile) with the original YN letters cut out of yn-logo.png.
- Files: public/icon-192.png, icon-512.png, apple-touch-icon.png (180), favicon-32.png. manifest.webmanifest and index.html updated
  (separate "any" and "maskable" entries; letters sit inside the maskable safe zone; background_color white).
- In-app logo (yn-logo.png) is unchanged.
- Already-installed home-screen icons usually only update after removing and re-adding the app.

Not verified here: `npm install` / `npm run build` (no network). Please run `npm run build` before deploying.

## Khmer font
- Cause of the "wrong" Khmer font: the Chiikawa theme (and any theme font) forced its own font with !important, so Khmer letters fell back to a random system font. The Khmer rule is now stronger and always wins when the app is in Khmer.
- New default: Noto Sans Khmer. New picker in Admin → Secret Code → Look → **Khmer font** (Noto Sans Khmer, Kantumruy Pro, Battambang, Siemreap, Hanuman, Content) with a live sample. Saved per theme (`khmerFont`), no SQL needed. Fonts load from Google Fonts only when a customer uses Khmer.
