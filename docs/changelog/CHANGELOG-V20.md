# YN Studio v20 — Admin customer accounts, manual orders, and map refresh

## Admin → Customers
- Added a visible **Create Customer Account** action.
- Form captures name, email, and a temporary password (minimum 6 characters).
- New server endpoint `POST /api/admin/customers` validates the caller's bearer token, checks that the caller has the `admin` role in `profiles`, creates the Supabase Auth user with email confirmed, and creates the linked customer profile.
- The service-role key remains server-side. If profile creation fails, the newly created Auth user is removed to avoid an orphan account.

## Admin → Orders
- Added a visible **Create Order** action.
- Admin selects an existing customer and published product, sets quantity and delivery fee, and can enter an address and phone.
- Creates the order and its line item, then refreshes the normal order list. If line-item creation fails, it attempts to remove the incomplete order.

## Map
- Uses CARTO Voyager map tiles for a more detailed, navigation-app-style map.
- Added a purple YN pin with a motorbike glyph, clearer search box and rounded purple styling.
- Cambodia search restriction remains in the customer location picker.

## Deploy notes
- Deploy both `src/` and `server/index.js`; the account endpoint requires the updated Node server.
- Existing server environment variables remain required, including `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_USER`, `SMTP_PASS`, and `OTP_SECRET`.
- Verify the logged-in admin has `profiles.role = 'admin'` and that RLS permits admins to insert into `orders` and `order_items`.
- A production build could not be verified in this workspace because `npm install` timed out. Check Render build logs before promoting this version to live.


## v21 hotfix notes
- Admin-created orders no longer send `delivery_name`, which was not present in the deployed `orders` table schema.
- Customer creation builds an absolute API URL and gives a clear configuration message instead of passing a relative `/api/...` URL to an installed app/WebView. For installed builds, set `VITE_API_BASE_URL` to the public HTTPS URL of the Render server before building. On the Render website itself, the app uses the current origin automatically.
- Rebuild/redeploy the web app after changing Vite environment variables; they are embedded at build time.
