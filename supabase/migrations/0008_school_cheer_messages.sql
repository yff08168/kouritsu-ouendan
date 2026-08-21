-- ============================================================
-- 0008 応援メッセージを学校単位にする（2026-08-20）
--
-- 0005 では「学校ページに自由記述欄を置かない」としていた。
-- 「○○高校の△△君」という書き込みを招き、
-- 「選手個人のページ・個人成績を作らない（未成年への配慮）」という
-- 方針と食い違うため。**2026-08-20 に運営者の判断でこれを覆した。**
--
-- ★方針そのもの（選手個人を取り上げない）は変わっていない。
-- 置き場所を移すだけで、歯止めはすべて残す。
--
--   - 投稿は必ず draft で入り、承認したものだけ公開される（0005 のまま）
--   - 利用規約 5-2 の「選手・生徒個人を名指しした内容は掲載しない」も
--     そのまま生きている。**承認する人がここを見る**
--   - 投稿欄にも同じ注意書きを出す（CheerMessageForm）
--
-- **お題（cheer_topics / cheer_messages.topic_id）は使うのをやめた。**
-- テーブルと列はそのまま残してある — 消しても得るものが無く、
-- 戻したくなったときに作り直す手間だけが増えるため。
-- **どこからも参照していないので、中身が変わっても画面に影響しない。**
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 学校への参照を足す
--
-- ★列は nullable にしてある。**既存の県単位の投稿を壊さないため**で、
-- 「無くてもよい」という意味ではない。**新しい投稿では必須**で、
-- 下のトリガと RLS ポリシーの両方で縛っている。
-- （0005 と同じく、ポリシーだけに頼らず二重にする）
--
-- 学校が消えたらメッセージも消す。宛先の無い応援は残しても意味が無い。
-- ------------------------------------------------------------
alter table public.cheer_messages
  add column if not exists school_id uuid
    references public.schools (id) on delete cascade;

create index if not exists cheer_messages_school_idx
  on public.cheer_messages (school_id, published_at desc);


-- ------------------------------------------------------------
-- 2. 投稿時の強制をやり直す
--
-- 0005 の force_cheer_message_draft を差し替える。足したのは3つ。
--
--   a. school_id が無い投稿を弾く
--   b. 下書きの学校（硬式野球部が無い等）への投稿を弾く
--      — guard_school_cheer（応援ボタン）と同じ考え方。
--        RLS で見えない学校に書けると、その学校の存在が漏れる
--   c. ★prefecture_id をクライアントから受け取らず、学校から引く
--      — 受け取ると、ある県の学校あての投稿を別の県のページに
--        混ぜ込めてしまう。**送られてきた値は無条件に上書きする**
--
-- ★security definer にしている。schools の status を見るのに
-- 「その人に見える範囲」ではなく実体を見る必要があるため
-- （0006 で同じ理由の不具合を4件直している）。
-- search_path は空に固定したまま。
-- ------------------------------------------------------------
create or replace function public.force_cheer_message_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  new.status := 'draft';        -- 承認されるまで公開しない
  new.published_at := null;
  new.created_at := now();

  if new.school_id is null then
    raise exception '応援する学校が指定されていません';
  end if;

  select sc.prefecture_id, sc.status into s
  from public.schools sc
  where sc.id = new.school_id;

  if not found then
    raise exception '学校が見つかりません';
  end if;
  if s.status <> 'published' then
    raise exception '公開されていない学校には投稿できません';
  end if;

  -- 都道府県は学校から引く。クライアントの値は使わない
  new.prefecture_id := s.prefecture_id;

  -- 空白だけの投稿を弾く
  if btrim(new.body) = '' then
    raise exception '本文が空です';
  end if;
  new.body := btrim(new.body);
  if new.display_name is not null and btrim(new.display_name) = '' then
    new.display_name := null;
  end if;
  return new;
end;
$$;

-- トリガ自体は 0005 のものをそのまま使う（関数を差し替えただけ）。
-- 流し直しても同じ結果になるように張り直しておく。
drop trigger if exists cheer_messages_force_draft on public.cheer_messages;
create trigger cheer_messages_force_draft
  before insert on public.cheer_messages
  for each row execute function public.force_cheer_message_draft();


-- ------------------------------------------------------------
-- 3. RLS の insert ポリシーに school_id 必須を足す
--
-- ★ポリシーの with check は BEFORE トリガのあとに評価される。
-- したがって status = 'draft' はトリガが入れた値で通る（0005 と同じ）。
-- school_id はトリガが raise exception で止めるので、ここは二重の網。
-- ------------------------------------------------------------
drop policy if exists "anyone can post a message" on public.cheer_messages;

create policy "anyone can post a message"
  on public.cheer_messages for insert
  to anon, authenticated
  with check (
    status = 'draft'
    and published_at is null
    and school_id is not null
  );

-- select / update / delete のポリシーは 0005・0006 のまま変えていない。
-- 公開済みだけ読める。anon は更新も削除もできない。

comment on table public.cheer_messages is
  '学校単位の応援メッセージ。投稿は必ず draft で入り、承認したものだけ published になる。prefecture_id は学校から引いた値で、クライアントの指定は無視する。';
comment on column public.cheer_messages.school_id is
  '宛先の学校。新しい投稿では必須（トリガとポリシーで強制）。null は 0005 時代の県単位の投稿。';
comment on column public.cheer_messages.topic_id is
  '未使用。お題は 2026-08-20 にやめた（0008）。列は戻せるように残してあるだけで、どこからも参照していない。';
comment on table public.cheer_topics is
  '未使用。お題は 2026-08-20 にやめた（0008）。アプリからは読んでいない。';

commit;


-- 確認用
select '学校あての投稿' as 種別, count(*)::text as 件数
  from public.cheer_messages where school_id is not null
union all
select '県あての投稿（0005 時代）', count(*)::text
  from public.cheer_messages where school_id is null
union all
select 'うち公開済み', count(*)::text
  from public.cheer_messages where status = 'published';
