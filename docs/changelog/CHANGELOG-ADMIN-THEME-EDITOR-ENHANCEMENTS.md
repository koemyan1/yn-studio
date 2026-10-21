# Admin Theme Editor Enhancements

- Added page-specific design settings to the Secret Code / theme editor, keyed independently for Home, Products, Cart, Wishlist, Orders, Wallet, and Profile preview views.
- Added per-page background color, surface color, accent color, product-image-area background, and optional page background image controls.
- Added customer runtime CSS variables for the active route's page-specific background and product image area.
- Added an optional product-photo upload processing toggle that removes near-white pixels to transparency and uploads the processed image as PNG. This is a simple threshold-based cleanup and works best with plain white backgrounds; it is not AI object segmentation.
- Enhanced the default PWA install prompt with YN Studio icon branding and iOS Add to Home Screen guidance. Supported browsers can show their native installation prompt; iOS users must confirm through Safari's Share menu.
- Added responsive styling for the new editor controls and install prompt.

## Verification
- Source edits were applied to `src/main.tsx` and `src/style.css`.
- `npm install --ignore-scripts --no-audit --no-fund` timed out in the build environment, so a full TypeScript/Vite build could not be verified here.
- Test locally with `npm install` and `npm run build` before deploying to Render.
