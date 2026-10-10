# Secret Theme Editor Update

- Moved theme configuration and editing controls below the live storefront preview.
- Replaced the small mock canvas with a fuller storefront preview populated from published Supabase products, active categories, and active banners.
- Added clickable preview navigation, search, category selection, and cart/profile preview states.
- Single-click selects an item for editing; double-click tests its customer-facing preview action.
- Added per-preview-item text/background colors, corner radius, font size, remove/restore, and reset-style controls.
- Kept custom text/image elements, drag positioning, global theme settings, and Supabase theme saving.

Note: this preview uses real Supabase store content but remains an editor preview, not a full mounted copy of every customer route. Verify behavior in a local build and staging Supabase project before deploying.
