-- ============================================================
-- Migration 005: events / event_attendees RLS ポリシー再設定
-- リネーム時にポリシーが消えたため再作成
-- ============================================================

BEGIN;

-- ============================================================
-- events テーブル
-- ============================================================

-- 1. 認証ユーザーは全予定を読める
DROP POLICY IF EXISTS "events_select_authenticated" ON public.events;
CREATE POLICY "events_select_authenticated"
  ON public.events
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. 認証ユーザーは自分のIDで予定を作れる
DROP POLICY IF EXISTS "events_insert_authenticated" ON public.events;
CREATE POLICY "events_insert_authenticated"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 3. 作成者のみ更新可能
DROP POLICY IF EXISTS "events_update_owner" ON public.events;
CREATE POLICY "events_update_owner"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING     (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 4. 作成者のみ削除可能
DROP POLICY IF EXISTS "events_delete_owner" ON public.events;
CREATE POLICY "events_delete_owner"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());


-- ============================================================
-- event_attendees テーブル
-- ============================================================

-- 1. 認証ユーザーは全参加者レコードを読める
DROP POLICY IF EXISTS "event_attendees_select_authenticated" ON public.event_attendees;
CREATE POLICY "event_attendees_select_authenticated"
  ON public.event_attendees
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. 自分を参加者にする or 自分が作った予定に他者を追加できる
DROP POLICY IF EXISTS "event_attendees_insert_event_owner_or_self" ON public.event_attendees;
CREATE POLICY "event_attendees_insert_event_owner_or_self"
  ON public.event_attendees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
        AND events.created_by = auth.uid()
    )
  );

-- 3. 自分の参加状況（参加/不参加）は本人のみ更新可能
DROP POLICY IF EXISTS "event_attendees_update_self" ON public.event_attendees;
CREATE POLICY "event_attendees_update_self"
  ON public.event_attendees
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. 本人 or 予定作成者が参加者レコードを削除可能
DROP POLICY IF EXISTS "event_attendees_delete_event_owner_or_self" ON public.event_attendees;
CREATE POLICY "event_attendees_delete_event_owner_or_self"
  ON public.event_attendees
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
        AND events.created_by = auth.uid()
    )
  );


-- ============================================================
-- スキーマキャッシュをリロード
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
