-- ルシア スキーマ定義

-- プロフィール（auth.usersと1:1）
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  signal_phone text,
  signal_notifications_enabled boolean default false,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "自分のプロフィールは読める" on public.profiles
  for select using (auth.uid() = id);

create policy "全員のプロフィールをメンバーは読める" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "自分のプロフィールは更新できる" on public.profiles
  for update using (auth.uid() = id);

-- 予定
create table public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;

create policy "認証済みは予定を読める" on public.events
  for select using (auth.role() = 'authenticated');

create policy "認証済みは予定を作れる" on public.events
  for insert with check (auth.role() = 'authenticated');

create policy "作成者は予定を更新・削除できる" on public.events
  for all using (auth.uid() = created_by);

-- 予定の参加者
create table public.event_attendees (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  unique(event_id, user_id)
);

alter table public.event_attendees enable row level security;

create policy "認証済みは参加者リストを読める" on public.event_attendees
  for select using (auth.role() = 'authenticated');

create policy "認証済みは参加者を追加できる" on public.event_attendees
  for insert with check (auth.role() = 'authenticated');

create policy "自分の参加状況は更新できる" on public.event_attendees
  for update using (auth.uid() = user_id);

create policy "作成者は参加者を削除できる" on public.event_attendees
  for delete using (
    auth.uid() = user_id or
    auth.uid() = (select created_by from public.events where id = event_id)
  );

-- タスク
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  due_date timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "認証済みはタスクを読める" on public.tasks
  for select using (auth.role() = 'authenticated');

create policy "認証済みはタスクを作れる" on public.tasks
  for insert with check (auth.role() = 'authenticated');

create policy "担当者・作成者はタスクを更新できる" on public.tasks
  for update using (auth.uid() = assignee_id or auth.uid() = created_by);

create policy "作成者はタスクを削除できる" on public.tasks
  for delete using (auth.uid() = created_by);

-- Signal通知ログ
create table public.signal_notifications (
  id uuid default gen_random_uuid() primary key,
  recipient_phone text not null,
  message text not null,
  trigger_type text not null,
  trigger_id uuid,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz default now()
);

alter table public.signal_notifications enable row level security;

create policy "管理者のみ通知ログを読める" on public.signal_notifications
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- updated_atの自動更新
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger events_updated_at before update on public.events
  for each row execute function public.handle_updated_at();

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.handle_updated_at();

-- 新規ユーザー登録時にprofileを自動作成
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
