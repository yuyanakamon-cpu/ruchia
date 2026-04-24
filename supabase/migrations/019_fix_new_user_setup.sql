-- ============================================================
-- Migration 019: 新規ユーザー登録時の profiles 自動作成 + RLS 補完
-- ============================================================

BEGIN;

-- ===========================================
-- 1. handle_new_user トリガー関数
--    新規ユーザー登録時に profiles レコードを自動作成
-- ===========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================
-- 2. profiles に INSERT ポリシー（フォールバック）
--    トリガーが何らかの理由で動かない場合でも
--    クライアントから自分の profiles を作成できる
-- ===========================================
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ===========================================
-- 3. 既存登録済みユーザーのバックフィル
--    profiles レコードがないユーザーに空レコードを作成
-- ===========================================
INSERT INTO public.profiles (id, display_name)
SELECT
  u.id,
  split_part(u.email, '@', 1)
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 4. group_members に UPDATE ポリシー
--    admin が同グループのメンバーの role を変更できる
-- ===========================================
DROP POLICY IF EXISTS "Admins can update member roles" ON group_members;
CREATE POLICY "Admins can update member roles" ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id  = auth.uid()
        AND gm.role     = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
