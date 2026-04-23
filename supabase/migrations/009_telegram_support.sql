BEGIN;

-- profiles に telegram_chat_id カラム追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- 通知設定カラム
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_events_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_tasks_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_minutes_before integer NOT NULL DEFAULT 15;

NOTIFY pgrst, 'reload schema';
COMMIT;
