# Snack orders get their own status flow and animations
1. Run supabase-snack-order-statuses.sql once (adds "Waiting for a delivery driver" and "Out for delivery").
2. An order counts as a snack order when every item in it is a Snacks-page product.
3. Customer Orders > View order for a snack order:
   Paid (box) > Processing (box) > Waiting for a delivery driver (NEW radar-search animation) > Out for delivery (NEW motorbike animation) > Completed (green check) or Cancelled (red X).
   Step list: Paid, Processing, Waiting for a driver, Out for delivery, Delivered.
4. Admin > Orders: snack orders only offer the snack statuses (the China/Cambodia warehouse ones are hidden); normal orders hide "Waiting for a delivery driver". An order's current status is always kept in the list.
5. Normal (non-snack) orders are unchanged.
Edited: src/main.tsx (snackOrderIds, orderStage, OrderScene, OrderView, Orders, AdminOrders), src/orders.css.
Not checked: npm run build / on-device test (no network here).

## Truck update
- Every truck animation (left China warehouse, left Cambodia warehouse / out for delivery on normal orders) now has a purple cab and stripe, and shows the YN logo (public/yn-logo.png) on the truck body instead of the "YN" letters. The China/Cambodia colour difference is gone.
- The snack motorbike's delivery box got the same purple stripe and logo.
