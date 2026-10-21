# Admin theme editor – edit right on the preview

Applies to Admin → Themes → Edit and Admin → Secret Code (same editor).

- One mode, **Edit on screen** (plus **Try it**). The three old modes and the "tab decides what a tap does" behaviour are gone.
- Tap **anything** in the preview: a floating toolbar appears right above it – no scrolling down to the tabs.
  - **Store parts** (cards, buttons, search bar, banner, nav…): fill / text / border colour, change picture, roundness, text size, line, spacing, fade, bold, shadow, fit, hide, reset. Banner also gets "Banner picture".
  - **Blank space = page background**: page colour, gradient colours, wallpaper, glass cards, Clouds shortcut.
  - **Your buttons / texts / pictures**: edit text inline, change picture, colours, size, text size, roundness, fade, turn, movement, front/back, copy, delete. Drag to move, pink corner to resize.
  - **Chiikawa mascots**: change picture (one button per variant), size, left-right, up-down, hide, reset. Drag the dashed box to move. Clouds: picture, height, size, speed.
- "More options" in the toolbar opens the full tab if you need it. Esc or × closes the toolbar.
- Changing a tab or a dropdown no longer jumps/scrolls the page.

Files: new `src/QuickBar.tsx`; edited `src/AdminSecretCode.tsx`, `src/secretTheme.tsx`, `src/themeElements.tsx`, `src/cool.css`.
Not verified: `npm install` / `npm run build` / a visual check could not be run here (no network). Type errors that remain in a bare check come from missing React typings only. Please run `npm run build` and try it once.
