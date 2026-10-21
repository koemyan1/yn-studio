# Products appear in a random order
No SQL. Home and the Snacks page now shuffle the product cards every time the page is opened, so products do not stay in the same place.
- Reshuffles on each visit/refresh; the order stays steady while the customer scrolls, searches or filters (no jumping).
- Category buttons and search still work as before.
- Admin product lists, Wishlist and orders are unchanged.
Edited: src/main.tsx (shuffled() helper, Shop, Snacks).
Not checked: npm run build / on-device test. Run npm run build before deploying.
