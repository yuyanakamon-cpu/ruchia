BEGIN;

-- profiles の RLS が有効かどうかに関わらずポリシーを設定
-- (RLS無効なら DROP IF EXISTS が安全に空振りする)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 認証ユーザーは全プロフィールを読める（表示名表示等に必要）
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 自分のプロフィールのみ更新可能
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

NOTIFY pgrst, 'reload schema';
COMMIT;
