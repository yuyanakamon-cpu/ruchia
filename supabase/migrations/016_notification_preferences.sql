-- ============================================================
-- Migration 016: notification_preferences JSONB カラム追加
-- ============================================================

BEGIN;

-- notification_preferences: 通知種別ごとのON/OFF
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "task_assigned": true,
    "event_assigned": true,
    "group_update": true,
    "approval_response": true,
    "event_reminder": true,
    "task_reminder": true
  }'::jsonb;

-- 既存の notify_events_enabled / notify_tasks_enabled をJSONBに反映
UPDATE public.profiles SET notification_preferences = jsonb_build_object(
  'task_assigned',     COALESCE((notification_preferences->>'task_assigned')::boolean, true),
  'event_assigned',    COALESCE((notification_preferences->>'event_assigned')::boolean, true),
  'group_update',      COALESCE((notification_preferences->>'group_update')::boolean, true),
  'approval_response', COALESCE((notification_preferences->>'approval_response')::boolean, true),
  'event_reminder',    notify_events_enabled,
  'task_reminder',     notify_tasks_enabled
);

-- profiles UPDATE RLS (自分のみ更新可)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

NOTIFY pgrst, 'reload schema';
COMMIT;
