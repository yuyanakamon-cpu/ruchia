BEGIN;

-- start_time → start_at にリネーム
ALTER TABLE public.events RENAME COLUMN start_time TO start_at;

-- end_time → end_at にリネーム
ALTER TABLE public.events RENAME COLUMN end_time TO end_at;

-- location カラム追加（text, nullable）
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location text;

-- updated_at もコードが参照してたら追加
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 確認クエリ（COMMIT後に別途実行）
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='events'
-- ORDER BY ordinal_position;
