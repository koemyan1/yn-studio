# v6 – edit, move and re-skin ANY part in the theme editor

Applies to Admin → Themes → Edit and Admin → Secret Code (same editor). Customers get the result automatically (no SQL needed – it is saved inside the theme JSON).

## What is new
- **Tap anything.** Tapping a thing that is not one of the named parts (any text, button, icon, label…) now makes it a "tapped part" with every tool. Blank space is still the page background.
- **Move up / down / sideways.** Every part has *Left-right* and *Up-down* sliders and ▲ ▼ nudge buttons in the floating bar, and you can **drag it in the preview** (mouse: just drag; phone/tablet: tap it once to select, then drag). The page layout around it does not jump.
- **Background.** Every part now has a Fill colour and a *Back picture* (before, only some had them).
- **Icon.** Every part (except plain pictures) has an *Icon* picture, *Icon size* and *Icon spot* (before / after / above the text). The picture replaces the part's own little icon; switch "Old icon" on to keep both. Icons are real elements, so they never clash with the Chiikawa mascots.
- Parts tab: same new controls, "Tapped parts" group in the part list.

## Good to know
- A change applies to every part of the same kind (e.g. all product cards, all nav items). For one single free-standing item use the Elements tab.
- Saved theme JSON gets two new things: `customParts` (selectors of tapped parts) and, inside `components`, `moveX`, `moveY`, `icon`, `iconSize`, `iconSide`, `iconKeep`. Older themes work unchanged.

## Files
New: `src/PartIcons.tsx`. Edited: `src/secretTheme.tsx`, `src/AdminSecretCode.tsx`.

## Checked here / not checked
Checked in a real headless browser (with the app's own functions): generated CSS (move, icon, hiding the old icon, selector clean-up), picking a selector for tapped things, icon placement and re-adding after React re-renders, mouse drag + click vs. drag, touch only drags a selected part.
NOT checked: `npm install` / `npm run build` and the full admin screen (no network here). Please run `npm run build` and try Admin → Secret Code once.
