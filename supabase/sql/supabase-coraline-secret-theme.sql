-- YN Studio: add the CORALINE customer secret theme. Run AFTER supabase-secret-themes-and-store-location.sql. Safe to rerun.
insert into public.site_themes (name, secret_code, active, config)
select 'Coraline Secret Theme', 'CORALINE', true,
  '{"preset":"coraline","background":"#0a1230","surface":"#dccfa9","text":"#2a2116","muted":"#5a4a32","border":"#c7b68a","accent":"#f1b72e","accent2":"#ffe08a","font":"''Gaegu'', ''Patrick Hand'', ''Noto Sans Khmer'', ''Kantumruy Pro'', ''Chalkboard SE'', ''Marker Felt'', ''Comic Sans MS'', system-ui, sans-serif","headingFont":"''Schoolbell'', ''Gaegu'', ''Patrick Hand'', ''Noto Sans Khmer'', ''Kantumruy Pro'', ''Chalkboard SE'', ''Marker Felt'', ''Comic Sans MS'', system-ui, sans-serif","fontUrl":"https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Patrick+Hand&family=Schoolbell&display=swap","bannerImage":"/coraline/banner.svg","productImage":{"mode":"original","fit":"cover","padding":0},"backgroundImage":"","elements":[],"hiddenPreviewElements":[],"previewStyles":{}}'::jsonb
where not exists (select 1 from public.site_themes where lower(secret_code) = lower('CORALINE'));

update public.site_themes
set config = jsonb_set(coalesce(config, '{}'::jsonb), '{preset}', '"coraline"'::jsonb, true), updated_at = now()
where lower(secret_code) = lower('CORALINE') and coalesce(config->>'preset', '') <> 'coraline';
