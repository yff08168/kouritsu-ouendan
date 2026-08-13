-- ============================================================
-- 福山（広島・市立）の2026年夏の出場歴を入れる  2026-08-12
--
-- Wikipedia の記事名が「福山市立福山中・高等学校」で、照合規則が
-- 「中学校・高等学校」しか見ていなかったため、現存する市立高校なのに
-- 「統廃合で消えた学校」に分類され、出場歴が1件まるごと落ちていた。
-- 規則は scripts/match-koshien.mjs 側で修正済み。
--
-- supabase/koshien.sql を丸ごと流し直しても同じ結果になる（あちらは
-- upsert なので何度流しても安全）。これは1行だけを足す短い版。
--
-- Supabase の SQL Editor に貼って実行する。
-- ============================================================

insert into public.school_championships
  (school_id, year, season, result, wins, losses, note)
values
  ((select id from public.schools where slug = 'fukuyama'), 2026, 'summer'::public.season, '初戦敗退', 0, 1, null)
on conflict (school_id, year, season) do update set
  result = excluded.result,
  wins   = excluded.wins,
  losses = excluded.losses,
  note   = excluded.note;

-- 非正規化列（koshien_summer_count / last_koshien_year）を作り直す。
-- これを忘れると、学校ページの出場回数と /rankings に反映されない。
select public.recalc_school_koshien_counts();

-- 確認用
select s.name, s.koshien_spring_count, s.koshien_summer_count, s.last_koshien_year
from public.schools s
where s.slug = 'fukuyama';
