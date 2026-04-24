-- ============================================================
-- Migration 013: events / tasks RLS をグループアクセス対応に更新
--
-- 変更内容:
-- 1. events SELECT: 自分の作成 OR 担当 OR グループメンバー
-- 2. events INSERT: グループメンバーのみグループイベントを作れる
-- 3. events UPDATE: 作成者 OR 担当者（承認ステータス更新用）
-- 4. tasks  SELECT: 自分の作成 OR 担当 OR グループメンバー
-- 5. tasks  INSERT: グループメンバーのみグループタスクを作れる
-- ============================================================

BEGIN;

-- ── events ──────────────────────────────────────────────────

-- SELECT: 自分の予定 OR 担当された予定 OR 所属グループの予定
DROP POLICY IF EXISTS "events_select_authenticated" ON public.events;
CREATE POLICY "events_select_authenticated"
  ON public.events FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: 自分がメンバーのグループ OR 個人予定のみ作成可
DROP POLICY IF EXISTS "events_insert_authenticated" ON public.events;
CREATE POLICY "events_insert_authenticated"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      group_id IS NULL
      OR group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE: 作成者 OR 担当者（担当者は approval_status のみ更新する想定）
DROP POLICY IF EXISTS "events_update_owner" ON public.events;
DROP POLICY IF EXISTS "events_update_owner_or_assignee" ON public.events;
CREATE POLICY "events_update_owner_or_assignee"
  ON public.events FOR UPDATE TO authenticated
  USING     (created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

-- ── tasks ────────────────────────────────────────────────────

-- SELECT: 自分のタスク OR 担当 OR 所属グループのタスク
DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.tasks;
CREATE POLICY "tasks_select_authenticated"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR assigned_to = auth.uid()
    OR group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: 自分がメンバーのグループ OR 個人タスクのみ
DROP POLICY IF EXISTS "tasks_insert_authenticated" ON public.tasks;
CREATE POLICY "tasks_insert_authenticated"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      group_id IS NULL
      OR group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE: 作成者 OR 担当者 (assigned_to も許可して承認更新に使う)
DROP POLICY IF EXISTS "tasks_update_owner_or_assignee" ON public.tasks;
CREATE POLICY "tasks_update_owner_or_assignee"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR assigned_to = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
