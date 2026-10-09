# Admin create pages

- Removed the inline Create Order form from the admin Orders list. The button now opens `/admin/orders/new`.
- Removed the inline Create Customer Account form from the admin Customers list. The button now opens `/admin/customers/new`.
- Added standalone admin-only pages with their own validation, loading/error states, and cancel navigation.
- Order creation inserts the order and its order item into Supabase; if inserting the item fails, the new order is rolled back.
- Customer account creation uses the existing authenticated `/api/admin/customers` server endpoint and requires the server to be configured and reachable.

Build verification could not be completed in this environment because dependency installation did not finish before timeout. Please run `npm install` and `npm run build` before deploying.
