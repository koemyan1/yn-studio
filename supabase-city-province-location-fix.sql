-- YN Studio: fix customer city/province delivery profile fields.
-- Run this in Supabase SQL Editor against the same project used by the app.
-- The quoted "updated at" column is a compatibility workaround for a legacy
-- trigger that appears to reference NEW."updated at" instead of NEW.updated_at.
-- It can be removed later after that legacy trigger function is corrected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_is_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated at" timestamptz NOT NULL DEFAULT now();

-- Keep both timestamp fields aligned when profiles are updated.
CREATE OR REPLACE FUNCTION public.yn_sync_profile_updated_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW."updated at" := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS yn_sync_profile_updated_timestamps ON public.profiles;
CREATE TRIGGER yn_sync_profile_updated_timestamps
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.yn_sync_profile_updated_timestamps();

-- Existing profile rows remain unchanged; no customer data is deleted.
