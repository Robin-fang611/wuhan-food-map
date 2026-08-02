-- 江城 · 全校日常平台 — 初始数据模型
-- 在 Supabase 控制台的 SQL Editor 中执行本文件即可建表。
-- 设计原则：读公开、写需登录；RLS 默认开启。

-- ============ 用户档案（扩展 auth.users）============
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  campus text check (campus in ('nanhu','shouyi')) default 'nanhu',
  role text check (role in ('student','merchant','admin')) default 'student',
  points int default 0,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "profiles 可读" on profiles for select using (true);
create policy "profiles 自改" on profiles for update using (auth.uid() = id);

-- ============ 校园动态（feed）============
create table if not exists posts (
  id bigint primary key generated always as identity,
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  images text[] default '{}',
  tags text[] default '{}',
  campus text check (campus in ('nanhu','shouyi','both')) default 'both',
  created_at timestamptz default now()
);
alter table posts enable row level security;
create policy "posts 公开读" on posts for select using (true);
create policy "posts 登录发" on posts for insert with check (auth.uid() is not null);

-- ============ 评论（动态/问答通用）============
create table if not exists comments (
  id bigint primary key generated always as identity,
  post_id bigint references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);
alter table comments enable row level security;
create policy "comments 公开读" on comments for select using (true);
create policy "comments 登录发" on comments for insert with check (auth.uid() is not null);

-- ============ 商家 / 美食 ============
create table if not exists shops (
  id bigint primary key generated always as identity,
  name text not null,
  category text,
  campus text check (campus in ('nanhu','shouyi','both')) default 'both',
  address text,
  avg_rating numeric(2,1) default 0,
  review_count int default 0,
  owner_id uuid references profiles(id) on delete set null,
  promoted_until timestamptz,
  created_at timestamptz default now()
);
alter table shops enable row level security;
create policy "shops 公开读" on shops for select using (true);
create policy "shops 商家改" on shops for update using (auth.uid() = owner_id);

create table if not exists shop_reviews (
  id bigint primary key generated always as identity,
  shop_id bigint references shops(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  rating int check (rating between 1 and 5),
  content text,
  images text[] default '{}',
  created_at timestamptz default now()
);
alter table shop_reviews enable row level security;
create policy "shop_reviews 公开读" on shop_reviews for select using (true);
create policy "shop_reviews 登录发" on shop_reviews for insert with check (auth.uid() is not null);

-- ============ 食堂 / 档口点评 ============
create table if not exists canteens (
  id bigint primary key generated always as identity,
  name text not null,
  campus text check (campus in ('nanhu','shouyi')) default 'nanhu'
);
create table if not exists canteen_windows (
  id bigint primary key generated always as identity,
  canteen_id bigint references canteens(id) on delete cascade,
  name text not null
);
create table if not exists canteen_reviews (
  id bigint primary key generated always as identity,
  window_id bigint references canteen_windows(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  taste int check (taste between 1 and 5),
  price int check (price between 1 and 5),
  hygiene int check (hygiene between 1 and 5),
  amount int check (amount between 1 and 5),
  content text,
  tag text check (tag in ('recommend','avoid','new')),
  created_at timestamptz default now()
);
alter table canteens enable row level security;
alter table canteen_windows enable row level security;
alter table canteen_reviews enable row level security;
create policy "canteens 公开读" on canteens for select using (true);
create policy "windows 公开读" on canteen_windows for select using (true);
create policy "canteen_reviews 公开读" on canteen_reviews for select using (true);
create policy "canteen_reviews 登录发" on canteen_reviews for insert with check (auth.uid() is not null);

-- ============ 二手市场 ============
create table if not exists secondhand (
  id bigint primary key generated always as identity,
  seller_id uuid references profiles(id) on delete set null,
  title text not null,
  category text,
  price numeric(10,2),
  cond text,
  campus text check (campus in ('nanhu','shouyi','both')) default 'both',
  sold boolean default false,
  created_at timestamptz default now()
);
alter table secondhand enable row level security;
create policy "secondhand 公开读" on secondhand for select using (true);
create policy "secondhand 登录发" on secondhand for insert with check (auth.uid() is not null);
create policy "secondhand 本人改" on secondhand for update using (auth.uid() = seller_id);

-- ============ 互助问答 ============
create table if not exists questions (
  id bigint primary key generated always as identity,
  author_id uuid references profiles(id) on delete set null,
  title text not null,
  content text,
  category text,
  campus text check (campus in ('nanhu','shouyi','both')) default 'both',
  solved boolean default false,
  created_at timestamptz default now()
);
create table if not exists question_answers (
  id bigint primary key generated always as identity,
  question_id bigint references questions(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  content text not null,
  accepted boolean default false,
  created_at timestamptz default now()
);
alter table questions enable row level security;
alter table question_answers enable row level security;
create policy "questions 公开读" on questions for select using (true);
create policy "questions 登录发" on questions for insert with check (auth.uid() is not null);
create policy "answers 公开读" on question_answers for select using (true);
create policy "answers 登录发" on question_answers for insert with check (auth.uid() is not null);

-- ============ 校园活动 ============
create table if not exists activities (
  id bigint primary key generated always as identity,
  title text not null,
  type text,
  campus text check (campus in ('nanhu','shouyi','both')) default 'both',
  location text,
  start_at timestamptz,
  detail text,
  created_at timestamptz default now()
);
alter table activities enable row level security;
create policy "activities 公开读" on activities for select using (true);

-- ============ 积分流水 ============
create table if not exists points_log (
  id bigint primary key generated always as identity,
  user_id uuid references profiles(id) on delete cascade,
  delta int not null,
  reason text,
  created_at timestamptz default now()
);
alter table points_log enable row level security;
create policy "points 本人读" on points_log for select using (auth.uid() = user_id);
