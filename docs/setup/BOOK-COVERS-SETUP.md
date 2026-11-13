# Book cover service (250 riel per page)

Customers open **Services -> Book cover**, pick a design (and, if they like, **more than one design in the same order**), answer your questions, pay **250 riel per page** with Bakong KHQR, drag their text where they want it and press **Send to print**. You download or print the finished covers from the admin. Cost: **$0** extra (Supabase, the Render server and Bakong you already use).

```
customer: pick design -> info -> other subjects? -> your order (+ Add another design) -> pay (phone + location + KHQR in riel) -> place text -> Send to print
admin:    Orders -> Download PDF / Print / Pictures -> Mark printed -> Mark delivered
```

## What you must do, in this order

1. **Bakong must already work** ([BAKONG-SETUP](BAKONG-SETUP.md)). Your Bakong account must accept **riel (KHR)** QR codes: book covers are paid in riel.
2. **Supabase -> SQL Editor:** run `supabase/sql/supabase-book-covers.sql` once (safe to run again). It creates the designs, the orders and a public bucket `book-covers` for the cover pictures. **Already ran it before multi-design orders?** Run it again: it adds the `items` column that lets one order hold several designs. Old orders keep working and need no conversion.
2b. **Optional, for wallet payment:** run `supabase/sql/supabase-book-cover-wallet.sql` once (after `supabase-wallet-separate-riel.sql`). Customers can then pay from their **riel wallet balance** instead of KHQR. Without it the Wallet button shows an error and KHQR still works.
3. **Deploy** the new code on Render (no new environment variables, no new packages).
4. **Admin -> Inbox -> Book covers -> Designs -> Add design** (see below).
5. Have a Khmer speaker read the Khmer text on the customer pages (it was machine-written).

## Adding a design

1. **Upload the blank cover**: an A4 portrait picture (JPG, PNG or WebP; about 2480 x 3508 px prints best). Larger pictures are shrunk to that size in your browser.
2. Give it a **name** and a **price per page** (250 riel by default, minimum 100).
3. **What should the customer fill in?** Press the buttons (Subject, Student name, Class, School, Teacher, School year, Other text). For each question you can set the Khmer wording, a hint, Required, **Changes for each subject**, Bold, font, size, colour and the maximum number of letters.
   - Tick **Changes for each subject** on the question that is different on every page (normally *Subject*). When a customer has more subjects, only those questions are asked again; everything else (name, class, school...) is copied to every page. If no question has this tick, the "other subjects" step is skipped.
4. **Drag each text on the cover** to where it should start. New questions start stacked in the middle of the cover. The customer can still move their text later.
5. Keep **Show on the Services page** ticked and press **Add design**.

Editing a design later does **not** change orders already placed: each order keeps its own copy of the picture and questions. For that reason the old cover picture is not deleted when you replace it.

## Orders with more than one design

- On the **Your order** step the customer can press **Add another design** (up to **6 designs** and **20 pages in all** per order). Each design keeps its own subjects and pages, and the customer pays **once**: the total is the sum of *pages x that design's own price*.
- The same design can only be added once (extra subjects are extra pages of it). Each design is priced from the database when it is added and then frozen on the order, exactly like before.
- In **Admin -> Book covers -> Orders** such an order shows a *N designs* badge, a price line per design and the pages grouped by design. **Download PDF / Print / Pictures** put every page of every design in one file, design after design.
- An unfinished order is kept in the customer's browser (one basket); the gallery shows a *Review order* bar until it is paid or cleared.

## Orders

- **Admin -> Book covers -> Orders** shows paid orders (tick *Show unpaid / cancelled* to see the rest) with the customer's name, phone (tap to call), location and a map link when they pinned it.
- Status: **paid** (customer is still placing text, you can already download), **submitted** (customer pressed Send to print, you also get a notification), **printed**, **delivered**. The customer is notified when you mark it printed or delivered.
- **Download PDF** gives one A4 page per cover. **Print** opens the print dialog with one full page per cover (set the printer to *no margins / actual size*). **Pictures** downloads each cover as a PNG.

## Good to know

- The price is read from the database on the server and frozen on the order; the customer's browser cannot change it. The order is marked paid only after Bakong confirms the exact riel amount. After payment the texts are locked; only their positions and sizes can change.
- Phone and location are required before the QR is shown. They are saved on the order and, only if the customer's profile does not have them yet, also on their profile.
- The riel wallet is not used for book covers (KHQR only).
- Fonts load from Google Fonts (Poppins, Noto Sans Khmer, Moul, Battambang...). If a font cannot load, a clean fallback is used.
