-- ============================================================
-- 開発用サンプルデータ（架空の学校とその記事）を消す
--
-- 消すのは seed.sql が入れた架空の10校と、それを題材にした
-- ニュース・公立旋風だけ。都道府県マスタ・情報源・特集は残す。
--
-- 学校を消すと、甲子園出場歴・戦績・記事とのひもづけは
-- 外部キーの on delete cascade で一緒に消える。
--
-- **実在の学校を入れたあとに実行してよい。** slugを名指しで消しており、
-- 架空10校のslugは実在の3,531校のどれとも衝突しないことを確認済み。
-- 実データを入れてから内容を確認し、公開前に一度だけ実行する（README参照）。
--
-- 実行後、トップの「最新ニュース」と「公立旋風」は空になる。壊れてはいない。
--
-- Supabase の SQL Editor に貼って実行する。
-- ============================================================

begin;

-- 架空の学校を題材にした記事。学校より先に消す必要はないが、
-- 何を消したのか件数で分かるように分けて書く。
delete from public.phenomena
where slug in (
  'izumo-seiryo-2026-spring',
  'nagara-shogyo-2026-spring',
  'inaho-nogyo-2026-spring',
  'aki-kawauchi-2024-summer'
);

delete from public.news
where slug in (
  'izumo-seiryo-shimane-yusho-2026',
  'nagara-shogyo-best8-2026',
  'natsu-chihou-taikai-kumiawase-2026',
  'renshu-kankyo-chiiki-torikumi',
  'column-koritsu-de-yakyu-wo-tsuzukeru',
  'harima-kosen-shoshutsujo-2026',
  'shimonaka-draft-sample'
);

-- 架空の10校。甲子園出場歴・戦績・記事とのひもづけはcascadeで消える。
delete from public.schools
where slug in (
  'izumo-seiryo',
  'nagara-shogyo',
  'inaho-nogyo',
  'konan-shogyo',
  'aki-kawauchi',
  'haebaru-sogo',
  'tama-sakuragaoka',
  'tokachi-seiryu',
  'harima-kosen',
  'owari-kyoiku-fuzoku'
);

commit;

-- 確認用その1。架空データが残っていないか。どれも0件なら消えている。
select 'schools（架空）'   as table_name, count(*) from public.schools
  where slug in ('izumo-seiryo','nagara-shogyo','inaho-nogyo','konan-shogyo',
                 'aki-kawauchi','haebaru-sogo','tama-sakuragaoka','tokachi-seiryu',
                 'harima-kosen','owari-kyoiku-fuzoku')
union all
select 'phenomena（架空）', count(*) from public.phenomena
  where slug in ('izumo-seiryo-2026-spring','nagara-shogyo-2026-spring',
                 'inaho-nogyo-2026-spring','aki-kawauchi-2024-summer')
union all
select 'news（架空）',      count(*) from public.news
  where slug in ('izumo-seiryo-shimane-yusho-2026','nagara-shogyo-best8-2026',
                 'natsu-chihou-taikai-kumiawase-2026','renshu-kankyo-chiiki-torikumi',
                 'column-koritsu-de-yakyu-wo-tsuzukeru','harima-kosen-shoshutsujo-2026',
                 'shimonaka-draft-sample');

-- 確認用その2。実在ぶんが残っているか。学校3,505／出場歴2,969 になる。
select 'schools（全体）' as table_name, count(*) from public.schools
union all
select 'school_championships（全体）', count(*) from public.school_championships;
