# Back button on every inner page
- Added the back button to **Cart, Orders, Wallet and Profile** (they were the only customer pages whose header had none). Home is the root page, so it has none by design.
- The **Product** page now keeps its header (with back) while it is loading, instead of showing a bare spinner.
- The back button no longer dead-ends: if there is no earlier page in the session (app opened straight on that page, PWA launch, pasted link) it goes Home instead of doing nothing.
- All of this is in `Top` / the page headers in `src/main.tsx`; it applies to every theme.
