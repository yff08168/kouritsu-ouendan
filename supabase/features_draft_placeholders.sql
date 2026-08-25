-- 特集をいったん1件だけにする（2026-08-24。運営者の判断）
--
-- ★**消すのではなく下書きに戻す。** RLS が `status = 'published'` の行しか
--   返さないので、下書きにすればトップにも一覧にも出なくなる。
--   記事を書いたら `status = 'published'` に戻すだけで復活する。
--
-- ★**コードは触っていない。** `getLatestFeatures` はそのままで、
--   新しい特集を published にすれば自動で出る。
--
-- 何度流しても同じ結果になる。

update public.features
   set status = 'draft'
 where slug <> 'koritsu-2026-natsu-koshien';

-- 残す1件は念のため公開に固定する
update public.features
   set status = 'published'
 where slug = 'koritsu-2026-natsu-koshien';

-- 確認用
select slug, sort_order, status, title
  from public.features
 order by sort_order;
