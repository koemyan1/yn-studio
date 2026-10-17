# Services page (replaces Wishlist in the bottom bar)
1. Run supabase-services.sql once in Supabase -> SQL Editor (tables service_requests + product_suggestions, bucket service-uploads, admin notifications).
2. Bottom bar: Wishlist is now Services (/services). Wishlist is still in Profile and at /wishlist.
3. /services: Printing, Copy, Social media post design, Poster design, Logo design. "Request this" opens a form (details, phone/Telegram, optional file).
4. "Cannot find a product?": customer adds a picture (+ optional name/note). Customers see their own requests and status on the same page.
5. Admin > Inbox > Requests (/admin/requests): two tabs (Service requests, Product ideas), change status, open attachments, delete. Admin also gets a bell/toast notification.
6. Admin > Settings > "Pages in the bottom bar" now lists Services instead of Wishlist. Theme text key navWishlist is now navServices.
Edited: src/main.tsx, src/secretTheme.tsx. New: src/Services.tsx, src/services.css, supabase-services.sql.
Not checked: npm run build / on-device test (syntax checked only).
