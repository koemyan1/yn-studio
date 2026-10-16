-- YN Studio: add the SPIDEY customer secret theme. Run AFTER supabase-secret-themes-and-store-location.sql. Safe to rerun.
insert into public.site_themes (name, secret_code, active, config)
select 'Spidey Secret Theme', 'SPIDEY', true,
  '{"preset":"spidey","background":"#060b1d","surface":"#101a3a","text":"#eef2ff","accent":"#d6182b","radius":8,"backgroundImage":"","bannerImage":"","elements":[],"hiddenPreviewElements":[],"previewStyles":{}}'::jsonb
where not exists (select 1 from public.site_themes where lower(secret_code) = lower('SPIDEY'));

update public.site_themes
set config = jsonb_set(coalesce(config, '{}'::jsonb), '{preset}', '"spidey"'::jsonb, true), updated_at = now()
where lower(secret_code) = lower('SPIDEY') and coalesce(config->>'preset', '') <> 'spidey';
