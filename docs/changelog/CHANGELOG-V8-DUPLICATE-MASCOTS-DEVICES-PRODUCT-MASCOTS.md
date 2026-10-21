# v8 – duplicate mascots, same spot on every device, a mascot on every product

Applies to Admin → Themes → Edit / Admin → Secret Code (same editor) and the new Admin → **Product Mascots** page.
Everything is saved inside the theme JSON – **no new SQL needed.**

## 1. Duplicate a mascot (with its movement)
- Tap a built-in Chiikawa mascot in the preview → floating bar → **Copy**. Also in Mascots tab → **Duplicate this mascot**.
- The copy is a free picture placed next to the original, same picture, same size, and the **same movement** (the two top mascots bob, so their copies bob). Drag it anywhere, change its movement in the bar (*Move*: float, wiggle, fly around the screen, bounce, orbit…).
- Free pictures/buttons/text already had **Copy**; it now also copies the movement settings safely (no shared data between copy and original).

## 2. Same place on every device
- Before: a free picture's x/y marked its *top-left corner* as a % of the screen but its width was in pixels, so "middle" was only the middle on one screen size.
- Now x/y are the **centre** of the picture (50 / 50 = dead centre on every phone, tablet and computer; 0/0 and 100/100 are the exact corners). The whole picture (text, borders, icons too) grows/shrinks with the screen width (phone = 1×, up to 1.6× on large screens), so proportions stay the same.
- Elements saved with the old system are converted automatically so they stay exactly where they were on a phone.
- New buttons in Elements tab: *Centre left-right / Centre up-down / Dead centre*. Use the Phone / Tablet / Computer buttons above the preview to check.
- Moving ("fly around", "bounce", "sweep", "fall") still reaches the real edges of each screen.
- Mascots that belong to a part of the store (search bar, product card, top bar…) are anchored to that part, so they follow it on every device.

## 3. Product Mascots page (Admin → Catalog → Product Mascots)
- Pick the theme, tick *Show a mascot on every product*, choose **how many mascots** (slider) and press **Pick N random mascots for me**. Every product card gets one from that group at random.
- The pick depends only on the product id + a "shuffle number", so it is identical on every device and after reloads, and **a product added later gets its mascot automatically**. The page also updates live when a product is added.
- Also: 1–3 mascots per product, size, movement (still / float / wiggle / hop / pulse / mixed), *Shuffle who gets which*, add your own mascot pictures, and change or remove the mascot of one single product ("Change" → saved even after shuffling; "Back to automatic").
- Customers see it with that theme on the Home page and Wishlist. The Chiikawa preset's old fixed corner mascot on the cards steps aside while this is on. The "Mascots on the product cards" move/size/hide settings in the Mascots tab still apply to the new ones.
- The theme editor no longer overwrites these settings when you save a theme.

## Files
New: `src/productMascotsCore.ts`, `src/ProductMascots.tsx`, `src/AdminProductMascots.tsx`
Edited: `src/themeElements.tsx`, `src/AdminSecretCode.tsx`, `src/secretTheme.tsx`, `src/MascotHandles.tsx`, `src/chiikawaMascots.ts`, `src/main.tsx` (card, route, menu), `src/cool.css`, `src/admin.css`

## Checked / not checked
Checked: logic tests in Node (old-position migration, stable random pick, new product auto-assigned, overrides, junk-input clean-up); a real Chrome test of the exact overlay CSS at 360/390/768/1440/1920 px wide (centre, corners, rotation, fly-around reaching the screen edges); syntax of every edited file.
NOT checked: `npm install` / `npm run build` and clicking through the admin screens (no network or React install here). Please run `npm run build`, open Admin → Product Mascots once, and Duplicate a mascot in the editor before deploying.
