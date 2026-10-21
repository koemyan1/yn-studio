# Location input update

- Removed the customer map picker and GPS-based location selection from delivery information and checkout.
- Customers can enter a city or province in a simple text field.
- Delivery city/province, customer name, phone, and optional delivery notes are saved to the existing Supabase `profiles` row using the existing `delivery_address` and `delivery_notes` fields.
- Checkout no longer requires latitude/longitude. Orders created with text-only locations do not enable live rider map tracking.
- When a delivery settings row exists, checkout uses its base delivery fee because a city/province text field cannot calculate route distance.
