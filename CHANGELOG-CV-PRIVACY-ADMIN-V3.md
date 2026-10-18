# CV privacy + new admin look (v3 "Midnight")

## 1. CVs are private to the customer who made them
- `src/CvMaker.tsx`
  - The unfinished-CV draft was saved in the browser under ONE shared key, so another customer logging in on the same phone/computer saw the previous person's typing. It is now saved per user id, and the old shared key is deleted automatically.
  - "My CVs" list, opening a CV, and the paid-check now always filter by the logged-in user's id (before, they relied only on the database rules).
- `supabase-cv-maker.sql` and the new `supabase-cv-private.sql`
  - The read rule is now owner-only (the old rule also let admins read every CV). RUN `supabase-cv-private.sql` once in Supabase -> SQL Editor.
  - Server routes (`server/index.js`) already checked the owner; no change needed.

## 2. New admin panel style for every page
- New file `src/admin-v3.css`, imported last in `src/main.tsx` (one line). Remove that import to go back to the old look.
- Dark floating sidebar with glowing active item, glass top bar, indigo->cyan accent, rounder cards, pill buttons, coloured stat tiles, softer tables/fields, staggered page entrance, light + dark mode, mobile drawer.
