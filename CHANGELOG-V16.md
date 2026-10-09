# YN Studio v16 changes

- Checkout submit button remains clickable when requirements are incomplete; pressing it shows the specific validation message instead of silently disabling the button.
- Customer profile no longer displays the delivery-location/map gate. Delivery selection and address entry are in checkout/payment.
- Checkout delivery form includes a “Save this as my default delivery address” option. Run `supabase-checkout-default-address.sql` in Supabase before using the new default flag.
- Admin coupons now have a permanent Delete action in addition to Enable/Disable.
- Unpublished products are hidden from cart/checkout data while their cart rows are preserved; publishing them again makes previously-added items visible again.

## Still requires server-side work

Admin-created customer accounts with passwords must be implemented through a Supabase Edge Function using the service-role key (never expose that key in the browser). The existing customer deletion action uses the `admin_delete_customer` RPC. An admin order-creation workflow and a fully editable editor for every actual customer route are not completed in this incremental patch.
