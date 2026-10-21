-- YN Studio: seed/update the CHIIKAWA customer secret theme.
-- Run AFTER supabase-secret-themes-and-store-location.sql.
-- Safe to rerun. Existing custom config values are preserved except the preset identity.
insert into public.site_themes (name, secret_code, active, config)
select
  'Chiikawa Secret Theme',
  'CHIIKAWA',
  true,
  '{"preset":"chiikawa","background":"#fff8fb","surface":"#fffefd","text":"#49384f","accent":"#f3a9c2","radius":24,"font":"Trebuchet MS, system-ui, sans-serif","backgroundImage":"","bannerImage":"","elements":[],"hiddenPreviewElements":[],"previewStyles":{}}'::jsonb
where not exists (
  select 1 from public.site_themes where lower(secret_code) = lower('CHIIKAWA')
);

-- Ensure an existing CHIIKAWA row uses the correct visual preset without wiping
-- its saved banner, custom elements, colors, or preview adjustments.
update public.site_themes
set config = jsonb_set(coalesce(config, '{}'::jsonb), '{preset}', '"chiikawa"'::jsonb, true),
    updated_at = now()
where lower(secret_code) = lower('CHIIKAWA')
  and coalesce(config->>'preset', '') <> 'chiikawa';

-- Confirm category visibility table exists and has a unique key suitable for upsert.
create table if not exists public.category_theme_visibility (
  category_id uuid not null references public.categories(id) on delete cascade,
  theme_id uuid not null references public.site_themes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (category_id, theme_id)
);
alter table public.category_theme_visibility enable row level security;

drop policy if exists "Read category theme visibility" on public.category_theme_visibility;
create policy "Read category theme visibility" on public.category_theme_visibility
  for select to anon, authenticated using (true);
drop policy if exists "Admins manage category theme visibility" on public.category_theme_visibility;
create policy "Admins manage category theme visibility" on public.category_theme_visibility
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
