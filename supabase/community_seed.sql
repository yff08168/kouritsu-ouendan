-- ============================================================
-- コミュニティ機能の初期データ（お題・投票）
--
-- 0005_community.sql を適用したあとに実行する。
-- **何度流しても安全**（slug で重ね書きを避けている）。
--
-- 応援ボタンには初期データが要らない（押された数が実データ）。
-- ============================================================

begin;

-- ------------------------------------------------------------
-- お題
--
-- 自由記述にせず「何を書く場所か」を示して内容を誘導する。
-- **選手個人に触れさせないお題にすること。** 「注目選手は？」のような
-- お題を作ると、未成年の個人名が集まる場所になる（AGENTS.md の方針に反する）。
-- ------------------------------------------------------------
insert into public.cheer_topics (slug, title, description, status, sort_order) values
  ('omoide-no-ichisen',
   '思い出の一戦',
   '記憶に残っている試合と、そのときの気持ちをどうぞ。',
   'published', 1),

  ('jimoto-no-koritsu',
   '地元の公立校のいいところ',
   '校風、応援、地域とのつながり。知られていない魅力を教えてください。',
   'published', 2),

  ('kotoshi-no-natsu',
   '今年の夏に期待すること',
   'これからの大会に向けた応援のひとことを。',
   'published', 3)
on conflict (slug) do nothing;


-- ------------------------------------------------------------
-- 投票
--
-- 学校を選ばせる設問は poll_options.school_id を使うと学校ページへ
-- 辿れるようになるが、初期データでは特定の学校に寄せたくないので
-- 学校にひもづかない全国共通のお題だけを入れる。
-- prefecture_id が null なので、どの都道府県ページにも出る。
-- ------------------------------------------------------------
insert into public.polls (slug, question, description, prefecture_id, status, sort_order)
values
  ('koritsu-no-miryoku',
   '公立高校野球のどこに惹かれますか？',
   '1つ選ぶと、みんなの結果が見られます。',
   null, 'published', 1)
on conflict (slug) do nothing;

insert into public.poll_options (poll_id, label, sort_order)
select p.id, v.label, v.sort_order
from public.polls p
cross join (values
  ('限られた環境で工夫して戦う姿', 1::smallint),
  ('地元とのつながり・地域の応援', 2::smallint),
  ('強豪私学に挑む番狂わせ', 3::smallint),
  ('勉強と両立している選手たち', 4::smallint)
) as v(label, sort_order)
where p.slug = 'koritsu-no-miryoku'
  -- 流し直しても選択肢が増えないようにする
  and not exists (
    select 1 from public.poll_options o
    where o.poll_id = p.id and o.label = v.label
  );

commit;


-- 確認用
select 'お題' as 種別, count(*) from public.cheer_topics where status = 'published'
union all
select '設問', count(*) from public.polls where status = 'published'
union all
select '選択肢', count(*) from public.poll_options;
