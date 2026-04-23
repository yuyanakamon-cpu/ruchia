-- ============================================================
-- Migration 003: profiles 整合 + schedules→events リネーム
-- ============================================================
-- 前提:
--   profiles の実カラム: id, username, full_name, signal_number, updated_at
--   schedules の列は events と完全一致
--   schedule_participants と event_attendees の差異は schedule_id のみ
--   既存制約: schedules_pkey / schedules_created_by_fkey
--             schedule_participants_pkey
--             schedule_participants_schedule_id_fkey
--             schedule_participants_user_id_fkey
-- ============================================================

BEGIN;

-- ============================================================
-- Part 1: profiles に不足カラムを追加
-- ============================================================
-- 既存カラム（username, full_name 等）は一切触らず、足りない分だけ追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS role         text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();

-- role のチェック制約（同名が既存なら DROP してから ADD）
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'member'));


-- ============================================================
-- Part 2: 既存行の display_name を既存データで初期化
-- ============================================================
-- full_name が入っていれば display_name にコピー
UPDATE public.profiles
  SET display_name = full_name
  WHERE display_name IS NULL AND full_name IS NOT NULL;

-- full_name が空なら username をコピー
UPDATE public.profiles
  SET display_name = username
  WHERE display_name IS NULL AND username IS NOT NULL;


-- ============================================================
-- Part 3: schedule_id を参照している FK を事前に削除
-- ============================================================
-- schedule_id カラムをリネームする前に FK 制約を外す
ALTER TABLE public.schedule_participants
  DROP CONSTRAINT IF EXISTS schedule_participants_schedule_id_fkey;


-- ============================================================
-- Part 4: テーブルリネーム
-- ============================================================
-- PostgreSQL は RENAME でも OID が変わらないため
-- RLS ポリシー・トリガーは自動的に新テーブル名で有効のまま
ALTER TABLE public.schedules           RENAME TO events;
ALTER TABLE public.schedule_participants RENAME TO event_attendees;


-- ============================================================
-- Part 5: カラムリネーム（event_attendees.schedule_id → event_id）
-- ============================================================
ALTER TABLE public.event_attendees
  RENAME COLUMN schedule_id TO event_id;


-- ============================================================
-- Part 6: event_id FK を ON DELETE CASCADE 付きで再作成
-- ============================================================
-- 予定削除時に参加者レコードも連鎖削除される
ALTER TABLE public.event_attendees
  ADD CONSTRAINT event_attendees_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id)
  ON DELETE CASCADE;


-- ============================================================
-- Part 7: events に all_day カラム追加
-- ============================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;


-- ============================================================
-- Part 8: event_attendees に UNIQUE 制約を追加（なければ）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'event_attendees'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.event_attendees
      ADD CONSTRAINT event_attendees_event_id_user_id_key
      UNIQUE (event_id, user_id);
  END IF;
END $$;


-- ============================================================
-- Part 9: 制約名・インデックス名をリネーム（整合性のため）
-- ============================================================
-- PRIMARY KEY 制約のリネームで裏の index も同時にリネームされる
ALTER TABLE public.events
  RENAME CONSTRAINT schedules_pkey TO events_pkey;

ALTER TABLE public.event_attendees
  RENAME CONSTRAINT schedule_participants_pkey TO event_attendees_pkey;

ALTER TABLE public.events
  RENAME CONSTRAINT schedules_created_by_fkey TO events_created_by_fkey;

ALTER TABLE public.event_attendees
  RENAME CONSTRAINT schedule_participants_user_id_fkey
    TO event_attendees_user_id_fkey;


-- ============================================================
-- Part 10: signal_notifications テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.signal_notifications (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_phone text        NOT NULL,
  message         text        NOT NULL,
  trigger_type    text        NOT NULL,
  trigger_id      uuid,
  sent_at         timestamptz,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.signal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read notification logs"
  ON public.signal_notifications;
CREATE POLICY "Admins can read notification logs"
  ON public.signal_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ============================================================
-- Part 11: yuya.nakamon のプロフィール UPSERT
-- ============================================================
-- 既存行があれば display_name は空の場合のみ更新、role は必ず admin に
-- 既存行がなければ INSERT
INSERT INTO public.profiles (id, display_name, role)
VALUES (
  '0c24fccd-76a8-4393-96a6-cdb53a47b488',
  'Yuya',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = COALESCE(profiles.display_name, EXCLUDED.display_name),
  role         = EXCLUDED.role;


-- ============================================================
-- Part 12: 結果確認クエリ（COMMIT 後に別途実行してください）
-- ============================================================
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
-- ORDER BY ordinal_position;
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'event_attendees'
-- ORDER BY ordinal_position;
--
-- SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- WHERE tc.table_schema = 'public'
--   AND tc.table_name IN ('events', 'event_attendees', 'profiles')
-- ORDER BY tc.table_name, tc.constraint_type;
--
-- SELECT * FROM public.profiles
-- WHERE id = '0c24fccd-76a8-4393-96a6-cdb53a47b488';

COMMIT;
