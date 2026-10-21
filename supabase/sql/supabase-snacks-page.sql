-- Snacks page (Chiikawa theme) – run once in the Supabase SQL editor.
-- Products with store_page = 'snacks' are shown ONLY on the Snacks page of the Chiikawa theme
-- (never on Home). Normal products keep store_page = null and are not affected.
alter table public.products add column if not exists store_page text;
create index if not exists products_store_page_idx on public.products (store_page) where store_page is not null;

-- Videos added in the Theme Studio are stored in the existing public "theme-assets" bucket
-- (created by supabase-theme-studio-v3.sql). Supabase's normal upload limit is 50 MB per file:
-- short looping MP4 / WebM clips work best. Nothing else to change.
