# Delivery fee per category

1. Run `supabase-category-delivery-fee.sql` once in Supabase -> SQL Editor.
2. Open **Admin -> Categories**. Every category card now has:
   * **Delivery fee** switch - off = free delivery for that category (customers see "Free").
   * **Fee amount ($)** - a fixed delivery price for that category. Leave it empty to keep using the distance-based price from Admin -> Settings.
3. Mixed carts: one order is one delivery, so the **highest** fee among the categories in the cart is charged. If every category in the cart has delivery switched off, delivery is free.

Existing categories keep charging delivery exactly as before until you change them.
