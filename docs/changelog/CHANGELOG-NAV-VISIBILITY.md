# Admin can enable / disable bottom-nav pages (every theme, including the default)
1. Run supabase-nav-visibility.sql once (adds delivery_settings.nav_hidden).
2. Admin > Settings > "Pages in the bottom bar": tick/untick Home, Wishlist, Cart, Orders, Wallet, Debt, Snacks, Profile, then "Save bottom navigation".
3. The choice is store-wide, so it covers the default theme and every secret theme, and customers see it within a minute (or on reload).
4. At least one page must stay on. Hidden pages can still be opened by link.
5. Debt still only shows for customers with a balance, and Snacks only exists in the Chiikawa theme; switching them off hides them there too.
Edited: src/main.tsx (NAV_PAGES, useNavHidden, Nav, AdminSettings), src/admin.css. Not checked: npm run build / on-device test.
