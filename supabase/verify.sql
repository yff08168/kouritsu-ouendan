-- ============================================================
-- 投入結果の確認
-- seed.sql のあとに実行して、期待どおりの件数が入ったかを見る。
-- ============================================================

select * from (values
  ('都道府県',           (select count(*) from public.prefectures),          47),
  ('学校',               (select count(*) from public.schools),              10),
  ('　うち国立・高専',   (select count(*) from public.schools
                          where establishment = 'national'),                  2),
  ('甲子園出場歴',       (select count(*) from public.school_championships),  18),
  ('最近の戦績',         (select count(*) from public.school_records),         8),
  ('公立旋風',           (select count(*) from public.phenomena),              4),
  ('ニュース（全体）',   (select count(*) from public.news),                   7),
  ('　うち公開済み',     (select count(*) from public.news
                          where status = 'published'),                         6),
  ('　うち下書き',       (select count(*) from public.news
                          where status = 'draft'),                             1),
  ('特集',               (select count(*) from public.features),               4),
  ('ニュース⇄学校',     (select count(*) from public.news_schools),           4),
  ('公立旋風⇄学校',     (select count(*) from public.phenomenon_schools),     4)
) as t(項目, 実際, 期待);
