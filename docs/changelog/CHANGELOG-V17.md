# YN Studio v17 — Theme draft/publish workflow

- Theme edits are saved into `draft_config` and do not change the customer-facing published `config` until the admin presses **Publish theme**.
- New themes start unpublished; admins can **Save draft** or explicitly **Publish theme**.
- Theme list labels published themes versus draft/unpublished themes.
- Added `supabase-theme-drafts.sql`. Run it in Supabase SQL Editor before using this version.

## Important
This is the first stage of the larger admin/customer redesign. It does not yet complete admin password-based account creation, the admin-created order workflow, or a full drag/drop editor that edits every element on every customer route. Those require additional UI and secure server-side implementation; they are not represented as completed here.
