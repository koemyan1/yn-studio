-- YN Studio: CHIIKAWA secret theme — complete setup (safe to re-run).
-- Run in Supabase → SQL Editor, AFTER supabase-secret-themes-and-store-location.sql.
--
-- 1. adds categories.theme_only_id  → "this category exists only inside one secret theme"
-- 2. creates / refreshes the CHIIKAWA theme (secret code CHIIKAWA) with the full storybook look
--    and the ready-made "Delivery 9-10 days" banner
-- 3. creates the extra Food and Drink categories, visible ONLY in the CHIIKAWA theme
--
-- Everything you already sell stays visible in the theme. Only Food + Drink are extra.

-- 1) theme-only categories -----------------------------------------------------------------
alter table public.categories
  add column if not exists theme_only_id uuid references public.site_themes(id) on delete set null;
create index if not exists categories_theme_only_idx on public.categories(theme_only_id);

-- 2) the theme ------------------------------------------------------------------------------
insert into public.site_themes (name, secret_code, active, config)
select 'Chiikawa Secret Theme', 'CHIIKAWA', true, '{}'::jsonb
where not exists (select 1 from public.site_themes where lower(secret_code) = 'chiikawa');

-- Look & feel. The admin-uploaded banner (config.bannerImage) is kept if you already set one.
update public.site_themes t
set name = coalesce(nullif(t.name, ''), 'Chiikawa Secret Theme'),
    active = true,
    config = coalesce(t.config, '{}'::jsonb) || jsonb_build_object(
      'version', 3,
      'preset', 'chiikawa',
      'background', '#fffaf0',
      'surface', '#fffdf7',
      'text', '#3d3656',
      'muted', '#7a7298',
      'border', '#cfe0f2',
      'accent', '#ff9fbe',
      'accent2', '#ffb8cf',
      'font', '''Gaegu'', ''Patrick Hand'', ''Nunito'', ''Comic Sans MS'', system-ui, sans-serif',
      'headingFont', '''Gaegu'', ''Patrick Hand'', ''Comic Sans MS'', system-ui, sans-serif',
      'fontUrl', 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Patrick+Hand&display=swap',
      'bannerImage', case when coalesce(t.config->>'bannerImage', '') = '' then '/chiikawa/banner-delivery.png' else t.config->>'bannerImage' end
    ),
    updated_at = now()
where lower(t.secret_code) = 'chiikawa';

-- IMPORTANT: leave allowedCategories empty so ALL your normal categories/products show in this theme.
-- (Older versions of this theme stored a restrictive list; clear it.)
update public.site_themes
set config = jsonb_set(config, '{allowedCategories}', '[]'::jsonb, true)
where lower(secret_code) = 'chiikawa' and jsonb_array_length(coalesce(config->'allowedCategories', '[]'::jsonb)) > 0;
delete from public.category_theme_visibility
where theme_id in (select id from public.site_themes where lower(secret_code) = 'chiikawa');

-- 3) Food + Drink, only inside the CHIIKAWA theme --------------------------------------------
insert into public.categories (name, status, delivery_tracking_enabled, theme_only_id)
select v.name, 'active', false, t.id
from (values ('Food'), ('Drink')) as v(name)
cross join (select id from public.site_themes where lower(secret_code) = 'chiikawa' limit 1) t
where not exists (
  select 1 from public.categories c where c.theme_only_id = t.id and lower(c.name) = lower(v.name)
);

-- Customers read categories through the existing public SELECT policy; theme_only_id is just a column on that row.
