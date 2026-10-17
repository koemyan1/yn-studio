# Pictures everywhere, parts that stay on screen, loading page, default look
Run in Supabase -> SQL Editor once: supabase-default-look.sql and supabase-loading-screen.sql.

1. Stay on screen when scrolling: in Theme Studio every part (search bar, banner, category row, product card, headings, buttons...) has a new "Stay on screen when scrolling" tick and a "Distance from the top" slider. The bottom bar already stays put. Your own added elements already have Pin to screen / Pin to page.
2. Pictures: every part already has a Background picture and an Icon picture in Theme Studio (bottom bar, bottom-bar items, search bar, product card, product image area, buttons, panels, ...). Nothing changed there.
3. Default look (new): Admin > Themes > "Default look" opens Theme Studio for a look that everyone without a secret theme gets (pictures, sticky parts, colours, added elements, everything). It starts OFF; use "Turn on for everyone". A customer's own secret theme still wins.
4. Loading screen (new): Admin > Settings > "Loading page picture": upload a picture/GIF, background colour, text and size. Shown when the app opens and during payments / long actions, for every theme. Admin pages never show it.
Edited: src/secretTheme.tsx, src/AdminSecretCode.tsx, src/AdminThemes.tsx, src/main.tsx, src/customer.css. Not checked: npm run build / on-device test.
