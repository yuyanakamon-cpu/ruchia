BEGIN;

-- 全員が全タスクを読める
DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.tasks;
CREATE POLICY "tasks_select_authenticated"
  ON public.tasks FOR SELECT TO authenticated
  USING (true);

-- INSERT: 認証ユーザーなら誰でも作れる（created_by が自分）
DROP POLICY IF EXISTS "tasks_insert_authenticated" ON public.tasks;
CREATE POLICY "tasks_insert_authenticated"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: 作成者 または 担当者 なら編集可
DROP POLICY IF EXISTS "tasks_update_owner_or_assignee" ON public.tasks;
CREATE POLICY "tasks_update_owner_or_assignee"
  ON public.tasks FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR assignee_id = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assignee_id = auth.uid());

-- DELETE: 作成者のみ削除可
DROP POLICY IF EXISTS "tasks_delete_owner" ON public.tasks;
CREATE POLICY "tasks_delete_owner"
  ON public.tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
COMMIT;
