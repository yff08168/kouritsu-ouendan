-- ============================================================
-- 開発用シードデータ
--
-- ★ 学校名・戦績・ニュースはすべて架空 ★
-- 実在校に架空の甲子園出場歴や試合結果を紐づけると、実在の学校について
-- 事実でない記録を作ることになるため、開発用データでは実在校を使わない。
-- 都道府県だけは実在のものを使う（公的なマスタデータのため）。
--
-- 何度実行しても同じ状態になるよう、冒頭で既存データを消してから入れ直す。
-- 本番データが入ったあとは実行しないこと。
-- ============================================================

truncate table
  public.news_schools,
  public.phenomenon_schools,
  public.school_championships,
  public.school_records,
  public.news,
  public.phenomena,
  public.features,
  public.schools,
  public.news_sources,
  public.prefectures
restart identity cascade;


-- ------------------------------------------------------------
-- 都道府県（JISコード順）
-- ------------------------------------------------------------
insert into public.prefectures (id, name, full_name, name_kana, slug, region, sort_order) values
  ( 1, '北海道', '北海道',   'ほっかいどう', 'hokkaido',   '北海道',     1),
  ( 2, '青森',   '青森県',   'あおもり',     'aomori',     '東北',       2),
  ( 3, '岩手',   '岩手県',   'いわて',       'iwate',      '東北',       3),
  ( 4, '宮城',   '宮城県',   'みやぎ',       'miyagi',     '東北',       4),
  ( 5, '秋田',   '秋田県',   'あきた',       'akita',      '東北',       5),
  ( 6, '山形',   '山形県',   'やまがた',     'yamagata',   '東北',       6),
  ( 7, '福島',   '福島県',   'ふくしま',     'fukushima',  '東北',       7),
  ( 8, '茨城',   '茨城県',   'いばらき',     'ibaraki',    '関東',       8),
  ( 9, '栃木',   '栃木県',   'とちぎ',       'tochigi',    '関東',       9),
  (10, '群馬',   '群馬県',   'ぐんま',       'gunma',      '関東',      10),
  (11, '埼玉',   '埼玉県',   'さいたま',     'saitama',    '関東',      11),
  (12, '千葉',   '千葉県',   'ちば',         'chiba',      '関東',      12),
  (13, '東京',   '東京都',   'とうきょう',   'tokyo',      '関東',      13),
  (14, '神奈川', '神奈川県', 'かながわ',     'kanagawa',   '関東',      14),
  (15, '新潟',   '新潟県',   'にいがた',     'niigata',    '中部',      15),
  (16, '富山',   '富山県',   'とやま',       'toyama',     '中部',      16),
  (17, '石川',   '石川県',   'いしかわ',     'ishikawa',   '中部',      17),
  (18, '福井',   '福井県',   'ふくい',       'fukui',      '中部',      18),
  (19, '山梨',   '山梨県',   'やまなし',     'yamanashi',  '中部',      19),
  (20, '長野',   '長野県',   'ながの',       'nagano',     '中部',      20),
  (21, '岐阜',   '岐阜県',   'ぎふ',         'gifu',       '中部',      21),
  (22, '静岡',   '静岡県',   'しずおか',     'shizuoka',   '中部',      22),
  (23, '愛知',   '愛知県',   'あいち',       'aichi',      '中部',      23),
  (24, '三重',   '三重県',   'みえ',         'mie',        '近畿',      24),
  (25, '滋賀',   '滋賀県',   'しが',         'shiga',      '近畿',      25),
  (26, '京都',   '京都府',   'きょうと',     'kyoto',      '近畿',      26),
  (27, '大阪',   '大阪府',   'おおさか',     'osaka',      '近畿',      27),
  (28, '兵庫',   '兵庫県',   'ひょうご',     'hyogo',      '近畿',      28),
  (29, '奈良',   '奈良県',   'なら',         'nara',       '近畿',      29),
  (30, '和歌山', '和歌山県', 'わかやま',     'wakayama',   '近畿',      30),
  (31, '鳥取',   '鳥取県',   'とっとり',     'tottori',    '中国',      31),
  (32, '島根',   '島根県',   'しまね',       'shimane',    '中国',      32),
  (33, '岡山',   '岡山県',   'おかやま',     'okayama',    '中国',      33),
  (34, '広島',   '広島県',   'ひろしま',     'hiroshima',  '中国',      34),
  (35, '山口',   '山口県',   'やまぐち',     'yamaguchi',  '中国',      35),
  (36, '徳島',   '徳島県',   'とくしま',     'tokushima',  '四国',      36),
  (37, '香川',   '香川県',   'かがわ',       'kagawa',     '四国',      37),
  (38, '愛媛',   '愛媛県',   'えひめ',       'ehime',      '四国',      38),
  (39, '高知',   '高知県',   'こうち',       'kochi',      '四国',      39),
  (40, '福岡',   '福岡県',   'ふくおか',     'fukuoka',    '九州・沖縄', 40),
  (41, '佐賀',   '佐賀県',   'さが',         'saga',       '九州・沖縄', 41),
  (42, '長崎',   '長崎県',   'ながさき',     'nagasaki',   '九州・沖縄', 42),
  (43, '熊本',   '熊本県',   'くまもと',     'kumamoto',   '九州・沖縄', 43),
  (44, '大分',   '大分県',   'おおいた',     'oita',       '九州・沖縄', 44),
  (45, '宮崎',   '宮崎県',   'みやざき',     'miyazaki',   '九州・沖縄', 45),
  (46, '鹿児島', '鹿児島県', 'かごしま',     'kagoshima',  '九州・沖縄', 46),
  (47, '沖縄',   '沖縄県',   'おきなわ',     'okinawa',    '九州・沖縄', 47);


-- ------------------------------------------------------------
-- 情報源
-- ------------------------------------------------------------
insert into public.news_sources (name, site_url, license_note, is_active) values
  ('公立応援団編集部', null, '自社制作。全文掲載可。', true);


-- ------------------------------------------------------------
-- 学校（すべて架空）
-- 設置区分は prefectural / municipal / national を、
-- 学校種別は high_school / kosen を混ぜて、表示の出し分けを確認できるようにする。
-- ------------------------------------------------------------
insert into public.schools
  (slug, name, official_name, name_aliases, prefecture_id, city,
   establishment, school_kind, founded_year, catchcopy, status)
values
  ('izumo-seiryo', '出雲西陵高校', '島根県立出雲西陵高等学校',
   array['出雲西陵','西陵','県立出雲西陵'],
   32, '出雲市', 'prefectural', 'high_school', 1924,
   '伝統と挑戦を胸に、新たな歴史をつくる。', 'published'),

  ('nagara-shogyo', '長良商業高校', '岐阜県立長良商業高等学校',
   array['長良商','県長商','長良商業'],
   21, '岐阜市', 'prefectural', 'high_school', 1908,
   '商都の誇りを、グラウンドで。', 'published'),

  ('inaho-nogyo', '稲穂農業高校', '秋田県立稲穂農業高等学校',
   array['稲穂農','稲農'],
   5, '大仙市', 'prefectural', 'high_school', 1931,
   '土と汗が育てた、粘りの野球。', 'published'),

  ('konan-shogyo', '港南商業高校', '横浜市立港南商業高等学校',
   array['港南商','市立港南商業'],
   14, '横浜市', 'municipal', 'high_school', 1948,
   '港町から、全国へ。', 'published'),

  ('aki-kawauchi', '安芸川内高校', '広島県立安芸川内高等学校',
   array['安芸川内','川内'],
   34, '広島市', 'prefectural', 'high_school', 1919,
   '「人間力野球」で地域とともに、夢を追いかける。', 'published'),

  ('haebaru-sogo', '南風原総合高校', '沖縄県立南風原総合高等学校',
   array['南風原総合','南風原'],
   47, '南風原町', 'prefectural', 'high_school', 1974,
   '南の島から全国へ。粘り強い野球が持ち味。', 'published'),

  ('tama-sakuragaoka', '多摩桜ヶ丘高校', '東京都立多摩桜ヶ丘高等学校',
   array['多摩桜ヶ丘','桜ヶ丘','都立桜ヶ丘'],
   13, '八王子市', 'prefectural', 'high_school', 1940,
   '文武両道、都立の意地を見せる。', 'published'),

  ('tokachi-seiryu', '十勝清流高校', '北海道十勝清流高等学校',
   array['十勝清流','清流'],
   1, '帯広市', 'prefectural', 'high_school', 1950,
   '雪解けを待って、白球を追う。', 'published'),

  ('harima-kosen', '播磨工業高専', '播磨工業高等専門学校',
   array['播磨高専','播磨工専'],
   28, '加古川市', 'national', 'kosen', 1962,
   '工学と野球、どちらも本気で。', 'published'),

  ('owari-kyoiku-fuzoku', '尾張教育大附属高校', '尾張教育大学教育学部附属高等学校',
   array['尾張教育大附属','尾教大附属'],
   23, '名古屋市', 'national', 'high_school', 1949,
   '国立からの挑戦は、まだ終わらない。', 'published');


-- ------------------------------------------------------------
-- 甲子園出場歴（架空）
-- ------------------------------------------------------------
insert into public.school_championships (school_id, year, season, result, wins, losses)
select s.id, v.year, v.season::public.season, v.result, v.wins, v.losses
from (values
  ('izumo-seiryo',        2024, 'spring', 'ベスト8',  2, 1),
  ('izumo-seiryo',        2022, 'summer', '2回戦',    1, 1),
  ('izumo-seiryo',        2019, 'spring', '1回戦',    0, 1),
  ('izumo-seiryo',        2015, 'summer', 'ベスト4',  3, 1),
  ('izumo-seiryo',        2011, 'summer', '2回戦',    1, 1),
  ('nagara-shogyo',       2023, 'summer', '準優勝',   5, 1),
  ('nagara-shogyo',       2018, 'spring', 'ベスト8',  2, 1),
  ('nagara-shogyo',       2014, 'summer', '3回戦',    2, 1),
  ('inaho-nogyo',         2022, 'summer', 'ベスト4',  3, 1),
  ('inaho-nogyo',         2016, 'summer', '2回戦',    1, 1),
  ('konan-shogyo',        2021, 'summer', '1回戦',    0, 1),
  ('konan-shogyo',        2017, 'spring', '2回戦',    1, 1),
  ('aki-kawauchi',        2024, 'summer', '優勝',     6, 0),
  ('aki-kawauchi',        2020, 'spring', 'ベスト8',  2, 1),
  ('haebaru-sogo',        2020, 'summer', '3回戦',    2, 1),
  ('tama-sakuragaoka',    1998, 'summer', '2回戦',    1, 1),
  ('tokachi-seiryu',      2019, 'summer', '1回戦',    0, 1),
  ('owari-kyoiku-fuzoku', 1962, 'summer', '1回戦',    0, 1)
) as v(school_slug, year, season, result, wins, losses)
join public.schools s on s.slug = v.school_slug;

-- 非正規化した出場回数を出場歴から計算し直す
select public.recalc_school_koshien_counts();


-- ------------------------------------------------------------
-- 最近の戦績（架空）
-- ------------------------------------------------------------
insert into public.school_records (school_id, year, tournament_name, result)
select s.id, v.year, v.tournament_name, v.result
from (values
  ('izumo-seiryo',  2026, '春季島根県大会',   '優勝'),
  ('izumo-seiryo',  2025, '秋季島根県大会',   'ベスト4'),
  ('izumo-seiryo',  2025, '夏季島根県大会',   '準優勝'),
  ('nagara-shogyo', 2026, '春季岐阜県大会',   'ベスト8'),
  ('nagara-shogyo', 2025, '秋季岐阜県大会',   'ベスト16'),
  ('inaho-nogyo',   2026, '春季秋田県大会',   '優勝'),
  ('aki-kawauchi',  2026, '春季広島県大会',   'ベスト4'),
  ('harima-kosen',  2026, '春季兵庫県大会',   '2回戦進出')
) as v(school_slug, year, tournament_name, result)
join public.schools s on s.slug = v.school_slug;


-- ------------------------------------------------------------
-- 公立旋風（架空）
-- highlight_rank はトップページの注目枠の並び順。
-- ------------------------------------------------------------
insert into public.phenomena
  (slug, title, year, season, level, summary, prefecture_id,
   highlight_rank, status, published_at)
values
  ('izumo-seiryo-2026-spring', '出雲西陵、県勢初の連覇で甲子園へ',
   2026, 'spring', 'koshien',
   '九回二死からの一打で試合をひっくり返した。県勢では初となる春の連覇を達成し、甲子園出場を決めた。',
   32, 1, 'published', '2026-08-09T09:00:00+09:00'),

  ('nagara-shogyo-2026-spring', '長良商業、強豪私学を撃破しベスト8',
   2026, 'spring', 'prefectural',
   '投手陣の踏ん張りと堅い守備で、優勝候補を1点差で振り切った。公立勢では唯一のベスト8。',
   21, 2, 'published', '2026-08-08T18:30:00+09:00'),

  ('inaho-nogyo-2026-spring', '稲穂農業、農業高校の意地で秋田大会優勝',
   2026, 'spring', 'prefectural',
   '実習の合間に練習を重ねてきたチームが、県内無敗で頂点に立った。',
   5, 3, 'published', '2026-08-07T20:00:00+09:00'),

  ('aki-kawauchi-2024-summer', '安芸川内、公立校として夏の県大会を制す',
   2024, 'summer', 'prefectural',
   '「人間力野球」を掲げるチームが、私学優位と言われた県を勝ち抜いた。',
   34, null, 'published', '2024-08-01T12:00:00+09:00');

insert into public.phenomenon_schools (phenomenon_id, school_id, role)
select p.id, s.id, 'main'
from (values
  ('izumo-seiryo-2026-spring', 'izumo-seiryo'),
  ('nagara-shogyo-2026-spring', 'nagara-shogyo'),
  ('inaho-nogyo-2026-spring',  'inaho-nogyo'),
  ('aki-kawauchi-2024-summer', 'aki-kawauchi')
) as v(phenomenon_slug, school_slug)
join public.phenomena p on p.slug = v.phenomenon_slug
join public.schools   s on s.slug = v.school_slug;


-- ------------------------------------------------------------
-- ニュース（架空）
-- 実運用では body に引用元の全文を入れない。見出し＋自作の要約＋出典リンクまで。
-- ------------------------------------------------------------
insert into public.news
  (slug, title, summary, body, category, status, published_at,
   source_name, prefecture_id)
values
  ('izumo-seiryo-shimane-yusho-2026',
   '出雲西陵が逆転勝利で島根大会優勝！春の甲子園出場へ',
   '九回二死からの一打で試合をひっくり返した。公立の出雲西陵が春の島根大会を制し、2年ぶりの甲子園出場を決めた。',
   E'## 九回二死からの一打\n\n一点を追う九回裏、二死走者なしから始まった攻撃だった。\n\n連打で二死一二塁とすると、続く打者が左中間を破る二塁打を放ち、二者が生還。スタンドが揺れた。\n\n## 私学ではない、地元の学校として\n\n出雲西陵は推薦入学の枠を持たない。選手のほとんどが市内の中学校の出身だ。',
   'result', 'published', '2026-08-09T09:00:00+09:00', '公立応援団編集部', 32),

  ('nagara-shogyo-best8-2026',
   '長良商業が強豪私学を破りベスト8進出',
   '投手陣の踏ん張りと堅い守備で、優勝候補を1点差で振り切った。公立勢では唯一のベスト8となる。',
   E'## 継投がはまった\n\n先発は五回途中まで無失点。継投した二番手も要所を締めた。\n\n守備では二度の併殺で流れを渡さなかった。',
   'result', 'published', '2026-08-08T18:30:00+09:00', '公立応援団編集部', 21),

  ('natsu-chihou-taikai-kumiawase-2026',
   '2026年夏の地方大会 組み合わせ発表まとめ【随時更新】',
   '全国47都道府県の夏の地方大会について、組み合わせが発表され次第まとめていく。公立校の初戦日程も併記する。',
   E'発表され次第、都道府県ごとに追記していく。\n\n公立校の初戦については、日程と対戦相手を併記する。',
   'news', 'published', '2026-08-07T12:00:00+09:00', '公立応援団編集部', null),

  ('renshu-kankyo-chiiki-torikumi',
   '公立高校野球部の練習環境を支える地域の取り組み',
   'グラウンド整備や送迎、用具の寄付。限られた予算のなかで部を支える地域のかたちを取材した。',
   E'## 予算という現実\n\n公立高校の部活動費は限られている。\n\n不足を補っているのは、OB会と地域の商店だった。',
   'topic', 'published', '2026-08-06T10:00:00+09:00', '公立応援団編集部', 5),

  ('column-koritsu-de-yakyu-wo-tsuzukeru',
   '元公立高校球児が語る「公立で野球を続けるということ」',
   '推薦もセレクションもない環境で、3年間をどう過ごしたか。卒業から10年が経った今、あらためて振り返ってもらった。',
   E'## 全員が初対面から始まる\n\n中学のとき、強豪私学からの誘いはなかった。\n\nそれでも野球を続けたくて、家から一番近い公立高校を選んだ。',
   'column', 'published', '2026-08-05T08:00:00+09:00', '公立応援団編集部', null),

  ('harima-kosen-shoshutsujo-2026',
   '播磨工業高専が兵庫大会で初戦突破 高専勢に注目',
   '5年制の高専からも地方大会に挑むチームがある。授業と実習の合間を縫って練習を重ねてきた。',
   E'## 高専も高野連に加盟している\n\n高等専門学校は5年制だが、3年生までは高校野球の大会に出場できる。\n\n全国の高専が地方大会に名を連ねている。',
   'topic', 'published', '2026-08-04T16:00:00+09:00', '公立応援団編集部', 28),

  ('shimonaka-draft-sample',
   '【下書きサンプル】この記事は公開されない',
   'RLSの動作確認用。status が draft のため、anonキーで取得しても返ってこないはず。',
   null,
   'news', 'draft', null, '公立応援団編集部', null);

insert into public.news_schools (news_id, school_id, relevance)
select n.id, s.id, v.relevance
from (values
  ('izumo-seiryo-shimane-yusho-2026',    'izumo-seiryo',  10),
  ('nagara-shogyo-best8-2026',           'nagara-shogyo', 10),
  ('renshu-kankyo-chiiki-torikumi',      'inaho-nogyo',    5),
  ('harima-kosen-shoshutsujo-2026',      'harima-kosen',  10)
) as v(news_slug, school_slug, relevance)
join public.news    n on n.slug = v.news_slug
join public.schools s on s.slug = v.school_slug;


-- ------------------------------------------------------------
-- 特集
-- ------------------------------------------------------------
insert into public.features
  (slug, title, subtitle, category, body, sort_order, status, published_at)
values
  ('chihou-taikai-kansen-guide',
   '地方大会の観戦をもっと楽しむために',
   '球場の楽しみ方・持ち物・マナーも解説',
   'guide',
   E'## 持ち物\n\n夏の地方大会は暑い。日よけと水分は必須になる。\n\n## マナー\n\n応援は相手校へのリスペクトを忘れずに。',
   1, 'published', '2026-07-20T10:00:00+09:00'),

  ('rekidai-koritsu-senpu',
   '公立旋風を起こした名門たち',
   '記憶に残るあの夏、あの戦い。',
   'history',
   E'## 公立旋風とは\n\n強豪私学がひしめく地方大会や甲子園で、公立高校が勝ち上がっていくこと。\n\nこのサイトでは、その一つひとつを記録として残していく。',
   2, 'published', '2026-07-15T10:00:00+09:00'),

  ('zenkoku-koritsu-yakyubu',
   '全国の公立高校野球部紹介',
   'それぞれの地域で輝く公立の姿へ。',
   'school_intro',
   E'## 都道府県ごとに紹介する\n\n地域に根ざした公立高校の野球部を、順に取り上げていく。',
   3, 'published', '2026-07-10T10:00:00+09:00'),

  ('kansen-goods',
   '高校野球観戦におすすめのグッズ',
   '快適に、より楽しく観戦しよう。',
   'goods',
   E'## 双眼鏡\n\n外野席から選手の表情まで追いたいなら、倍率8倍前後が扱いやすい。\n\n## 日よけ\n\n帽子とタオルは必携。',
   4, 'published', '2026-07-05T10:00:00+09:00');
