-- ============================================================
-- 0003: 公立旋風のバッジと、都道府県別の学校数ビュー
--
-- 実装を進めるなかで足りないことが分かった2点を足す。
-- 何度実行しても同じ結果になるように書いてある。
-- ============================================================


-- ------------------------------------------------------------
-- 1. phenomena.badge
--    トップページに出す「甲子園出場決定」「ベスト8進出」などの短いラベル。
--    level（甲子園/県大会/地区大会）から機械的に導けるものではなく、
--    そのときどきで編集部が付ける言葉なので、独立したカラムとして持つ。
-- ------------------------------------------------------------
alter table public.phenomena add column if not exists badge text;

comment on column public.phenomena.badge is
  'トップの注目枠に出す短いラベル。null なら何も出さない。';

update public.phenomena set badge = '甲子園出場決定' where slug = 'izumo-seiryo-2026-spring';
update public.phenomena set badge = 'ベスト8進出'   where slug = 'nagara-shogyo-2026-spring';
update public.phenomena set badge = '注目'         where slug = 'inaho-nogyo-2026-spring';


-- ------------------------------------------------------------
-- 2. 都道府県別の学校数ビュー
--    トップページの都道府県セレクタで「その県に何校あるか」を出すために使う。
--    全学校を取得してアプリ側で数えると、全国データ投入後に
--    3,500件を毎回転送することになるため、DB側で集計する。
--
--    security_invoker = true にしているのは、ビューを作った人の権限ではなく
--    「そのビューを叩いた人」の権限で評価させるため。
--    これがないと RLS を迂回して未公開の学校まで数えてしまう。
-- ------------------------------------------------------------
create or replace view public.school_counts_by_prefecture
with (security_invoker = true) as
select
  p.slug          as prefecture_slug,
  p.id            as prefecture_id,
  count(s.id)     as school_count
from public.prefectures p
left join public.schools s on s.prefecture_id = p.id
group by p.slug, p.id;

grant select on public.school_counts_by_prefecture to anon, authenticated;
