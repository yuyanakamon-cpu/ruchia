-- ============================================================
-- Migration 012: グループ作成者を自動的にadminとしてgroup_membersに追加
--
-- 問題: groupsのSELECT RLSが「group_membersに自分がいる」を条件にするため、
--       INSERT直後のRETURNING *でまだgroup_membersが空のため500エラーが発生。
-- 解決: AFTER INSERTトリガーでRETURNING評価前にgroup_membersを挿入する。
-- ============================================================

BEGIN;

-- ── トリガー関数 (SECURITY DEFINER: RLSをバイパスして確実に挿入) ──
CREATE OR REPLACE FUNCTION add_group_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── トリガー登録 ──
DROP TRIGGER IF EXISTS trg_add_group_creator ON groups;
CREATE TRIGGER trg_add_group_creator
  AFTER INSERT ON groups
  FOR EACH ROW
  EXECUTE FUNCTION add_group_creator_as_admin();

-- ── groupsのSELECTポリシーも修正: 作成者は即座に参照可能 ──
-- (トリガーだけでほぼ解決だが、念のためcreated_byも条件に追加)
DROP POLICY IF EXISTS "Members can view their groups" ON groups;
CREATE POLICY "Members can view their groups" ON groups
  FOR SELECT USING (
    created_by = auth.uid()
    OR id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
