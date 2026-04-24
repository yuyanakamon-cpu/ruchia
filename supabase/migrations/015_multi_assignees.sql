-- ============================================================
-- Migration 015: 複数担当者対応（event_assignees, task_assignees 中間テーブル）
-- ============================================================

BEGIN;

-- event_assignees: 予定の担当者（複数人）
CREATE TABLE IF NOT EXISTS event_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'accepted', 'rejected')),
  approval_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assignees_event_id ON event_assignees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignees_user_id ON event_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_assignees_status ON event_assignees(approval_status);

-- task_assignees: タスクの担当者（複数人）
CREATE TABLE IF NOT EXISTS task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'accepted', 'rejected')),
  approval_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_status ON task_assignees(approval_status);

-- RLS
ALTER TABLE event_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

-- event_assignees SELECT: 自分が担当 OR イベント作成者 OR 同じグループメンバー
DROP POLICY IF EXISTS "View event assignees" ON event_assignees;
CREATE POLICY "View event assignees" ON event_assignees
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_assignees.event_id
        AND (
          e.created_by = auth.uid()
          OR (
            e.group_id IS NOT NULL
            AND e.group_id IN (
              SELECT group_id FROM group_members WHERE user_id = auth.uid()
            )
          )
        )
    )
  );

-- event_assignees INSERT: 予定の作成者 or 同じグループのメンバー
DROP POLICY IF EXISTS "Insert event assignees" ON event_assignees;
CREATE POLICY "Insert event assignees" ON event_assignees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_assignees.event_id
        AND (
          e.created_by = auth.uid()
          OR (
            e.group_id IS NOT NULL
            AND e.group_id IN (
              SELECT group_id FROM group_members WHERE user_id = auth.uid()
            )
          )
        )
    )
  );

-- event_assignees UPDATE: 自分のステータスのみ更新可能
DROP POLICY IF EXISTS "Update own event approval" ON event_assignees;
CREATE POLICY "Update own event approval" ON event_assignees
  FOR UPDATE USING (user_id = auth.uid());

-- event_assignees DELETE: 予定の作成者のみ
DROP POLICY IF EXISTS "Delete event assignees" ON event_assignees;
CREATE POLICY "Delete event assignees" ON event_assignees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_assignees.event_id
        AND e.created_by = auth.uid()
    )
  );

-- task_assignees SELECT
DROP POLICY IF EXISTS "View task assignees" ON task_assignees;
CREATE POLICY "View task assignees" ON task_assignees
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = auth.uid()
          OR (
            t.group_id IS NOT NULL
            AND t.group_id IN (
              SELECT group_id FROM group_members WHERE user_id = auth.uid()
            )
          )
        )
    )
  );

-- task_assignees INSERT
DROP POLICY IF EXISTS "Insert task assignees" ON task_assignees;
CREATE POLICY "Insert task assignees" ON task_assignees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = auth.uid()
          OR (
            t.group_id IS NOT NULL
            AND t.group_id IN (
              SELECT group_id FROM group_members WHERE user_id = auth.uid()
            )
          )
        )
    )
  );

-- task_assignees UPDATE: 自分のステータスのみ
DROP POLICY IF EXISTS "Update own task approval" ON task_assignees;
CREATE POLICY "Update own task approval" ON task_assignees
  FOR UPDATE USING (user_id = auth.uid());

-- task_assignees DELETE: タスクの作成者のみ
DROP POLICY IF EXISTS "Delete task assignees" ON task_assignees;
CREATE POLICY "Delete task assignees" ON task_assignees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND t.created_by = auth.uid()
    )
  );

-- 既存の assigned_to データを中間テーブルに移行
INSERT INTO event_assignees (event_id, user_id, approval_status, approval_updated_at)
SELECT id, assigned_to, COALESCE(NULLIF(approval_status, 'none'), 'pending'), approval_updated_at
FROM events
WHERE assigned_to IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

INSERT INTO task_assignees (task_id, user_id, approval_status, approval_updated_at)
SELECT id, assigned_to, COALESCE(NULLIF(approval_status, 'none'), 'pending'), approval_updated_at
FROM tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
