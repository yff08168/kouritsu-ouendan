-- ============================================================
-- 甲子園出場歴の成績を埋める（school_championships.result が null の行）
--
-- このファイルは scripts/build-koshien-fixups.mjs が生成する。直接編集しない。
-- 生成日: 2026-08-12
--
-- 出典: ja.wikipedia.org の大会別記事（CC BY-SA 4.0）。事実データのみ抽出。
--
-- なぜ null が残っていたか（取り込みスクリプト側は修正済み）:
--   ・1972年春（第44回選抜）は得点の区切りが全角ハイフン「－」で、
--     半角ハイフンしか見ていなかったため、この大会の試合を1件も読めて
--     いなかった（出場25校が丸ごと成績不明。うち公立17校がこの表にある）。
--   ・1915〜1922年の大会は「日付 校名 得点 - 得点 校名」と日付が行頭に付き、
--     また敗者復活戦があって1校が2敗することがあった。
--   ・1969年夏の決勝は延長18回0-0の引き分け再試合。引き分けのほうだけを見て
--     決勝が取れず、三沢・松山商とも成績不明になっていた。
--   ・{{Efn}} や複数行の <ref> が「|」を含み、トーナメント表の列がずれていた。
--   ・同じ大会に同名校（1964年春の和歌山海南・徳島海南）がいると取り違えていた。
--
-- 「出場辞退」は、出場は記録されているが試合をしていない（または
-- 途中で辞退した）もの。Wikipediaの記事に明記されているものだけを入れている。
--
-- 実行後に必ず走らせること:
--   select public.recalc_school_koshien_counts();
-- ============================================================

update public.school_championships as c
set
  result = v.result,
  wins   = v.wins,
  losses = v.losses,
  note   = coalesce(v.note, c.note)
from (values
  ('hiroshimakokutaiji', 1915, 'summer', '初戦敗退', 0, 1, null::text),  -- 広島国泰寺高校 1915年夏
  ('hyogo', 1915, 'summer', '初戦敗退', 0, 1, null::text),  -- 兵庫高校 1915年夏
  ('kurumeshogyo', 1915, 'summer', '初戦敗退', 0, 1, null::text),  -- 久留米商業高校 1915年夏
  ('takamatsu', 1915, 'summer', '初戦敗退', 0, 1, null::text),  -- 高松高校 1915年夏
  ('toin', 1915, 'summer', 'ベスト4', 2, 1, null::text),  -- 桐蔭高校 1915年夏
  ('tottorinishi', 1915, 'summer', 'ベスト8', 1, 1, null::text),  -- 鳥取西高校 1915年夏
  ('ujiyamada', 1915, 'summer', '初戦敗退', 0, 1, null::text),  -- 宇治山田高校 1915年夏
  ('meizen', 1916, 'summer', '初戦敗退', 0, 2, null::text),  -- 明善高校 1916年夏
  ('tottorinishi', 1916, 'summer', 'ベスト4', 1, 2, null::text),  -- 鳥取西高校 1916年夏
  ('toin', 1917, 'summer', '初戦敗退', 0, 2, null::text),  -- 桐蔭高校 1917年夏
  ('niigatashogyo', 1922, 'summer', '出場辞退', 0, 0, null::text),  -- 新潟商業高校 1922年夏
  ('kaifu', 1964, 'spring', '優勝', 5, 0, '徳島県立海南高等学校として出場'),  -- 海部高校 1964年春
  ('matsuyamashogyo', 1969, 'summer', '優勝', 5, 0, null::text),  -- 松山商業高校 1969年夏
  ('misawa', 1969, 'summer', '準優勝', 4, 1, null::text),  -- 三沢高校 1969年夏
  ('aichi-seisho', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 成章高校 1972年春
  ('choshishogyo', 1972, 'spring', 'ベスト4', 3, 1, null::text),  -- 銚子商業高校 1972年春
  ('fukuishogyo', 1972, 'spring', 'ベスト16', 1, 1, null::text),  -- 福井商業高校 1972年春
  ('imabarinishi', 1972, 'spring', 'ベスト16', 1, 1, null::text),  -- 今治西高校 1972年春
  ('isahaya', 1972, 'spring', 'ベスト8', 1, 1, null::text),  -- 諫早高校 1972年春
  ('kitakyushushiritsu', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 北九州市立高校 1972年春
  ('kochishogyo', 1972, 'spring', 'ベスト8', 2, 1, null::text),  -- 高知商業高校 1972年春
  ('kurashikikogyo', 1972, 'spring', 'ベスト8', 2, 1, null::text),  -- 倉敷工業高校 1972年春
  ('matsueshogyo', 1972, 'spring', 'ベスト16', 1, 1, null::text),  -- 松江商業高校 1972年春
  ('minoshima', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 箕島高校 1972年春
  ('nago', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 名護高校 1972年春
  ('narashoko', 1972, 'spring', '初戦敗退', 0, 1, '奈良県立奈良朱雀高等学校として出場'),  -- 奈良商工高校 1972年春
  ('shinkotachibana', 1972, 'spring', 'ベスト8', 2, 1, null::text),  -- 神港橘高校 1972年春
  ('shizuokashogyo', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 静岡商業高校 1972年春
  ('tomakomaikogyo', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 苫小牧工業高校 1972年春
  ('toridedaiichi', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 取手第一高校 1972年春
  ('tottorikogyo', 1972, 'spring', '初戦敗退', 0, 1, null::text),  -- 鳥取工業高校 1972年春
  ('utsunomiyakogyo', 1989, 'spring', '初戦敗退', 0, 1, null::text),  -- 宇都宮工業高校 1989年春
  ('imabarinishi', 2003, 'summer', 'ベスト32', 1, 1, null::text),  -- 今治西高校 2003年夏
  ('ujiyamadashogyo', 2007, 'summer', '初戦敗退', 0, 1, null::text),  -- 宇治山田商業高校 2007年夏
  ('hitarinko', 2008, 'summer', '初戦敗退', 0, 1, null::text),  -- 日田林工高校 2008年夏
  ('miyazakishogyo', 2021, 'summer', '出場辞退', 0, 0, null::text),  -- 宮崎商業高校 2021年夏
  ('takaokashogyo', 2021, 'summer', '初戦敗退', 0, 1, null::text),  -- 高岡商業高校 2021年夏
  ('hiroshimashogyo', 2022, 'spring', '出場辞退', 1, 0, null::text),  -- 広島商業高校 2022年春
  ('nyu', 2022, 'spring', '初戦敗退', 0, 1, null::text),  -- 丹生高校 2022年春
  ('tadami', 2022, 'spring', '初戦敗退', 0, 1, null::text),  -- 只見高校 2022年春
  ('gifushogyo', 2022, 'summer', '初戦敗退', 0, 1, null::text)  -- 岐阜商業高校 2022年夏
) as v(slug, year, season, result, wins, losses, note)
join public.schools s on s.slug = v.slug
where c.school_id = s.id
  and c.year      = v.year
  and c.season    = v.season::public.season
  -- **すでに入っている成績は上書きしない。** 埋めるのは空欄だけ。
  and c.result is null;

select public.recalc_school_koshien_counts();
