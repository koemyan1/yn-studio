# Secret Theme Activation Route Fix

- Secret-code activation no longer forces a full browser reload.
- On successful activation, the app navigates to the customer home route using React Router, like the Admin → Customer side switch.
- Returning to normal mode uses the same in-app navigation.
- The theme runtime listens for `yn-secret-theme-change` so it refreshes theme state without a hard reload.
- Added `public/_redirects` for static hosts that support Netlify-style SPA fallback rules.

If deployed as a static site on a host that does not support `_redirects`, configure its SPA rewrite so all non-asset routes serve `/index.html`. The included Express/Render server already has a frontend fallback.
