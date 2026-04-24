-- ============================================================
-- Migration 017: notifications_sent テーブル（重複送信防止）
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notifications_sent (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id    UUID      NOT NULL,
  target_type  TEXT      NOT NULL CHECK (target_type IN ('event', 'task')),
  reminder_type TEXT     NOT NULL CHECK (reminder_type IN ('1day_before', '1hour_before', 'morning_1day', 'morning_today')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, target_id, target_type, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_user   ON notifications_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_target ON notifications_sent(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at     ON notifications_sent(sent_at);

ALTER TABLE notifications_sent ENABLE ROW LEVEL SECURITY;

-- ユーザは自分の履歴のみ閲覧可
DROP POLICY IF EXISTS "Users view own notification history" ON notifications_sent;
CREATE POLICY "Users view own notification history" ON notifications_sent
  FOR SELECT USING (user_id = auth.uid());

-- INSERT は service_role (admin client) からのみ。
-- RLS ポリシーを設定しないことで通常クライアントからの INSERT を拒否。

-- 古いリマインダー履歴を90日で自動削除（サイズ管理）
-- ※ pg_cron が有効な場合のみ有効。コメントアウトして手動で実行してもよい。
-- SELECT cron.schedule('cleanup-notifications-sent', '0 3 * * *',
--   $$DELETE FROM notifications_sent WHERE sent_at < NOW() - INTERVAL '90 days'$$);

NOTIFY pgrst, 'reload schema';
COMMIT;
