-- ============================================================
-- 0007 甲子園の出場回数（春＋夏）の合計列
--
-- 「公立高校を探す」の並び替えに「甲子園出場回数順」を足すため。
--
-- **アプリ側で合計して並べ替えることはできない。** PostgREST は列でしか
-- 並べ替えられず、式（spring + summer）を order に渡せない。全件取って
-- メモリで並べる手もあるが、1ページ表示するたびに3,500行を取ることになる。
--
-- 生成列なので更新は要らない。recalc_school_koshien_counts() が
-- koshien_spring_count / koshien_summer_count を書き換えれば自動で追従する。
--
-- 何度流しても安全（if not exists）。
-- ============================================================

alter table public.schools
  add column if not exists koshien_total smallint
  generated always as (koshien_spring_count + koshien_summer_count) stored;

comment on column public.schools.koshien_total is
  '春＋夏の甲子園出場回数。生成列なので直接更新しない。';

-- 並び替え用。降順で引くので降順のインデックスを張る
create index if not exists schools_koshien_total_idx
  on public.schools (koshien_total desc);

-- 確認用
select
  count(*) filter (where koshien_total > 0) as "出場歴のある学校",
  max(koshien_total)                        as "最多出場回数"
from public.schools;
