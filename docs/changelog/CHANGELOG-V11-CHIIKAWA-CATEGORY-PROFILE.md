# v11 – Chiikawa: text-only category buttons, tidy profile buttons

## Home – category buttons
- All mascot/icon pictures are removed from the category buttons in the Chiikawa theme. Only the text is shown.
- Clean pill buttons: same height, text centred, no big empty gap on the left, never squashed, one swipeable row with snapping. Selected one is pink.
- The editor's "Mascots on the category buttons" group is removed (there is nothing to move any more). Saved themes that had those settings still load fine.

## Profile – Admin Panel and Sign out
- Both buttons are now exactly the same size (56px high, full width), same text size, same icon size, centred, with an even 14px gap (before: different padding and an extra 8px on Sign out).
- The Account card is as tall as the Personal information card and the buttons sit at its bottom edge, lined up with "Save changes". Small pink icons in the card headers.

Files: `src/chiikawa.css`, `src/chiikawaMascots.ts`.
Checked: real Chrome render of the real stylesheets with the real markup at phone and desktop widths (before/after). NOT checked: full app build and the real Supabase data – please run `npm run build` and look at Home and Profile once.
