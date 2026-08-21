-- ============================================================
-- 公立旋風（phenomena）の実データ 第3弾・21世紀枠でベスト4の2校
--
-- 宜野座（沖縄・2001年春）と 利府（宮城・2009年春）。
-- **どちらも甲子園の記録**（level = 'koshien'）なので、
-- 地方大会の senpu_seed_chihou.sql とは別のファイルにしてある。
--
-- **何度流しても安全**（slug で重ね書きする）。他の senpu_seed*.sql とは独立。
--
-- ------------------------------------------------------------
-- ★「21世紀枠でベスト4は2校だけ」の根拠（2026-08-21 に自分で数えた）
-- ------------------------------------------------------------
-- src/lib/data/twenty-first-century.ts の70件それぞれについて、
-- school_championships の同じ年の春の成績を引いて数えた。
--   ベスト4 … 2件（宜野座2001・利府2009）
--   ベスト16 … 9件 ／ ベスト32 … 3件 ／ 初戦敗退 … 52件
--   DBに成績が無いもの … 4件。内訳は
--     2020年の3校（帯広農・磐城・平田）＝**大会が中止**で試合をしていない
--     2013年の土佐＝**私立**なので学校マスタに無い。Wikipedia の第85回大会記事で
--       1回戦 浦和学院 4-0 土佐（初戦敗退）と確認した
-- **つまり70件すべてを確かめた上で「2校だけ」と書いている。**
-- ★21世紀枠が1件増えるたびにこの数字は確かめ直すこと。
--
-- ------------------------------------------------------------
-- 出典
-- ------------------------------------------------------------
-- 勝ち上がりは data/wikipedia-cache/spring-073.json / spring-081.json の
-- wikitext を直接読んだ（**要約モデルに通していない**。太字が勝者、x がサヨナラ）。
-- 1試合ずつのスコアは src/lib/content/tournament-runs.ts にある。
-- ★検算：どちらも school_championships と一致（3勝1敗・ベスト4）。
--
-- **イニングごとの得点は資料が無いので入れていない。**
-- 大会記事に Linescore があるのは決勝だけで、この2校の試合には無い。
--
-- ★利府2009には、大会記事に部員の不祥事の記述がある。**記事に書かない。**
-- 選手個人を主題にしないというサイトの方針に照らして、まして負の話は載せない。
--
-- highlight_rank は入れない（null）。トップの注目枠は3件しか出さないので、
-- 既存の甲子園4件を押しのけてしまう。
-- ============================================================

begin;

insert into public.phenomena
  (slug, title, year, season, level, prefecture_id, badge, summary, body,
   highlight_rank, status, published_at)
values
  ('rifu-2009-spring',
   '利府、初めての甲子園でベスト4',
   2009, 'spring', 'koshien',
   (select id from public.prefectures where slug = 'miyagi'), 'ベスト4',
   '春夏を通じて初めての甲子園で、宮城の県立校が3試合を勝ち上がった。21世紀枠でのベスト4は、宜野座（2001年）とこの利府だけ。',
   E'宮城県利府高校は、仙台市の北東にある利府町の県立高校です。1984年の開校で、1998年には日本で初めてスポーツ科学科を置きました。\n\n2009年の選抜に21世紀枠で選ばれ、春夏を通じて初めての甲子園に出場します。\n\n1回戦は掛川西に10対4。2回戦の習志野戦は2対1でサヨナラ勝ちを収め、準々決勝では早稲田実を5対4で振り切りました。\n\n準決勝の相手は花巻東。2対5で敗れて大会を終えます。花巻東はこの大会の準優勝校で、決勝では清峰に0対1で敗れています。\n\n利府はその後、2014年の夏にも甲子園に出場しました。21世紀枠でベスト4まで進んだのは、2001年からの70校のうち宜野座とこの利府の2校だけです。',
   null, 'published', now()),

  ('ginoza-2001-spring',
   '宜野座、新設の21世紀枠でベスト4',
   2001, 'spring', 'koshien',
   (select id from public.prefectures where slug = 'okinawa'), 'ベスト4',
   '21世紀枠が新設された最初の年、沖縄の県立校が初出場でベスト4まで勝ち上がった。21世紀枠でのベスト4は、この宜野座と利府（2009年）だけ。',
   E'沖縄県立宜野座高校は、国頭郡宜野座村にある県立高校です。1946年の創立で、部活動の加入率が県内でも高い学校として知られています。\n\n2001年の選抜は、21世紀枠が新設された最初の大会でした。宜野座は福島の安積とともにその第1号に選ばれ、初めて甲子園に出場します。\n\n初戦の2回戦は岐阜第一に7対2。3回戦では桐光学園を4対3で振り切り、準々決勝の浪速戦は延長11回を戦って4対2で勝ちました。\n\n準決勝の相手は仙台育英。1対7で敗れて大会を終えます。仙台育英はこの大会の準優勝校で、決勝では常総学院に6対7で敗れています。\n\n宜野座はこの年の夏も甲子園に出場して1勝を挙げ、2003年の選抜にも出ています。21世紀枠でベスト4まで進んだのは、2001年からの70校のうち宜野座と2009年の利府の2校だけです。',
   null, 'published', now())

on conflict (slug) do update set
  title   = excluded.title,
  summary = excluded.summary,
  body    = excluded.body,
  badge   = excluded.badge;


-- ------------------------------------------------------------
-- 記録 ⇄ 学校のひもづけ（対戦相手は入れない。第1弾・第2弾と同じ）
-- ------------------------------------------------------------
insert into public.phenomenon_schools (phenomenon_id, school_id, role)
select p.id, s.id, 'main'
from (values
  ('rifu-2009-spring',   'rifu'),
  ('ginoza-2001-spring', 'ginoza')
) as v (phenomenon_slug, school_slug)
join public.phenomena p on p.slug = v.phenomenon_slug
join public.schools    s on s.slug = v.school_slug
on conflict (phenomenon_id, school_id) do nothing;

commit;


-- 確認用。2行が返り、ひもづけ学校数がどちらも1なら成功。
select ph.slug,
       ph.year,
       ph.season,
       ph.badge,
       count(ps.school_id) as linked_schools
from public.phenomena ph
left join public.phenomenon_schools ps on ps.phenomenon_id = ph.id
where ph.slug in ('rifu-2009-spring', 'ginoza-2001-spring')
group by ph.slug, ph.year, ph.season, ph.badge
order by ph.year desc;
