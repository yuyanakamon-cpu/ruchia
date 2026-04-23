BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signal_notifications_enabled
  boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

COMMIT;
