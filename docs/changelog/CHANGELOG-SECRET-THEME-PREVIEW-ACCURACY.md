# Secret Theme Preview Accuracy Update

- Reworked the admin storefront preview to follow the customer home page's structure more closely: marketplace heading, notification/profile actions, separate search row, real home hero/logo treatment, customer-ratio banner, category rail, product cards, and bottom navigation.
- Updated the preview bottom navigation to match the customer navigation items: Home, Wishlist, Cart, Orders, Wallet, and Profile.
- Preview now loads all published products and calculates the displayed price from the first product option/value the same way the customer storefront does.
- Product preview images now prefer the actual customer-facing `main_image_url` field.
- New themes start with the existing customer site's default light palette and typography rather than an unrelated dark palette. Existing saved theme settings remain unchanged.
- Kept editor behavior: single-click selects an item; double-click tests its preview action. The preview's cart, wishlist, orders, and wallet screens remain simulations and do not modify a customer's account or perform checkout.
- Build verification was attempted, but dependency installation timed out in this environment, so a complete Vite/TypeScript build could not be confirmed here.
