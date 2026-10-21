-- YN Studio: per-choice product images
-- Run once in Supabase SQL Editor.
-- Each product choice (e.g. Black, White, Purple) can point to its own image.

alter table public.product_option_values
  add column if not exists image_url text;

create index if not exists product_option_values_image_idx
  on public.product_option_values(option_id)
  where image_url is not null;

-- The existing product-images storage bucket/policies from
-- yn-studio-feature-fix.sql are reused for these option images.
