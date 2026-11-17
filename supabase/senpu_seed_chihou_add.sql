-- ============================================================
-- 公立旋風（地方大会）の追加分（37件）
--
-- 神奈川・東京・大阪・愛知などの激戦区を中心にした、都道府県大会での公立校の記録。
-- **このファイルは scripts/build-senpu.mjs が作る生成物。直接編集しない。**
-- 正本は data/senpu/（骨組み）と data/senpu/text/（文章）。直すならそちらを直して作り直す。
--
-- 勝ち上がり（1回戦〜決勝のスコア）はDBではなくコードに持っている。
--   src/lib/data/senpu-runs.json（同じスクリプトが作る）
--
-- 何度流しても安全（slug で重ね書き）。本文まで上書きするので、
-- DB の管理画面で手直ししたぶんは次に流すと消える。
-- **タイトルに年・季節を入れていない**（一覧カードも詳細ページも年と季節を別に前置きするため）。
-- highlight_rank は入れない（null）。トップの注目枠を押しのけない。
--
-- Supabase の SQL Editor に貼って実行する。
-- ============================================================

begin;

insert into public.phenomena
  (slug, title, year, season, level, prefecture_id, badge, summary, body,
   highlight_rank, status, published_at)
values
  ('hyogo-yashiro-2026-summer',
   '社、兵庫大会で3度の優勝',
   2026, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'hyogo'), '優勝',
   '県立の社が、2022年、2023年、2026年に兵庫大会で優勝した。2023年と2026年の決勝は、どちらも明石商が相手で、点差は1点だった。',
   E'兵庫県立社高校は、加東市にある県立高校です。兵庫大会の歴代代表校の表（1975年以降）に、優勝3回の名前があります。\n\n優勝は2022年、2023年、2026年。2022年は神戸国際大付に6対3で勝って、夏の甲子園に初めて出場しました。2023年は明石商に5対4のサヨナラ勝ち、2026年も明石商に3対2で勝っています。\n\n甲子園では、2022年にベスト32、2023年に初戦敗退、2026年に初戦敗退でした。2004年の春の選抜では、ベスト4に入っています。\n\n出典：[全国高等学校野球選手権兵庫大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%85%B5%E5%BA%AB%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('tochiku-2026-summer',
   '東筑、福岡大会で5度の優勝',
   2026, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'fukuoka'), '優勝',
   '福岡県立の東筑は、1975年以降の福岡大会で5度優勝し、3度準優勝した。2026年の決勝は希望が丘に3対2で勝った。',
   E'福岡県立東筑高校は、福岡大会の歴代代表校の表（1975年以降）に、優勝5回、準優勝3回の名前がある県立校です。\n\n優勝は1978年、1987年、1996年、2017年、2026年。1978年は柳川に1対0、1987年も柳川に4対0で勝ちました。1996年は東福岡に2対1のサヨナラ勝ち、2026年は希望が丘に3対2でした。\n\n準優勝は1998年、2011年、2023年。2023年は九州国際大付に1対2の1点差で敗れています。\n\n甲子園では、1978年にベスト16、1987年に初戦敗退、1996年にベスト32、2017年に初戦敗退、2026年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権福岡大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E7%A6%8F%E5%B2%A1%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('miyoshi-2026-autumn',
   '三好、県大会でベスト4',
   2026, 'autumn', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), 'ベスト4',
   '県立の三好が、愛知県の秋季大会でベスト4に進んだ。3回戦で中京大中京に4対3、準々決勝で豊川に2対0で勝った。',
   E'愛知県立三好高校は、2026年の愛知県秋季大会でベスト4に進みました。49校が参加した、秋の東海大会につながる県大会です。\n\n2回戦は安城学園に4対2、3回戦は中京大中京に4対3の1点差で勝ちました。準々決勝は豊川に2対0の完封勝ちです。\n\n準決勝は享栄に0対2で敗れました。享栄は決勝で愛工大名電に0対4で敗れ、準優勝でした。\n\n1試合ずつのスコアは、このページの「愛知県秋季大会での勝ち上がり」にあります。試合の点数は愛知県高等学校野球連盟の記録です。',
   null, 'published', now()),

  ('chiba-funabashi-2025-summer',
   '市立船橋、千葉大会で7度の優勝',
   2025, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'chiba'), '優勝',
   '船橋市立船橋高校は、1975年以降の千葉大会で7度優勝し、2度準優勝した。木更津総合とは決勝で4度顔を合わせ、2007年と2022年に勝ち、2016年と2024年は1点差で敗れた。',
   E'船橋市立船橋高校（市立船橋）は、千葉大会の歴代代表校の表（1975年以降）に、優勝7回、準優勝2回の名前がある市立校です。\n\n優勝は1993年、1996年、1997年、1998年、2007年、2022年、2025年。1998年は記念大会で東西に分かれた、西千葉の優勝です。2025年の決勝は、八千代松陰に8対7のサヨナラ勝ちでした。\n\n木更津総合とは決勝で4度顔を合わせています。2007年は9対1、2022年は13対6で勝ち、2016年は2対3、2024年は1対2と、どちらも1点差で敗れました。\n\n甲子園では、1993年にベスト4、1996年にベスト32、1997年にベスト8、1998年に初戦敗退、2007年に初戦敗退、2022年にベスト32、2025年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権千葉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%8D%83%E8%91%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('yokohamashogyo-2023-summer',
   '横浜商業、神奈川大会でベスト4',
   2023, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), 'ベスト4',
   '横浜市立の横浜商業が、記念大会となった神奈川大会でベスト4に進んだ。5勝のうち3勝は公立校が相手で、準々決勝は日大藤沢に3対2だった。',
   E'横浜市立横浜商業高校は、2023年の神奈川大会でベスト4に進みました。第105回の記念大会で、167校が参加しています。\n\n2回戦は同じ公立の大和に9対3、3回戦は相模原中等に12対2で勝ちました。4回戦は公立の厚木北に8対1、5回戦は公立の舞岡に9対0。準々決勝は日大藤沢と戦い、3対2の1点差で制しました。\n\n準決勝は横浜に2対12で敗れました。横浜は決勝で慶應義塾に5対6で敗れ、準優勝でした。慶應義塾はこの夏の甲子園で優勝しています。\n\n1試合ずつのスコアは、このページの「神奈川大会での勝ち上がり」にあります。試合の点数は神奈川高校野球ステーションの記録です。\n\n出典：[全国高等学校野球選手権神奈川大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E7%A5%9E%E5%A5%88%E5%B7%9D%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('fujisawaseiryu-2022-spring',
   '藤沢清流、県大会でベスト4',
   2022, 'spring', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), 'ベスト4',
   '県立の藤沢清流が、神奈川県の春季大会でベスト4に進んだ。準々決勝は立花学園に4対3。準決勝は桐蔭学園に2対10で敗れた。',
   E'神奈川県立藤沢清流高校は、2022年の神奈川県春季大会でベスト4に進みました。\n\n準々決勝は立花学園と戦い、4対3の1点差で勝ちました。準決勝は桐蔭学園に2対10で敗れています。桐蔭学園は決勝で桐光学園に2対6で敗れ、準優勝でした。\n\n準決勝に残った4校のうち、公立は藤沢清流と[横浜商業](/phenomenon/yokohamashogyo-2022-spring)の2校でした。この大会は記録の一部が欠けているため、このページには準々決勝以降の2試合だけを載せています。試合の点数は神奈川高校野球ステーションの記録です。',
   null, 'published', now()),

  ('yokohamashogyo-2022-spring',
   '横浜商業、県大会の準々決勝を2対1で勝ってベスト4',
   2022, 'spring', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), 'ベスト4',
   '横浜市立の横浜商業が、神奈川県の春季大会でベスト4に進んだ。準々決勝は藤沢翔陵に2対1。準決勝は桐光学園に0対11で敗れた。',
   E'横浜市立横浜商業高校は、2022年の神奈川県春季大会でベスト4に進みました。\n\n準々決勝は藤沢翔陵と戦い、2対1の1点差で勝ちました。準決勝は桐光学園に0対11で敗れています。桐光学園は決勝で桐蔭学園を6対2で破り、優勝しました。\n\n準決勝に残った4校のうち、公立は横浜商業と[藤沢清流](/phenomenon/fujisawaseiryu-2022-spring)の2校でした。この大会は記録の一部が欠けているため、このページには準々決勝以降の2試合だけを載せています。試合の点数は神奈川高校野球ステーションの記録です。',
   null, 'published', now()),

  ('obu-2021-summer',
   '大府、愛知大会でベスト4',
   2021, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), 'ベスト4',
   '県立の大府が、愛知大会で6勝してベスト4に進んだ。5回戦と準々決勝はどちらも1点差で、準決勝は享栄に4対7で敗れた。',
   E'愛知県立大府高校は、2021年の愛知大会でベスト4に進みました。179校が参加した大会です。\n\n1回戦は公立の豊明に11対1、2回戦は公立の南陽に10対2、3回戦は岡崎学園に8対1で勝ちました。4回戦は公立の福江に5対0。5回戦は愛産大工業に6対5、準々決勝は日本福祉大付に8対7と、2試合続けて1点差で勝ちます。\n\n準決勝は享栄に4対7で敗れました。享栄は決勝で愛工大名電に5対8で敗れ、準優勝でした。\n\n大府は2008年の愛知大会で優勝しています（[大府、愛知大会で2度の優勝](/phenomenon/obu-2008-summer)）。\n\n1試合ずつのスコアは、このページの「愛知大会での勝ち上がり」にあります。試合の点数は愛知県高等学校野球連盟の記録です。\n\n出典：[全国高等学校野球選手権愛知大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%84%9B%E7%9F%A5%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('narashino-2019-summer',
   '習志野、千葉大会で6度の優勝',
   2019, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'chiba'), '優勝',
   '習志野市立の習志野は、1975年以降の千葉大会で6度優勝し、7度準優勝した。2019年は春の選抜で準優勝し、夏の千葉大会でも優勝した。',
   E'習志野市立習志野高校は、千葉大会の歴代代表校の表（1975年以降）に、優勝6回、準優勝7回の名前がある市立校です。\n\n優勝は1975年、1980年、1987年、2001年、2011年、2019年。2011年の決勝は東京学館浦安に14対2、2019年は八千代松陰に8対1で勝ちました。\n\n準優勝の7回のうち、習志野は2013年に5対6、2017年に3対4、2023年に7対8と、3回を1点差で敗れています。\n\n甲子園では、1975年に優勝、1980年にベスト32、1987年にベスト8、2001年にベスト16、2011年にベスト8、2019年にベスト32に入りました。2019年は春の選抜でも準優勝しています。\n\n出典：[全国高等学校野球選手権千葉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%8D%83%E8%91%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kariya-2018-summer',
   '刈谷、東愛知大会でベスト4',
   2018, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), 'ベスト4',
   '県立の刈谷が、記念大会で東西に分かれた東愛知大会でベスト4に進んだ。準々決勝は同じ公立の半田に5対1、準決勝は愛産大三河に2対5だった。',
   E'愛知県立刈谷高校は、2018年の東愛知大会でベスト4に進みました。第100回の記念大会で、愛知は東愛知と西愛知に分かれて行われ、東愛知には85校が参加しています。\n\n2回戦は公立の東浦に10対3、3回戦は公立の三好に7対1で勝ちました。4回戦は刈谷工に3対2。準々決勝は公立の半田に5対1で勝ち、ベスト4に進みます。\n\n準決勝は愛産大三河に2対5で敗れました。愛産大三河は決勝で西尾東に3対1で勝ち、東愛知の代表になっています。決勝に進んだ[西尾東](/phenomenon/nishiohigashi-2018-summer)も公立校でした。\n\n1試合ずつのスコアは、このページの「東愛知大会での勝ち上がり」にあります。試合の点数は愛知県高等学校野球連盟の記録です。\n\n出典：[全国高等学校野球選手権愛知大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%84%9B%E7%9F%A5%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('nishiohigashi-2018-summer',
   '西尾東、東愛知大会で準優勝',
   2018, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), '準優勝',
   '県立の西尾東が、記念大会で東西に分かれた東愛知大会の決勝に進んだ。決勝は愛産大三河に1対3で敗れた。',
   E'愛知県立西尾東高校は、2018年の東愛知大会で準優勝しました。第100回の記念大会で、愛知は東愛知と西愛知に分かれて行われ、東愛知には85校が参加しています。\n\n2回戦は新城に17対1、3回戦は公立の豊橋東に8対7、4回戦は公立の西尾に12対5で勝ちました。準々決勝は豊橋中央に7対3、準決勝は豊川に10対3で勝ち、決勝に進みます。\n\n決勝の相手は愛産大三河。1対3で敗れ、準優勝で大会を終えました。愛産大三河は東愛知の代表として、この夏の甲子園に出場しています。同じ東愛知の準決勝には、公立の[刈谷](/phenomenon/kariya-2018-summer)も残っていました。\n\n1試合ずつのスコアは、このページの「東愛知大会での勝ち上がり」にあります。試合の点数は愛知県高等学校野球連盟の記録です。\n\n出典：[全国高等学校野球選手権愛知大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%84%9B%E7%9F%A5%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('atsugikita-2018-autumn',
   '厚木北、県大会でベスト4',
   2018, 'autumn', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), 'ベスト4',
   '県立の厚木北が、神奈川県の秋季大会でベスト4に進んだ。2回戦から4回戦までの3試合は、いずれも公立校に勝った。',
   E'神奈川県立厚木北高校は、2018年の神奈川県秋季大会でベスト4に進みました。\n\n2回戦は公立の大師に3対1、3回戦は公立の白山に6対4、4回戦は公立の伊志田に5対4で勝ちました。2回戦から4回戦まで、3試合の相手がすべて公立校です。準々決勝は湘南工大付に5対4の1点差で勝ちました。\n\n準決勝は桐蔭学園に2対10で敗れました。桐蔭学園は決勝で横浜に2対11で敗れ、準優勝でした。\n\n1試合ずつのスコアは、このページの「神奈川県秋季大会での勝ち上がり」にあります。試合の点数は神奈川高校野球ステーションの記録です。',
   null, 'published', now()),

  ('nishiohigashi-2018-autumn',
   '西尾東、県大会でベスト4',
   2018, 'autumn', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), 'ベスト4',
   '県立の西尾東が、愛知県の秋季大会でベスト4に進んだ。2回戦では、この夏の東愛知大会の決勝で敗れた愛産大三河に5対3で勝った。',
   E'愛知県立西尾東高校は、2018年の愛知県秋季大会でベスト4に進みました。この大会は、秋の東海大会につながる県大会です。\n\n2回戦は愛産大三河に5対3で勝ちました。愛産大三河は、この夏の東愛知大会の決勝で西尾東を3対1で破った学校です。3回戦は享栄に2対1、準々決勝は至学館に3対1で勝ちました。\n\n準決勝は東邦に3対14で敗れました。東邦は決勝で中京大中京に8対4で勝ち、優勝しています。\n\n1試合ずつのスコアは、このページの「愛知県秋季大会での勝ち上がり」にあります。試合の点数は愛知県高等学校野球連盟の記録です。',
   null, 'published', now()),

  ('okanmuri-2017-summer',
   '大冠、大阪桐蔭と8対10の決勝',
   2017, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'osaka'), '準優勝',
   '府立の大冠が、2017年の大阪大会で決勝に進んだ。相手は大阪桐蔭で、8対10と2点差まで迫った。176校が参加した大会だった。',
   E'大阪府立大冠高校は、2017年の大阪大会で準優勝しました。176校が参加した大会でした。\n\n決勝の相手は大阪桐蔭。大冠は8対10で敗れ、点差は2点でした。大阪桐蔭は、この年の夏の甲子園に出場しています。\n\n出典：[全国高等学校野球選手権大阪大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E9%98%AA%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('hyogo-amagasaki-2016-summer',
   '市尼崎、兵庫大会で2度の優勝',
   2016, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'hyogo'), '優勝',
   '尼崎市立の市尼崎は、1975年以降の兵庫大会で2度優勝し、4度準優勝した。1977年の決勝で敗れた東洋大姫路は、その夏に甲子園で優勝している。',
   E'尼崎市立尼崎高校（市尼崎）は、兵庫大会の歴代代表校の表（1975年以降）に、優勝2回、準優勝4回の名前がある市立校です。\n\n優勝は1983年と2016年。1983年は洲本に8対0で勝ち、2016年は明石商に3対2で勝ちました。準優勝は1977年、1979年、2004年、2018年です。1977年は東洋大姫路に0対3で敗れ、東洋大姫路はその夏の甲子園で優勝しました。1979年は明石南に0対1の1点差で敗れています。\n\n甲子園では、1983年にベスト16、2016年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権兵庫大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%85%B5%E5%BA%AB%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('nishiwakikogyo-2013-summer',
   '西脇工、サヨナラで初の甲子園',
   2013, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'hyogo'), '優勝',
   '県立の西脇工が、2013年の兵庫大会決勝で東洋大姫路に3対2のサヨナラ勝ち。夏の甲子園に初めて出場し、ベスト32に進んだ。',
   E'兵庫県立西脇工業高校は、2013年の兵庫大会で優勝しました。\n\n決勝の相手は東洋大姫路。3対2のサヨナラ勝ちでした。この夏が、西脇工にとって夏の甲子園初出場です。\n\n甲子園では、2013年にベスト32に入りました。\n\n出典：[全国高等学校野球選手権兵庫大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%85%B5%E5%BA%AB%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('obu-2008-summer',
   '大府、愛知大会で2度の優勝',
   2008, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), '優勝',
   '県立の大府は、1975年以降の愛知大会で2度優勝した（1980年・2008年）。2008年の東愛知の決勝は、大府と成章という県立どうしだった。',
   E'愛知県立大府高校は、愛知大会の歴代代表校の表（1975年以降）に、優勝2回、準優勝1回の名前がある県立校です。\n\n優勝は1980年と2008年。1980年は享栄に3対0で勝ちました。2008年は記念大会で東西に分かれた東愛知の決勝で、同じ県立の成章に3対1で勝っています。準優勝の1998年は、東愛知の決勝で豊田大谷に0対5で敗れました。\n\n甲子園では、1980年にベスト32、2008年に初戦敗退でした。2021年の愛知大会では、ベスト4に入っています。\n\n出典：[全国高等学校野球選手権愛知大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%84%9B%E7%9F%A5%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('choshishogyo-2005-summer',
   '銚子商、千葉大会で4度の優勝',
   2005, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'chiba'), '優勝',
   '県立の銚子商は、1975年以降の千葉大会で4度優勝し、3度準優勝した。1995年と2005年の決勝は、どちらも拓大紅陵が相手だった。',
   E'千葉県立銚子商業高校は、千葉大会の歴代代表校の表（1975年以降）に、優勝4回、準優勝3回の名前がある県立の古豪です。\n\n優勝は1976年、1985年、1995年、2005年。1985年から10年おきに優勝が続きました。1995年は拓大紅陵に4対3、2005年も拓大紅陵に5対3で勝っています。\n\n準優勝は1978年、1981年、1991年です。1978年と1991年は、どちらも決勝で我孫子に敗れました。\n\n甲子園では、1974年に優勝、1976年にベスト8、1985年に初戦敗退、1995年にベスト16、2005年にベスト16でした。\n\n出典：[全国高等学校野球選手権千葉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%8D%83%E8%91%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('himejikogyo-2005-summer',
   '姫路工、兵庫大会で2度の優勝',
   2005, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'hyogo'), '優勝',
   '県立の姫路工は、1975年以降の兵庫大会で2度優勝し、4度準優勝した。1993年の決勝は育英に0対1で敗れ、育英はその夏の甲子園で優勝した。',
   E'兵庫県立姫路工業高校は、兵庫大会の歴代代表校の表（1975年以降）に、優勝2回、準優勝4回の名前がある県立校です。\n\n優勝は1994年と2005年。1994年は飾磨に2対0、2005年は神戸国際大付に3対2で勝ちました。準優勝は1993年、1998年、2001年、2018年です。1993年は育英に0対1の1点差で敗れ、育英はその夏の甲子園で優勝しています。1998年と2001年は、どちらも東洋大姫路に敗れました。\n\n甲子園では、1994年に初戦敗退、2005年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権兵庫大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%85%B5%E5%BA%AB%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kanagawakogyo-2004-summer',
   '神奈川工、神奈川大会の決勝に2度進む',
   2004, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), '準優勝',
   '県立の神奈川工は、1975年以降の神奈川大会で決勝に2度進んだ。1990年は横浜商に1対3で敗れ、2004年は横浜に敗れて、どちらも準優勝だった。',
   E'神奈川県立神奈川工業高校は、神奈川大会の歴代代表校の表（1975年以降）に、準優勝2回の名前がある県立校です。\n\n準優勝は1990年と2004年。1990年は201校が参加した大会で、同じ公立の横浜商に1対3で敗れました。横浜商はその夏の甲子園で、ベスト8に入っています。2004年は195校が参加し、決勝で横浜に敗れました。\n\n出典：[全国高等学校野球選手権神奈川大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E7%A5%9E%E5%A5%88%E5%B7%9D%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('yukigaya-2003-summer',
   '雪谷、東東京大会で優勝と準優勝',
   2003, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'higashi-tokyo'), '優勝',
   '都立の雪谷が、2003年の東東京大会で二松学舎大付を5対0で破って優勝した。2009年にも決勝に進んでいる。',
   E'東京都立雪谷高校は、東東京大会の歴代代表校の表（1975年以降）に、優勝1回、準優勝1回の名前がある都立校です。\n\n優勝は2003年。138校が参加した大会で、決勝は二松学舎大付に5対0で勝ちました。この夏が雪谷の甲子園初出場です。準優勝は2009年で、145校が参加した大会の決勝で帝京に敗れました。\n\n甲子園では、2003年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権東東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%9D%B1%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('joto-2001-summer',
   '城東、東東京大会で2度の優勝',
   2001, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'higashi-tokyo'), '優勝',
   '都立の城東が、1999年と2001年に東東京大会で優勝した。決勝は1999年が駒大高に3対0、2001年が岩倉に5対4だった。',
   E'東京都立城東高校は、東東京大会の歴代代表校の表（1975年以降）に、優勝2回の名前がある都立校です。優勝は1999年と2001年でした。\n\n1999年は134校が参加した大会で、決勝は駒大高に3対0。この夏が城東の甲子園初出場です。2001年は140校が参加し、岩倉に5対4で勝って2年ぶりの出場を決めました。\n\n甲子園では、1999年に初戦敗退、2001年に初戦敗退でした。2022年の東東京大会では、ベスト4に入っています。\n\n出典：[全国高等学校野球選手権東東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%9D%B1%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('toyotanishi-2001-summer',
   '豊田西、愛知大会の決勝に4度進む',
   2001, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'aichi'), '準優勝',
   '県立の豊田西は、1975年以降の愛知大会で決勝に4度進んだ。1989年、1993年、2000年、2001年の4回とも、準優勝だった。',
   E'愛知県立豊田西高校は、愛知大会の歴代代表校の表（1975年以降）に、準優勝4回の名前がある県立校です。\n\n準優勝は1989年、1993年、2000年、2001年。1989年は東邦に0対8、1993年は享栄に0対3、2000年は中京大中京に3対11で敗れました。2001年は185校が参加した大会で、初出場の弥富に7対9でした。\n\n出典：[全国高等学校野球選手権愛知大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E6%84%9B%E7%9F%A5%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('hakuryo-1999-summer',
   '柏陵、サヨナラ勝ちで初優勝',
   1999, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'chiba'), '優勝',
   '県立の柏陵が、1999年の千葉大会で市銚子を1対0のサヨナラで破って初優勝した。初めての甲子園では、ベスト8まで進んだ。',
   E'千葉県立柏陵高校は、1999年の千葉大会で初優勝しました。この年は172校が参加しています。\n\n決勝の相手は市銚子。1対0のサヨナラ勝ちでした。この夏が、柏陵にとって甲子園初出場です。\n\n甲子園では、1999年にベスト8に入りました。\n\n出典：[全国高等学校野球選手権千葉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%8D%83%E8%91%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('abiko-1991-summer',
   '我孫子、千葉大会の決勝で2度、銚子商に勝つ',
   1991, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'chiba'), '優勝',
   '県立の我孫子は、千葉大会で1978年と1991年に優勝した。決勝の相手はどちらも銚子商で、点数は4対0と2対0だった。',
   E'千葉県立我孫子高校は、千葉大会の歴代代表校の表（1975年以降）に、優勝2回の名前があります。優勝は1978年と1991年で、決勝の相手はどちらも銚子商でした。\n\n1978年は4対0、1991年は2対0。どちらも相手を無得点に抑えた完封勝ちです。この2回は、銚子商にとっては決勝で敗れた準優勝の年にあたります。\n\n甲子園では、1978年に初戦敗退、1991年にベスト16でした。1978年が初出場、1991年が13年ぶり2回目の出場です。\n\n出典：[全国高等学校野球選手権千葉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%8D%83%E8%91%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('omiyahigashi-1990-summer',
   '大宮東、埼玉大会の決勝に5度進む',
   1990, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'saitama'), '優勝',
   '県立の大宮東は、1975年以降の埼玉大会で決勝に5度進み、優勝は1990年の1回。浦和学院とは決勝で3度対戦した。',
   E'埼玉県立大宮東高校は、埼玉大会の歴代代表校の表（1975年以降）に、優勝1回、準優勝4回の名前がある県立校です。決勝には5度進みました。\n\n優勝は1990年で、決勝は浦和学院に12対2。この夏が甲子園初出場でした。準優勝は1983年、1987年、1995年、1996年です。1983年は所沢商に5対8、1995年は越谷西に0対1の1点差で敗れました。浦和学院とは1987年、1990年、1996年の3度、決勝で顔を合わせています。\n\n甲子園では、1990年に初戦敗退でした。1993年春の選抜では準優勝しています。\n\n出典：[全国高等学校野球選手権埼玉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%9F%BC%E7%8E%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('shibutani-1990-summer',
   '渋谷、上宮を破って初の甲子園',
   1990, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'osaka'), '優勝',
   '府立の渋谷が、1990年の大阪大会で上宮に6対4で勝って優勝し、甲子園に初めて出場した。181校が参加した大会だった。',
   E'大阪府立渋谷高校は、1990年の大阪大会で優勝しました。181校が参加した大会でした。\n\n決勝の相手は上宮。6対4で勝ち、この夏が渋谷の甲子園初出場でした。\n\n甲子園では、1990年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権大阪大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E9%98%AA%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('yokohamashogyo-1990-summer',
   '横浜商、神奈川大会で5度の優勝',
   1990, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'kanagawa'), '優勝',
   '横浜市立の横浜商は、1975年以降の神奈川大会で5度優勝し、3度準優勝した。優勝のうち3度は、決勝で横浜を破ってのものだった。',
   E'横浜市立横浜商業高校は、神奈川大会の歴代代表校の表（1975年以降）に、優勝5回、準優勝3回の名前がある市立校です。\n\n優勝は1979年、1983年、1986年、1987年、1990年。このうち1979年と1983年は横浜に3対1、1986年は横浜に11対7で勝ちました。1987年は東海大相模に4対2、1990年は神奈川工に3対1でした。\n\n準優勝は1977年、1978年、1997年です。1978年は横浜に3対5で敗れていて、横浜とは決勝で4度顔を合わせたことになります。\n\n甲子園では、1979年にベスト4、1983年に準優勝、1986年に初戦敗退、1987年にベスト16、1990年にベスト8でした。\n\n出典：[全国高等学校野球選手権神奈川大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E7%A5%9E%E5%A5%88%E5%B7%9D%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('sakuranomiya-1988-summer',
   '桜宮、大阪大会の決勝に2度進む',
   1988, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'osaka'), '準優勝',
   '桜宮は、1975年以降の大阪大会で決勝に2度進んだ。1983年はPL学園に3対5で敗れ、PL学園はその夏の甲子園で優勝している。',
   E'桜宮高校は、大阪大会の歴代代表校の表（1975年以降）に、準優勝2回の名前がある公立校です。\n\n準優勝は1983年と1988年。1983年は155校が参加した大会で、PL学園に3対5で敗れました。PL学園はこの夏、甲子園で優勝しています。1988年は175校が参加し、近大付に0対2で敗れています。\n\n出典：[全国高等学校野球選手権大阪大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E9%98%AA%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('higashiyamato-1985-summer',
   '東大和、西東京の決勝に2度進む',
   1985, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'nishi-tokyo'), '準優勝',
   '都立の東大和は、西東京大会の決勝に1978年と1985年の2度進んだ。1978年は日大二に10対15、1985年は日大三に2対5で敗れた。',
   E'東京都立東大和高校は、西東京大会の歴代代表校の表（1975年以降）に、準優勝2回の名前がある都立校です。\n\n準優勝は1978年と1985年。1978年は98校が参加した大会で、日大二に10対15で敗れました。1985年は126校が参加し、日大三に2対5で敗れています。\n\n西東京から甲子園に出た都立校は、1980年の国立だけです。\n\n出典：[全国高等学校野球選手権西東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E8%A5%BF%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kurumeshogyo-1985-summer',
   '久留米商、福岡大会で2度の優勝',
   1985, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'fukuoka'), '優勝',
   '久留米市立の久留米商は、福岡大会で1983年と1985年に優勝した。甲子園では1962年に準優勝し、1983年にもベスト4に入っている。',
   E'久留米市立久留米商業高校は、福岡大会の歴代代表校の表（1975年以降）に、優勝2回の名前がある市立校です。優勝は1983年と1985年でした。\n\n1983年の決勝は福岡に8対2、1985年は福岡第一に6対3で勝っています。\n\n甲子園では、1962年に準優勝、1983年にベスト4、1985年にベスト16でした。\n\n出典：[全国高等学校野球選手権福岡大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E7%A6%8F%E5%B2%A1%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('ageo-1984-summer',
   '上尾、埼玉大会の決勝に7度進む',
   1984, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'saitama'), '優勝',
   '県立の上尾は、1975年以降の埼玉大会で決勝に7度進み、3度優勝した。1976年と1981年は、ともに優勝した所沢商と熊谷商に敗れた。',
   E'埼玉県立上尾高校は、埼玉大会の歴代代表校の表（1975年以降）に、優勝3回、準優勝4回の名前がある県立校です。決勝には7度進みました。\n\n優勝は1975年、1979年、1984年。1975年は川口工に5対1、1979年は川越工に1対0、1984年は松山に8対2で勝ちました。\n\n準優勝は1976年、1981年、2008年、2018年です。1976年は所沢商に1対4、1981年は熊谷商に4対5で敗れました。2008年と2018年は、記念大会で北と南に分かれた北埼玉の決勝でした。2018年は花咲徳栄に1対4で敗れています。\n\n甲子園では、1975年にベスト4、1979年に初戦敗退、1984年にベスト32でした。\n\n出典：[全国高等学校野球選手権埼玉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%9F%BC%E7%8E%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('tokorozawashogyo-1983-summer',
   '所沢商、埼玉大会で3度の優勝',
   1983, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'saitama'), '優勝',
   '県立の所沢商は、1976年、1978年、1983年に埼玉大会で優勝した。1976年は決勝で上尾に勝ち、甲子園初出場を決めた。',
   E'埼玉県立所沢商業高校は、埼玉大会の歴代代表校の表（1975年以降）に、優勝3回、準優勝1回の名前がある県立校です。\n\n優勝は1976年、1978年、1983年。1976年は上尾に4対1で勝って甲子園初出場を決め、1978年は立教に4対2、1983年は大宮東に8対5でした。準優勝の2004年は、浦和学院に2対6で敗れています。\n\n甲子園では、1976年に初戦敗退、1978年にベスト32、1983年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権埼玉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%9F%BC%E7%8E%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kasugaoka-1982-summer',
   '春日丘、近大付との2度の決勝',
   1982, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'osaka'), '優勝',
   '府立の春日丘は、大阪大会の決勝に1982年と1992年の2度進んだ。相手はどちらも近大付で、1982年は9対1で勝って優勝した。',
   E'大阪府立春日丘高校は、大阪大会の歴代代表校の表（1975年以降）に、優勝1回、準優勝1回の名前がある府立校です。決勝は2度とも、近大付が相手でした。\n\n1982年は152校が参加した大会で、近大付に9対1で勝って優勝し、夏の甲子園に初めて出場しました。1992年は近大付に4対6で敗れ、準優勝でした。\n\n甲子園では、1982年にベスト32でした。\n\n出典：[全国高等学校野球選手権大阪大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E9%98%AA%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kumagayashogyo-1981-summer',
   '熊谷商、サヨナラで埼玉大会を連覇',
   1981, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'saitama'), '優勝',
   '県立の熊谷商が、1980年と1981年の埼玉大会を連覇した。1981年の決勝は上尾に5対4のサヨナラ勝ちだった。',
   E'埼玉県立熊谷商業高校は、埼玉大会の歴代代表校の表（1975年以降）に、優勝2回、準優勝1回の名前がある県立校です。優勝は1980年と1981年の連覇でした。\n\n1980年の決勝は川口工に7対2。1981年は上尾に5対4のサヨナラ勝ちでした。準優勝の1977年は、川口工に1対2で敗れています。\n\n甲子園では、1980年に初戦敗退、1981年にベスト16でした。\n\n出典：[全国高等学校野球選手権埼玉大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%9F%BC%E7%8E%89%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('kunitachi-1980-summer',
   '国立、西東京大会で都立校が初の優勝',
   1980, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'nishi-tokyo'), '優勝',
   '都立の国立（くにたち）が、1980年の西東京大会で駒大高に2対0で勝って優勝した。表の注記では、旧東京大会・東東京大会を含めても都立勢で初めての代表とされている。',
   E'東京都立国立（くにたち）高校は、1980年の西東京大会で優勝しました。106校が参加した大会でした。校名は国立（こくりつ）ではなく、東京都立の高校です。\n\n決勝の相手は駒大高で、2対0の完封勝ち。この夏が国立の甲子園初出場でした。Wikipedia の表の注記は、旧東京大会・東東京大会を含めても、都立校として初めての代表だと書いています。西東京大会で代表になった都立校は、いまも国立だけとされています。\n\n甲子園では、1980年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権西東京大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E8%A5%BF%E6%9D%B1%E4%BA%AC%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now()),

  ('sumoto-1975-summer',
   '洲本、兵庫大会の決勝に4度進む',
   1975, 'summer', 'prefectural',
   (select id from public.prefectures where slug = 'hyogo'), '優勝',
   '県立の洲本は、1975年以降の兵庫大会で決勝に4度進み、優勝は1975年の1回。1978年は報徳学園に2対3の1点差で敗れた。',
   E'兵庫県立洲本高校は、洲本市にある県立高校です。兵庫大会の歴代代表校の表（1975年以降）に、優勝1回、準優勝3回の名前があります。\n\n優勝は1975年で、津名に3対1で勝ち、甲子園初出場を決めました。準優勝は1978年、1983年、2008年です。1978年は報徳学園に2対3の1点差で敗れました。1983年は市尼崎に0対8、2008年は加古川北に2対5で、2008年は記念大会で東西に分かれた西兵庫の決勝でした。\n\n甲子園では、1975年に初戦敗退でした。\n\n出典：[全国高等学校野球選手権兵庫大会 - Wikipedia](https://ja.wikipedia.org/wiki/%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%85%B5%E5%BA%AB%E5%A4%A7%E4%BC%9A)（歴代代表校の一覧）',
   null, 'published', now())
on conflict (slug) do update set
  title   = excluded.title,
  summary = excluded.summary,
  body    = excluded.body,
  badge   = excluded.badge;

-- ------------------------------------------------------------
-- 記録 ⇄ 学校のひもづけ（role = 'main' だけ）
--
-- 対戦相手（role='opponent'）は入れない。私学を「破られた相手」として
-- 一覧に並べるのは、このサイトの立ち位置として避けたいため。
-- 学校が未登録なら何も入らない（エラーにはしない）。
-- ------------------------------------------------------------
insert into public.phenomenon_schools (phenomenon_id, school_id, role)
select p.id, s.id, 'main'
from (values
  ('hyogo-yashiro-2026-summer', 'hyogo-yashiro'),
  ('tochiku-2026-summer', 'tochiku'),
  ('miyoshi-2026-autumn', 'miyoshi'),
  ('chiba-funabashi-2025-summer', 'chiba-funabashi'),
  ('yokohamashogyo-2023-summer', 'yokohamashogyo'),
  ('fujisawaseiryu-2022-spring', 'fujisawaseiryu'),
  ('yokohamashogyo-2022-spring', 'yokohamashogyo'),
  ('obu-2021-summer', 'obu'),
  ('narashino-2019-summer', 'narashino'),
  ('kariya-2018-summer', 'kariya'),
  ('nishiohigashi-2018-summer', 'nishiohigashi'),
  ('atsugikita-2018-autumn', 'atsugikita'),
  ('nishiohigashi-2018-autumn', 'nishiohigashi'),
  ('okanmuri-2017-summer', 'okanmuri'),
  ('hyogo-amagasaki-2016-summer', 'hyogo-amagasaki'),
  ('nishiwakikogyo-2013-summer', 'nishiwakikogyo'),
  ('obu-2008-summer', 'obu'),
  ('obu-2008-summer', 'aichi-seisho'),
  ('choshishogyo-2005-summer', 'choshishogyo'),
  ('himejikogyo-2005-summer', 'himejikogyo'),
  ('kanagawakogyo-2004-summer', 'kanagawakogyo'),
  ('yukigaya-2003-summer', 'yukigaya'),
  ('joto-2001-summer', 'joto'),
  ('toyotanishi-2001-summer', 'toyotanishi'),
  ('hakuryo-1999-summer', 'hakuryo'),
  ('abiko-1991-summer', 'abiko'),
  ('omiyahigashi-1990-summer', 'omiyahigashi'),
  ('shibutani-1990-summer', 'shibutani'),
  ('yokohamashogyo-1990-summer', 'yokohamashogyo'),
  ('sakuranomiya-1988-summer', 'sakuranomiya'),
  ('higashiyamato-1985-summer', 'higashiyamato'),
  ('kurumeshogyo-1985-summer', 'kurumeshogyo'),
  ('ageo-1984-summer', 'ageo'),
  ('tokorozawashogyo-1983-summer', 'tokorozawashogyo'),
  ('kasugaoka-1982-summer', 'kasugaoka'),
  ('kumagayashogyo-1981-summer', 'kumagayashogyo'),
  ('kunitachi-1980-summer', 'kunitachi'),
  ('sumoto-1975-summer', 'sumoto')
) as v (phenomenon_slug, school_slug)
join public.phenomena p on p.slug = v.phenomenon_slug
join public.schools    s on s.slug = v.school_slug
on conflict (phenomenon_id, school_id) do nothing;

commit;


-- 確認用。37行が返り、ひもづけ学校数がどれも1以上なら成功。
select ph.slug,
       ph.year,
       ph.badge,
       count(ps.school_id) as linked_schools
from public.phenomena ph
left join public.phenomenon_schools ps on ps.phenomenon_id = ph.id
where ph.slug in ('hyogo-yashiro-2026-summer', 'tochiku-2026-summer', 'miyoshi-2026-autumn', 'chiba-funabashi-2025-summer', 'yokohamashogyo-2023-summer', 'fujisawaseiryu-2022-spring', 'yokohamashogyo-2022-spring', 'obu-2021-summer', 'narashino-2019-summer', 'kariya-2018-summer', 'nishiohigashi-2018-summer', 'atsugikita-2018-autumn', 'nishiohigashi-2018-autumn', 'okanmuri-2017-summer', 'hyogo-amagasaki-2016-summer', 'nishiwakikogyo-2013-summer', 'obu-2008-summer', 'choshishogyo-2005-summer', 'himejikogyo-2005-summer', 'kanagawakogyo-2004-summer', 'yukigaya-2003-summer', 'joto-2001-summer', 'toyotanishi-2001-summer', 'hakuryo-1999-summer', 'abiko-1991-summer', 'omiyahigashi-1990-summer', 'shibutani-1990-summer', 'yokohamashogyo-1990-summer', 'sakuranomiya-1988-summer', 'higashiyamato-1985-summer', 'kurumeshogyo-1985-summer', 'ageo-1984-summer', 'tokorozawashogyo-1983-summer', 'kasugaoka-1982-summer', 'kumagayashogyo-1981-summer', 'kunitachi-1980-summer', 'sumoto-1975-summer')
group by ph.slug, ph.year, ph.badge
order by ph.year desc, ph.slug;
