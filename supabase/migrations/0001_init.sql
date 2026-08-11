-- ============================================================
-- 公立応援団 初期スキーマ
--
-- 方針:
--  - テーブルは10個に絞る。正規化しすぎて開発が重くならないようにする。
--  - 「公立」の定義に国立・高専を含めるため、is_public のような真偽値は持たず、
--    establishment（設置区分）と school_kind（学校種別）の2軸で表現する。
--  - 画像は URL 単体ではなく credit / source_url とセットで持つ。
--    CC BY-SA 等の画像は帰属表示が法的義務のため。
--  - 公開/非公開は status で持つ。将来のニュース自動収集で
--    「AIが下書き → 人間が確認 → 公開」を回すために最初から必要。
-- ============================================================

-- 学校名の部分一致検索に使う（日本語は形態素解析なしだと全文検索が効かないため）
create extension if not exists pg_trgm with schema extensions;


-- ------------------------------------------------------------
-- 列挙型
-- ------------------------------------------------------------

-- 設置区分。private のみ収録対象外だが、対戦相手として保持できるよう型には含める。
create type public.establishment as enum (
  'prefectural',   -- 都道府県立（表示は 道立/都立/府立/県立 に出し分ける）
  'municipal',     -- 市立
  'town_village',  -- 町村立
  'combined',      -- 組合立
  'national',      -- 国立
  'private'        -- 私立
);

-- 国立を含めたことで高専・中等教育学校が入るため区別する
create type public.school_kind as enum (
  'high_school',   -- 高等学校
  'kosen',         -- 高等専門学校（5年制）
  'secondary'      -- 中等教育学校（後期課程）
);

create type public.content_status as enum (
  'draft',      -- 下書き（自動収集の投入先）
  'review',     -- 人間の確認待ち
  'published',  -- 公開
  'archived'    -- 取り下げ
);

create type public.news_category as enum (
  'result',   -- 大会・結果
  'news',     -- ニュース
  'topic',    -- トピックス
  'column',   -- コラム
  'preview'   -- 展望
);

create type public.season as enum ('spring', 'summer', 'autumn');

create type public.phenomenon_level as enum (
  'koshien',      -- 甲子園
  'prefectural',  -- 県大会
  'regional'      -- 地区大会
);

create type public.feature_category as enum (
  'guide',        -- 観戦ガイド
  'history',      -- 歴史
  'school_intro', -- チーム紹介
  'stadium',      -- 球場情報
  'goods'         -- 観戦グッズ
);


-- ------------------------------------------------------------
-- 共通トリガ
-- ------------------------------------------------------------

-- search_path を固定しているのは、検索パスを差し替えて関数の挙動を乗っ取る
-- 攻撃を防ぐため（Supabase のセキュリティ検査でも指摘される）。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 1. prefectures（都道府県）
--    enum ではなくテーブルにしているのは、都道府県ページに固有の
--    説明文やSEOメタを持たせたいため。
-- ------------------------------------------------------------
create table public.prefectures (
  id          smallint primary key,          -- JIS都道府県コード 1〜47
  name        text not null,                 -- 島根
  full_name   text not null,                 -- 島根県
  name_kana   text not null,                 -- しまね
  slug        text not null unique,          -- shimane（URLはローマ字）
  region      text not null,                 -- 中国
  description text,
  sort_order  smallint not null
);

comment on table public.prefectures is '都道府県マスタ。idはJISコードと一致させる。';


-- ------------------------------------------------------------
-- 2. schools（学校）
-- ------------------------------------------------------------
create table public.schools (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,                       -- 出雲西陵高校
  official_name        text not null,                       -- 島根県立出雲西陵高等学校
  -- 表記ゆれ（「県岐商」など）。ニュース自動収集の学校名抽出で使うため最初から持つ。
  name_aliases         text[] not null default '{}',
  prefecture_id        smallint not null references public.prefectures (id),
  city                 text,
  establishment        public.establishment not null,
  school_kind          public.school_kind not null default 'high_school',
  founded_year         smallint,
  catchcopy            text,
  description          text,
  website_url          text,

  image_url            text,
  image_credit         text,   -- 例: '©︎ 撮影者名 / CC BY-SA 4.0'
  image_source_url     text,

  -- 一覧カードで毎回 school_championships を集計すると重いため非正規化する。
  -- 更新は下部の recalc_school_koshien_counts() で行う。
  koshien_spring_count smallint not null default 0,
  koshien_summer_count smallint not null default 0,
  last_koshien_year    smallint,

  -- 検索用。name / official_name / aliases / city を結合したもの（トリガで更新）
  search_text          text not null default '',

  status               public.content_status not null default 'draft',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.schools.establishment is
  '注意: 東京都立国立高校（くにたち）は prefectural であって national ではない。機械判定すると誤分類する。';

create index schools_prefecture_idx on public.schools (prefecture_id);
create index schools_establishment_idx on public.schools (establishment);
create index schools_status_idx on public.schools (status);
create index schools_search_idx on public.schools using gin (search_text extensions.gin_trgm_ops);

create or replace function public.schools_set_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text =
    coalesce(new.name, '') || ' ' ||
    coalesce(new.official_name, '') || ' ' ||
    coalesce(array_to_string(new.name_aliases, ' '), '') || ' ' ||
    coalesce(new.city, '');
  return new;
end;
$$;

create trigger schools_search_text
  before insert or update on public.schools
  for each row execute function public.schools_set_search_text();

create trigger schools_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 3. news_sources（情報源）
--    将来のRSS自動収集で使う。MVPでは編集部のみ。
-- ------------------------------------------------------------
create table public.news_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  site_url     text,
  feed_url     text,
  feed_type    text,     -- rss / atom / api
  license_note text,     -- 引用可否のメモ。全文転載しない方針を各ソースごとに記録する
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 4. news（ニュース）
--    body には引用元の全文を入れない。見出し＋自作の要約＋出典リンクまで。
-- ------------------------------------------------------------
create table public.news (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  summary          text not null,
  body             text,                       -- Markdown
  category         public.news_category not null default 'news',
  status           public.content_status not null default 'draft',
  published_at     timestamptz,

  source_id        uuid references public.news_sources (id) on delete set null,
  source_name      text,                       -- 表示用（source削除後も残す）
  source_url       text,                       -- 元記事へのリンク

  prefecture_id    smallint references public.prefectures (id),

  image_url        text,
  image_credit     text,
  image_source_url text,

  seo_title        text,
  seo_description  text,

  -- 自動収集時の重複判定用。同じ記事を二重登録しない。
  ingest_hash      text unique,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint news_published_needs_date
    check (status <> 'published' or published_at is not null)
);

create index news_published_idx
  on public.news (published_at desc)
  where status = 'published';
create index news_category_idx on public.news (category);
create index news_prefecture_idx on public.news (prefecture_id);

create trigger news_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 5. news_schools（ニュース ⇄ 学校 N:N）
--    1つのニュースに複数校が登場するケースに対応する。
-- ------------------------------------------------------------
create table public.news_schools (
  news_id   uuid not null references public.news (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  relevance smallint not null default 0,  -- 大きいほど主役
  primary key (news_id, school_id)
);

create index news_schools_school_idx on public.news_schools (school_id);


-- ------------------------------------------------------------
-- 6. phenomena（公立旋風）
--    ニュースのカテゴリではなく独立テーブルにする。
--    年・シーズン・規模で集計でき、「歴代公立旋風」をクエリだけで作れる。
-- ------------------------------------------------------------
create table public.phenomena (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  year             smallint not null,
  season           public.season not null,
  level            public.phenomenon_level not null,
  summary          text,
  body             text,                       -- Markdown
  prefecture_id    smallint references public.prefectures (id),

  image_url        text,
  image_credit     text,
  image_source_url text,

  -- トップページの注目枠に出す順位。null なら出さない。
  highlight_rank   smallint,

  status           public.content_status not null default 'draft',
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index phenomena_year_idx on public.phenomena (year desc, season);
create index phenomena_highlight_idx
  on public.phenomena (highlight_rank)
  where highlight_rank is not null and status = 'published';

create trigger phenomena_updated_at
  before update on public.phenomena
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 7. phenomenon_schools（公立旋風 ⇄ 学校 N:N）
--    1つの旋風に複数校が絡む（対戦相手など）ため。
-- ------------------------------------------------------------
create table public.phenomenon_schools (
  phenomenon_id uuid not null references public.phenomena (id) on delete cascade,
  school_id     uuid not null references public.schools (id) on delete cascade,
  role          text not null default 'main',  -- main / opponent
  primary key (phenomenon_id, school_id)
);

create index phenomenon_schools_school_idx on public.phenomenon_schools (school_id);


-- ------------------------------------------------------------
-- 8. features（特集）
-- ------------------------------------------------------------
create table public.features (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  subtitle         text,
  category         public.feature_category not null,
  body             text,                       -- Markdown
  image_url        text,
  image_credit     text,
  image_source_url text,
  seo_title        text,
  seo_description  text,
  sort_order       smallint not null default 0,
  status           public.content_status not null default 'draft',
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index features_category_idx on public.features (category);

create trigger features_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 9. school_championships（甲子園出場歴）
-- ------------------------------------------------------------
create table public.school_championships (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  year      smallint not null,
  season    public.season not null,
  result    text,        -- 優勝 / 準優勝 / ベスト4 / 2回戦 など
  wins      smallint,
  losses    smallint,
  note      text,
  unique (school_id, year, season)
);

create index school_championships_school_idx
  on public.school_championships (school_id, year desc);


-- ------------------------------------------------------------
-- 10. school_records（最近の戦績）
-- ------------------------------------------------------------
create table public.school_records (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete cascade,
  year            smallint not null,
  tournament_name text not null,   -- 2026年 春季島根県大会 など
  result          text,
  note            text,
  created_at      timestamptz not null default now()
);

create index school_records_school_idx
  on public.school_records (school_id, year desc);


-- ------------------------------------------------------------
-- 甲子園出場回数の再計算
-- 出場歴を編集したあとに実行する（トリガにしないのは、
-- 一括投入時に1行ずつ再計算が走って重くなるのを避けるため）。
-- ------------------------------------------------------------
create or replace function public.recalc_school_koshien_counts()
returns void
language sql
set search_path = ''
as $$
  update public.schools s
  set
    koshien_spring_count = coalesce(c.spring, 0),
    koshien_summer_count = coalesce(c.summer, 0),
    last_koshien_year    = c.last_year
  from (
    -- left join にしているのは、出場歴を削除した学校の回数を
    -- 0 に戻すため（inner join だとその学校が対象から外れて古い値が残る）。
    select
      s2.id                                        as school_id,
      count(ch.id) filter (where ch.season = 'spring') as spring,
      count(ch.id) filter (where ch.season = 'summer') as summer,
      max(ch.year)                                 as last_year
    from public.schools s2
    left join public.school_championships ch on ch.school_id = s2.id
    group by s2.id
  ) c
  where c.school_id = s.id;
$$;
