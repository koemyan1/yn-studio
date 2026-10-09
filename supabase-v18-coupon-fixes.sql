-- YN Studio v18: make coupon deletion safe and fix legacy updated_at trigger failures.
-- Existing redemptions are retained as historical records with a null coupon reference.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.coupon_redemptions'::regclass
      AND confrelid='public.coupons'::regclass AND contype='f'
  LOOP
    EXECUTE format('ALTER TABLE public.coupon_redemptions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.coupon_redemptions ALTER COLUMN coupon_id DROP NOT NULL;
ALTER TABLE public.coupon_redemptions
  ADD CONSTRAINT coupon_redemptions_coupon_id_fkey
  FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;
-- A legacy generic updated_at trigger expects this field on coupons.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Ensure coupon changes have a valid timestamp even when the table has old triggers.
CREATE OR REPLACE FUNCTION public.yn_set_coupon_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS yn_set_coupon_updated_at ON public.coupons;
CREATE TRIGGER yn_set_coupon_updated_at BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.yn_set_coupon_updated_at();
