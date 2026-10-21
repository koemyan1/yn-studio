# v10 – copied mascots stay in place and move, Lock / Unlock everything

Applies to Admin → Themes → Edit and Admin → Secret Code (same editor). Saved inside the theme JSON – **no SQL needed.**

## 1. The copied mascot now stays in place like the original
- Cause: the original mascots are glued to the **page** (they scroll with it), but a copy was a free picture glued to the **screen**, so it slid away from the original as soon as the page scrolled or the screen size changed.
- Now every free picture has **Stays: On the screen / On the page (scrolls)** (floating bar → *Stays*, and Elements tab → *Where it stays*).
- *Copy* on a built-in mascot makes a **page** picture placed in the same spot of the store column, so it scrolls with the page exactly like the original. Mascots of a fixed bar (bottom navigation) are copied as **screen** pictures, because the bar itself does not scroll.
- Switching *Stays* converts the numbers so the picture does not jump.
- Page pictures: left-right = % of the store column, up-down = distance from the top of the page, size = real pixels (like the built-in mascots).
- Old themes are unchanged (every existing picture stays "On the screen").

## 2. Movement now plays in the editor
- Cause: motion only ran in *Try it* mode. In *Edit on screen* the built-in mascots bobbed (CSS) but your pictures were frozen.
- Now movement (float, wiggle, fly around, bounce, sweep, fall, orbit…) plays in Edit mode too. The **selected** picture holds still so you can drag it; everything else keeps moving.
- New button below the preview: **⏸ Pause motion / ▶ Play motion** (preview only).
- Page pictures roam the whole page; screen pictures roam the screen.

## 3. Lock (like Adobe Illustrator)
- **Lock** button in the floating bar of every kind of thing: your pictures/buttons/texts, built-in mascots, and store parts (cards, search bar…). 🔒 / 🔓 button on every row of the Elements list. Also *Lock this mascot* in the Mascots tab and *Lock it* in the Elements tab.
- A locked picture/mascot cannot be selected by tapping, dragged or resized – taps go through to what is underneath. It shows a small 🔒. A locked store part cannot be dragged. When you select a locked thing, its toolbar shows only **Unlock**.
- Below the preview: **🔓 Unlock everything (n)**, **🔒 Lock everything**, **⏸ Pause motion**.
- Locks are saved with the theme (like Illustrator files) and never affect customers.

## Files
Edited: `src/themeElements.tsx`, `src/AdminSecretCode.tsx`, `src/secretTheme.tsx`, `src/MascotHandles.tsx`, `src/chiikawaMascots.ts`, `src/cool.css`.

## Checked / not checked
Checked in real Chrome with the real `themeElements.tsx` bundled with React: motion plays in edit and live mode; selected picture pauses; page pictures scroll with the page and screen pictures do not; x position follows the store column on resize; dragging gives the right numbers; a locked picture ignores drag and lets taps through; Pause freezes motion. Syntax of every edited file.
NOT checked: `npm install` / `npm run build` and clicking through the full admin screen (no network here). Please run `npm run build`, then in Secret Code: Copy a top mascot, scroll the preview, give it a movement, press Lock everything and Unlock everything.
