-- ============================================================
-- 公立旋風（phenomena）の実データ 第2弾・地方大会の4件
--
-- 第1弾（supabase/senpu_seed.sql）は甲子園での記録だけだった。
-- こちらは **甲子園に届かなかった記録**（level = 'prefectural'）。
-- 「強豪私学がひしめく地方大会や甲子園で公立が勝ち上がること」を
-- 記録に残すというサイトの立ち位置からすると、本来こちら側のほうが数が多い。
--
-- **senpu_seed.sql と同じく、何度流しても安全**（slug で重ね書きする）。
-- 先に流す順番の決まりは無い（第1弾と独立している）。
--
-- ------------------------------------------------------------
-- 出典（★スコアは一次資料で裏を取ってから書くこと。記憶で書かない）
-- ------------------------------------------------------------
-- 東京の2校（小山台・日野）
--   Wikipedia「全国高等学校野球選手権東東京大会」「同 西東京大会」の
--   歴代代表校の表（参加校数・決勝スコア・準優勝校）と、各校の記事。
--   wikitext を直接読んで確認した（要約モデルに通していない）。
--
--   ★**小山台の2件は勝ち上がりも入れた**（2026-08-21。運営者が出典を指定）。
--   出典は個人ブログ「わっぱ飯のイン斬り野球」の「温故知新」で、
--   小山台のOBが観戦した試合を1試合ずつ記録している。
--   6試合ぶんの回戦・対戦相手・スコアが src/lib/content/tournament-runs.ts にある。
--   ★検算：**決勝のスコアが Wikipedia の表と一致する**（2018=3対6／2019=0対4）。
--   ★**突き合わせられるのは決勝だけ。** 東京都高野連は「データ」の転載を
--   制限していて日別の結果が取れないので、3回戦〜準決勝は出典が1つしか無い。
--
--   ★**日野2013の勝ち上がりは無いまま。** 上のブログは小山台専門で、
--   西東京の試合は載っていない。
--
-- 県相模原（神奈川）
--   神奈川高校野球ステーション（個人運営・2002年〜）の2019年夏の日別ページ。
--   このリポジトリが地方大会の結果で使っているのと同じ出典で、
--   **出典表示は必ずサイト名で出す**（連盟の名前で出さない）。
--   7試合ぶんのスコアは src/lib/content/tournament-runs.ts に入れてある。
--   ★検算：準々決勝4・準決勝2・決勝1で数が合い、決勝の 東海大相模 24-1 日大藤沢 が
--   Wikipedia「全国高等学校野球選手権神奈川大会」の表と一致した（別の出典との突き合わせ）。
--
-- ------------------------------------------------------------
-- highlight_rank は入れない（null）。
-- トップの注目枠は3件しか出さないので、甲子園の4件を押しのけてしまう。
-- ============================================================

begin;

insert into public.phenomena
  (slug, title, year, season, level, prefecture_id, badge, summary, body,
   highlight_rank, status, published_at)
values
  ('sagamihara-2019-summer',
   '県立相模原、横浜を破って初のベスト4',
   2019, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), 'ベスト4',
   '181校が参加した神奈川大会で、県立の進学校が6試合を勝ち上がり、準々決勝で横浜を8対6で破って創部初のベスト4に進んだ。',
   E'神奈川県立相模原高校は、相模原市中央区にある県立高校です。近くに同じ名前の私立高校があるため、地元では「県相（けんそう）」と呼ばれています。\n\n181校が参加した2019年の神奈川大会で、県相模原は1回戦から順に勝ち上がりました。5回戦の横浜商業戦は延長11回のサヨナラ勝ち。ここまでで5勝です。\n\n準々決勝の相手は、第1シードの横浜でした。この試合を8対6で制し、創部初のベスト4に進みます。\n\n準決勝では東海大相模に2対11で敗れ、大会を終えました。優勝したのはその東海大相模で、決勝は日大藤沢に24対1という試合でした。\n\n1試合ずつのスコアはこのページの「神奈川大会での勝ち上がり」にまとめてあります。',
   null, 'published', now()),

  ('koyamadai-2019-summer',
   '小山台、2年続けて東東京の決勝へ',
   2019, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'higashi-tokyo'), '準優勝',
   '前年に続いて都立の小山台が東東京大会の決勝に進んだ。都立が2年続けて東東京の決勝に立ったのは、東西に分かれた1974年以降で初めて。',
   E'2019年の東東京大会には129校が参加しました。小山台は前の年に続いてシードで3回戦から登場し、5試合を勝ち上がって決勝に進みます。準々決勝は高島に5対1、準決勝は上野学園に4対1でした。\n\n決勝の相手は関東第一。0対4で敗れ、2年続けての準優勝となりました。関東第一はこの勝利で3年ぶり8回目の甲子園です。1試合ずつのスコアはこのページの「東東京大会での勝ち上がり」にあります。\n\n東西に分かれた1974年以降、東東京大会の決勝に立った都立は城東（1999年・2001年）、雪谷（2003年・2009年）、小山台（2018年・2019年）の3校です。2年続けて決勝に進んだのは小山台が初めてでした。\n\n小山台は野球部を「野球班」と呼び、スポーツ推薦を行っていません。\n\n出典：[全国高等学校野球選手権東東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%9D%B1%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）、[東京都立小山台高等学校 - Wikipedia](https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD%E7%AB%8B%E5%B0%8F%E5%B1%B1%E5%8F%B0%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1)',
   null, 'published', now()),

  ('koyamadai-2018-summer',
   '小山台、都立勢9年ぶりの東東京決勝',
   2018, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'higashi-tokyo'), '準優勝',
   '第100回の記念大会となった東東京大会で、132校のなかから都立の小山台が決勝に進んだ。都立の決勝進出は2009年の雪谷以来9年ぶり。',
   E'東京都立小山台高校は、品川区にある都立高校です。野球部は「野球班」と呼ばれ、スポーツ推薦を行っていません。2014年の選抜には21世紀枠で出場し、都立高校として初めて春の甲子園に立ちました（初戦は履正社に0対11）。\n\n第100回の記念大会となった2018年の東東京大会には132校が参加しました。小山台はシードで3回戦から登場し、準々決勝で安田学園に6対4、準決勝では帝京に7対2で勝って決勝に進みます。\n\n決勝の相手は二松学舎大付。3対6で敗れ、甲子園まであと1つのところで夏を終えました。1試合ずつのスコアはこのページの「東東京大会での勝ち上がり」にあります。\n\n都立が東東京大会の決勝に立ったのは、2009年の雪谷以来9年ぶりのことでした。\n\n出典：[全国高等学校野球選手権東東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%9D%B1%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）、[第86回選抜高等学校野球大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E7%AC%AC86%E5%9B%9E%E9%81%B8%E6%8A%9C%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E5%A4%A7%E4%BC%9A)（2014年の選抜）',
   null, 'published', now()),

  ('hino-2013-summer',
   '日野、28年ぶりに都立が西東京の決勝へ',
   2013, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'nishi-tokyo'), '準優勝',
   '131校が参加した西東京大会で、都立の日野が決勝に進んだ。都立の決勝進出は1985年の東大和以来28年ぶり。',
   E'東京都立日野高校は、日野市にある都立高校です。\n\n131校が参加した2013年の西東京大会で、日野は決勝に進みました。相手は日大三。0対5で敗れ、準優勝で大会を終えています。日大三はこの年、3年連続16回目の甲子園出場を決めました。\n\n西東京大会で都立が決勝に立ったのは、1985年の東大和以来28年ぶりでした。東西に分かれた1974年以降、西東京から甲子園に出た都立は1980年の国立（くにたち）だけです。\n\nその国立高校は名前こそ「国立」ですが、国立（こくりつ）ではなく東京都立の高校です。\n\n出典：[全国高等学校野球選手権西東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E8%A5%BF%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now())

on conflict (slug) do update set
  title   = excluded.title,
  summary = excluded.summary,
  body    = excluded.body,
  badge   = excluded.badge;


-- ------------------------------------------------------------
-- 記録 ⇄ 学校のひもづけ
--
-- 対戦相手（role='opponent'）は入れない。私学を「破られた相手」として
-- 一覧に並べるのは、このサイトの立ち位置として避けたい（第1弾と同じ）。
-- ------------------------------------------------------------
insert into public.phenomenon_schools (phenomenon_id, school_id, role)
select p.id, s.id, 'main'
from (values
  ('sagamihara-2019-summer', 'sagamihara'),
  ('koyamadai-2019-summer',  'koyamadai'),
  ('koyamadai-2018-summer',  'koyamadai'),
  ('hino-2013-summer',       'hino')
) as v (phenomenon_slug, school_slug)
join public.phenomena p on p.slug = v.phenomenon_slug
join public.schools    s on s.slug = v.school_slug
on conflict (phenomenon_id, school_id) do nothing;

commit;


-- 確認用。4行が返り、ひもづけ学校数がどれも1なら成功。
select ph.slug,
       ph.year,
       ph.level,
       ph.badge,
       count(ps.school_id) as linked_schools
from public.phenomena ph
left join public.phenomenon_schools ps on ps.phenomenon_id = ph.id
where ph.slug in ('sagamihara-2019-summer', 'koyamadai-2019-summer',
                  'koyamadai-2018-summer', 'hino-2013-summer')
group by ph.slug, ph.year, ph.level, ph.badge
order by ph.year desc, ph.slug;
