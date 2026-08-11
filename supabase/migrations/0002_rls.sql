-- ============================================================
-- 行レベルセキュリティ（RLS）
--
-- 方針:
--  - 全テーブルで RLS を有効にする。MVPの時点から入れておく。
--    後付けにすると、テーブルが増えたときに必ず有効化漏れが起きる。
--  - 未公開コンテンツを隠す条件を、アプリ側の .eq('status','published') に
--    頼らずDB側で強制する。クエリ1か所の書き忘れで下書きが漏れないようにする。
--  - 書き込みは service_role のみ（service_role は RLS をバイパスするため
--    ポリシーを書かない ＝ anon / authenticated には一切許可しない）。
-- ============================================================

alter table public.prefectures          enable row level security;
alter table public.schools              enable row level security;
alter table public.news_sources         enable row level security;
alter table public.news                 enable row level security;
alter table public.news_schools         enable row level security;
alter table public.phenomena            enable row level security;
alter table public.phenomenon_schools   enable row level security;
alter table public.features             enable row level security;
alter table public.school_championships enable row level security;
alter table public.school_records       enable row level security;


-- ------------------------------------------------------------
-- 既存ポリシーの削除
-- このファイルを2回実行してもエラーにならないようにするため。
-- （create policy には if not exists が無いため、先に落としておく）
-- ------------------------------------------------------------
drop policy if exists "prefectures are public"            on public.prefectures;
drop policy if exists "published schools are public"      on public.schools;
drop policy if exists "published news are public"         on public.news;
drop policy if exists "published phenomena are public"    on public.phenomena;
drop policy if exists "published features are public"     on public.features;
drop policy if exists "news_schools follow parents"       on public.news_schools;
drop policy if exists "phenomenon_schools follow parents" on public.phenomenon_schools;
drop policy if exists "championships follow school"       on public.school_championships;
drop policy if exists "records follow school"             on public.school_records;


-- ------------------------------------------------------------
-- マスタ: 誰でも読める
-- ------------------------------------------------------------
create policy "prefectures are public"
  on public.prefectures for select
  to anon, authenticated
  using (true);


-- ------------------------------------------------------------
-- 本体テーブル: 公開済みのみ読める
-- ------------------------------------------------------------
create policy "published schools are public"
  on public.schools for select
  to anon, authenticated
  using (status = 'published');

create policy "published news are public"
  on public.news for select
  to anon, authenticated
  using (status = 'published');

create policy "published phenomena are public"
  on public.phenomena for select
  to anon, authenticated
  using (status = 'published');

create policy "published features are public"
  on public.features for select
  to anon, authenticated
  using (status = 'published');


-- ------------------------------------------------------------
-- 中間テーブル・付随テーブル: 親が公開済みのときだけ読める
-- 親が下書きの学校/ニュースの存在が、関連テーブル経由で漏れないようにする。
-- ------------------------------------------------------------
create policy "news_schools follow parents"
  on public.news_schools for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.news n
      where n.id = news_id and n.status = 'published'
    )
    and exists (
      select 1 from public.schools s
      where s.id = school_id and s.status = 'published'
    )
  );

create policy "phenomenon_schools follow parents"
  on public.phenomenon_schools for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.phenomena p
      where p.id = phenomenon_id and p.status = 'published'
    )
    and exists (
      select 1 from public.schools s
      where s.id = school_id and s.status = 'published'
    )
  );

create policy "championships follow school"
  on public.school_championships for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.schools s
      where s.id = school_id and s.status = 'published'
    )
  );

create policy "records follow school"
  on public.school_records for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.schools s
      where s.id = school_id and s.status = 'published'
    )
  );


-- ------------------------------------------------------------
-- news_sources には一般公開ポリシーを作らない。
-- 収集元のフィードURLや契約メモは運用情報であり、表示には
-- news.source_name / news.source_url（非正規化した表示用の値）を使う。
-- ------------------------------------------------------------
