-- ============================================================
-- 投入結果の確認
--
-- 期待値は「第1段階まで終えた状態」＝ 0004 と schools_*.sql 8ファイルを
-- 流し、架空の10校をまだ残している状態のもの（README「適用の順番」）。
--
-- remove_sample_data.sql を流したあとは、括弧内の数に変わる。
-- ============================================================

select * from (values
  ('地区（都道府県）',   (select count(*) from public.prefectures),         49),
  ('学校',               (select count(*) from public.schools),           3541),  -- 架空10校を消すと 3531
  ('　うち公開',         (select count(*) from public.schools
                          where status = 'published'),                    3515),  -- → 3505
  ('　うち下書き',       (select count(*) from public.schools
                          where status = 'draft'),                          26),  -- 硬式野球部なし
  ('　うち国立',         (select count(*) from public.schools
                          where establishment = 'national'),                72),  -- → 70
  ('　うち高専',         (select count(*) from public.schools
                          where school_kind = 'kosen'),                     55),  -- → 54
  ('　うち中等教育学校', (select count(*) from public.schools
                          where school_kind = 'secondary'),                 40),
  ('甲子園出場歴',       (select count(*) from public.school_championships), 18),  -- → 0
  ('最近の戦績',         (select count(*) from public.school_records),        8),  -- → 0
  ('公立旋風',           (select count(*) from public.phenomena),             4),  -- → 0
  ('ニュース（全体）',   (select count(*) from public.news),                  7),  -- → 0
  ('　うち公開済み',     (select count(*) from public.news
                          where status = 'published'),                        6),  -- → 0
  ('　うち下書き',       (select count(*) from public.news
                          where status = 'draft'),                            1),  -- → 0
  ('特集',               (select count(*) from public.features),              4),
  ('ニュース⇄学校',     (select count(*) from public.news_schools),           4),  -- → 0
  ('公立旋風⇄学校',     (select count(*) from public.phenomenon_schools),     4)   -- → 0
) as t(項目, 実際, 期待);

-- 架空の10校が残っているかの確認。第1段階では10件、削除後は0件。
select slug, name from public.schools
where slug in (
  'izumo-seiryo', 'nagara-shogyo', 'inaho-nogyo', 'konan-shogyo', 'aki-kawauchi',
  'haebaru-sogo', 'tama-sakuragaoka', 'tokachi-seiryu', 'harima-kosen', 'owari-kyoiku-fuzoku'
)
order by slug;
