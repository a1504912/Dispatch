-- Dispatch 雲端同步模式：在 Supabase 的 SQL Editor 貼上執行一次即可。
-- 建立 categories / events / subtasks 三張表 + 只允許登入者存取的安全規則。

create table if not exists categories (
  id bigint generated always as identity primary key,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  title text not null,
  -- 用不帶時區的 timestamp，前端直接以本地時間讀寫（與筆電版行為一致）
  start_time timestamp not null,
  end_time timestamp not null,
  description text not null default '',
  agent_id bigint,
  color text not null default '#3788d8',
  completed boolean not null default false,
  all_day boolean not null default false,
  image text,
  category_id bigint references categories(id) on delete set null,
  source text not null default 'local',
  google_event_id text,
  is_task boolean not null default false
);

create table if not exists subtasks (
  id bigint generated always as identity primary key,
  event_id bigint not null references events(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security：沒登入的人完全碰不到資料
alter table categories enable row level security;
alter table events enable row level security;
alter table subtasks enable row level security;

create policy "authenticated full access" on categories
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on events
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on subtasks
  for all to authenticated using (true) with check (true);
