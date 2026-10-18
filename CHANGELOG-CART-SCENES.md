# Shopping-cart animations (customer paid + admin new paid order)

New: `src/CartScenes.tsx`, `src/cartScenes.css`, `supabase-realtime-orders-cart.sql`. Edited: `src/main.tsx`.

- **Customer**: when an order is paid (KHQR *or* wallet) a cart rolls in from the left, every item of the order
  (its product photo, max 10 shown, any number of items) drops in one after another, then the cart drives off to the right.
  Plays on top of the existing "Payment received" screen / before the Orders page.
- **Admin**: while the admin panel is open and a customer's order becomes paid, a cart comes in from the left,
  stops in the middle for ~2 s with "New paid order #… / $total", then leaves to the right. Several orders queue up.
- Run `supabase-realtime-orders-cart.sql` once so the admin only sees it on unpaid -> paid changes.
- Honours "reduce motion". Test from the browser console: 
  `window.dispatchEvent(new CustomEvent('yn-cart-scene',{detail:{mode:'admin',label:'Test',sub:'$1.00'}}))`

## Update: supermarket cart + purple admin
- Cart is now a bigger supermarket trolley (wire basket, purple handle, lower tray, spinning wheels, "YN SHOP" plate).
  The products sit INSIDE the basket (stacked in rows, visible through the wire sides). The admin cart arrives already holding the order's products.
- Admin panel recoloured purple on every page (light + dark mode): `src/admin-v3.css` (palette, purple sidebar, header, buttons, stat tiles, banners).
