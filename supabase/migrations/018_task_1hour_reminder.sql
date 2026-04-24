-- ============================================================
-- Migration 018: notifications_sent に '1hour_before_task' を追加
-- ============================================================

BEGIN;

ALTER TABLE notifications_sent
  DROP CONSTRAINT IF EXISTS notifications_sent_reminder_type_check;

ALTER TABLE notifications_sent
  ADD CONSTRAINT notifications_sent_reminder_type_check
  CHECK (reminder_type IN (
    '1day_before',
    '1hour_before',
    'morning_1day',
    'morning_today',
    '1hour_before_task'
  ));

NOTIFY pgrst, 'reload schema';
COMMIT;
