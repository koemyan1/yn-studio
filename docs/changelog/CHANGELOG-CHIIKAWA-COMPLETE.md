# CHIIKAWA Secret Theme — follow-up polish

- Expanded the Chiikawa preset styling across customer marketplace cards, banners, product details, cart/checkout, order/transaction cards, and profile panels.
- Kept all theme selectors scoped to `html[data-secret-theme="on"][data-secret-preset="chiikawa"]`; admin screens and normal mode are not intentionally restyled by these rules.
- Made the SQL seed safe to rerun and update the existing `CHIIKAWA` theme's preset identity without overwriting its saved banner, colors, custom elements, or preview settings.
- Reasserted category visibility RLS policies and documented how empty category mappings behave.

## Validation status

- SQL and CSS changes were reviewed for consistency with the existing app structure.
- A production build could not be run in this environment because project dependencies are not installed and package installation timed out. Run `npm install` then `npm run build` before deploying.
- The package does not contain official character artwork. Upload assets you have permission to use in the theme editor; do not assume official Chiikawa/Usagi/Hachiware assets are included.
- Live Supabase changes are not applied by this ZIP. Run the SQL file in your own Supabase SQL Editor.
