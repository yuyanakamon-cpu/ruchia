-- ============================================================
-- Migration 011: groups / group_members テーブル追加
--                events / tasks に group_id・approval 列追加
-- ============================================================

BEGIN;

-- ── groups テーブル ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_groups_created_by  ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);

-- ── group_members テーブル ───────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id  ON group_members(user_id);

-- ── events / tasks にカラム追加 ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    ALTER TABLE events ADD COLUMN IF NOT EXISTS group_id         UUID  REFERENCES groups(id) ON DELETE SET NULL;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS assigned_to      UUID  REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_status  TEXT  DEFAULT 'none'
      CHECK (approval_status IN ('none', 'pending', 'accepted', 'rejected'));
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_updated_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_events_group_id        ON events(group_id);
    CREATE INDEX IF NOT EXISTS idx_events_assigned_to     ON events(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_events_approval_status ON events(approval_status);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id         UUID  REFERENCES groups(id) ON DELETE SET NULL;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to      UUID  REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_status  TEXT  DEFAULT 'none'
      CHECK (approval_status IN ('none', 'pending', 'accepted', 'rejected'));
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_updated_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_tasks_group_id        ON tasks(group_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to     ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_approval_status ON tasks(approval_status);
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- groups: 自分が所属するグループのみ参照
DROP POLICY IF EXISTS "Members can view their groups" ON groups;
CREATE POLICY "Members can view their groups" ON groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- groups: 認証ユーザーは自分を created_by にして作成可
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
CREATE POLICY "Authenticated users can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- groups: admin ロールのメンバーのみ更新可
DROP POLICY IF EXISTS "Admins can update groups" ON groups;
CREATE POLICY "Admins can update groups" ON groups
  FOR UPDATE USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- groups: 作成者のみ削除可
DROP POLICY IF EXISTS "Creators can delete groups" ON groups;
CREATE POLICY "Creators can delete groups" ON groups
  FOR DELETE USING (created_by = auth.uid());

-- group_members: 同じグループのメンバーを閲覧可
DROP POLICY IF EXISTS "Members can view group members" ON group_members;
CREATE POLICY "Members can view group members" ON group_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- group_members: 自分を追加 or admin が他者を追加
DROP POLICY IF EXISTS "Join group via invite or admin add" ON group_members;
CREATE POLICY "Join group via invite or admin add" ON group_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'admin'
    )
  );

-- group_members: 自分が脱退 or admin が除名
DROP POLICY IF EXISTS "Leave group or admin remove" ON group_members;
CREATE POLICY "Leave group or admin remove" ON group_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
