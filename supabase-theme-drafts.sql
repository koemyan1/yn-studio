-- Run in Supabase SQL Editor before using the draft/publish theme workflow.
-- Existing config remains the published customer-facing version; draft_config stores editor changes.
alter table public.themes add column if not exists draft_config jsonb;
