# YN Studio — Order Barcode & Custom Status Setup

## 1. Run the database migration
Open Supabase SQL Editor and run:

`supabase-order-statuses-barcode.sql`

This creates `public.order_statuses`, default statuses, and the admin/customer RLS policies.

## 2. Install/build normally
From the project folder:

```bash
npm install
npm run build
```

## 3. How the new features work

### Admin order barcode search
- Go to **Admin → Orders**.
- Click **Scan barcode**.
- Allow camera access.
- Point the camera at the barcode shown on a customer's order.
- The app uses the browser's native `BarcodeDetector` when available for fast scanning.
- If the browser does not support native barcode detection, the order number can be entered manually.

### Customer barcode
- Customer opens **Orders**.
- Every order now displays a Code 128 barcode generated from the order number (for example `YN-12345678`).
- Admin can scan that barcode to find the exact order.

### Custom order statuses
- Go to **Admin → Order Statuses**.
- Create statuses such as `Ready for pickup`, `Waiting for delivery`, `Out for delivery`, etc.
- Choose a color and whether the status counts as paid.
- Active statuses are immediately available in Admin → Orders and are also displayed on the customer Orders page.
- Existing order notifications continue to notify the customer when an order status changes.

### Customer loading experience
- The customer home page no longer shows `No products yet` while products are still loading.
- It now shows a branded animated YN Studio marketplace loading state.
- The global app loader was also upgraded with a branded animated screen.
