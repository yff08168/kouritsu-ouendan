-- ============================================================
-- 0004 北海道と東京を甲子園の大会区分に分割する
--
-- 北海道と東京はそれぞれ2校が甲子園に出る。
-- 高校野球では「北北海道」「南北海道」「東東京」「西東京」が
-- ひとつの単位なので、都道府県マスタをこの49地区に合わせる。
--
-- 分割していない45件のidはJISコードのまま。分割した4件はJISコードに
-- 対応する値がないため48〜51を割り当て、元の 1（北海道）と 13（東京）は消す。
--
-- 学校の住所としての「北海道」「東京都」は schools.city 側に残るので、
-- ここで失われる情報はない。
--
-- Supabase の SQL Editor に貼って実行する。
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 4地区を追加する
-- ------------------------------------------------------------
insert into public.prefectures (id, name, full_name, name_kana, slug, region, sort_order) values
  (48, '北北海道', '北北海道', 'きたほっかいどう',   'kita-hokkaido',   '北海道',  1),
  (49, '南北海道', '南北海道', 'みなみほっかいどう', 'minami-hokkaido', '北海道',  2),
  (50, '東東京',   '東東京',   'ひがしとうきょう',   'higashi-tokyo',   '関東',   13),
  (51, '西東京',   '西東京',   'にしとうきょう',     'nishi-tokyo',     '関東',   14)
on conflict (id) do nothing;

-- 以降の並び順を2つぶんずつ後ろにずらす（青森が3番目になる）
update public.prefectures set sort_order = sort_order + 1 where id between 2 and 12;
update public.prefectures set sort_order = sort_order + 2 where id between 14 and 47;

-- ------------------------------------------------------------
-- 2. 既存データの付け替え
--
-- 北海道の南北は振興局で決まるので住所から判定できるが、
-- 東京の東西は東京都高野連が定めるもので、住所からは機械的に決められない。
-- ここでは暫定的に南北海道・西東京へ寄せる。
-- 実データを入れるときは学校ごとに正しい地区を指定すること。
-- ------------------------------------------------------------
update public.schools   set prefecture_id = 49 where prefecture_id = 1;
update public.schools   set prefecture_id = 51 where prefecture_id = 13;
update public.news      set prefecture_id = 49 where prefecture_id = 1;
update public.news      set prefecture_id = 51 where prefecture_id = 13;
update public.phenomena set prefecture_id = 49 where prefecture_id = 1;
update public.phenomena set prefecture_id = 51 where prefecture_id = 13;

-- ------------------------------------------------------------
-- 3. 分割前の行を消す
-- ------------------------------------------------------------
delete from public.prefectures where id in (1, 13);

comment on table public.prefectures is
  '地区マスタ（49件）。甲子園の大会区分。分割していない45件のidはJISコードと一致する。';

commit;
