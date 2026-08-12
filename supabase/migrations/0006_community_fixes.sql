-- ============================================================
-- 0006 コミュニティ機能の修正
--
-- 0005 を適用して scripts/check-community.mjs で確かめたところ、
-- 4件が意図どおりに動いていなかった。原因はどれも同じ。
--
-- **トリガ関数が呼び出した人（anon）の権限で動いていた。**
--
--   - bump_school_cheer_count は schools を update するが、anon には
--     schools の update ポリシーが無い。**エラーにならず0行更新**になり、
--     応援数が増えなかった（RLS は「見えない行は無いもの」として扱う）。
--   - bump_poll_vote_count も同じ理由で票数が増えなかった。
--   - limit_cheer_message_rate は cheer_messages を数えるが、RLS のせいで
--     published の行しか見えず、下書きの投稿が数えられず常に0件。
--     連投制限が効いていなかった。
--
-- 集計用のトリガは「その人に見える範囲」ではなく「テーブル全体」を
-- 見る必要があるので security definer にする。search_path は 0005 から
-- 引き続き空に固定してある（検索パスを差し替える攻撃を防ぐため）。
--
-- あわせて、anon から update / delete を明示的に取り上げる。
-- Supabase は public スキーマの新しいテーブルに anon の全権限を
-- 既定で付けるので、0005 の grant を書いただけでは update が残っていた。
-- RLS にポリシーが無いので実害は出ていなかったが、防御は二重にしておく。
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. 集計トリガを security definer にする
-- ------------------------------------------------------------
create or replace function public.bump_school_cheer_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.schools set cheer_count = cheer_count + 1 where id = new.school_id;
  elsif tg_op = 'DELETE' then
    update public.schools set cheer_count = greatest(cheer_count - 1, 0) where id = old.school_id;
  end if;
  return null;
end;
$$;

create or replace function public.bump_poll_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.poll_options set vote_count = vote_count + 1 where id = new.poll_option_id;
  elsif tg_op = 'DELETE' then
    update public.poll_options set vote_count = greatest(vote_count - 1, 0) where id = old.poll_option_id;
  end if;
  return null;
end;
$$;

-- 連投制限。下書きも数える必要があるので security definer。
create or replace function public.limit_cheer_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.cheer_messages
  where visitor_key = new.visitor_key
    and created_at > now() - interval '1 hour';

  if recent >= 5 then
    raise exception '短時間に投稿しすぎです。しばらく時間をおいてからお試しください';
  end if;
  return new;
end;
$$;

-- 設問の締め切り判定も、下書きの設問を見る必要があるので definer にする
create or replace function public.guard_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from public.polls where id = new.poll_id;
  if not found then
    raise exception '設問が見つかりません';
  end if;
  if p.status <> 'published' then
    raise exception '公開されていない設問には投票できません';
  end if;
  if p.starts_at is not null and now() < p.starts_at then
    raise exception 'まだ投票を受け付けていません';
  end if;
  if p.ends_at is not null and now() > p.ends_at then
    raise exception '投票の受付は終了しました';
  end if;
  if not exists (
    select 1 from public.poll_options o
    where o.id = new.poll_option_id and o.poll_id = new.poll_id
  ) then
    raise exception 'この設問の選択肢ではありません';
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 2. 票数の再計算関数（応援数のほうは 0005 で作ってある）
-- ------------------------------------------------------------
create or replace function public.recalc_poll_vote_counts()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.poll_options o
  set vote_count = coalesce(
    (select count(*) from public.poll_votes v where v.poll_option_id = o.id),
    0
  );
$$;


-- ------------------------------------------------------------
-- 3. 権限を絞る
--
-- Supabase の既定で anon に全権限が付いているので、要らないものを外す。
-- 実際の防御は RLS だが、権限側でも塞いでおくと
-- 「ポリシーを1つ書き忘れた」ときに素通りしなくなる。
-- ------------------------------------------------------------
revoke update, delete on
  public.school_cheers, public.poll_votes, public.cheer_messages,
  public.polls, public.poll_options, public.cheer_topics
  from anon, authenticated;

revoke insert on
  public.polls, public.poll_options, public.cheer_topics
  from anon, authenticated;

-- 集計のやり直しは運営だけが行う。anon から呼べる必要は無い。
revoke execute on function public.recalc_school_cheer_counts() from anon, authenticated;
revoke execute on function public.recalc_poll_vote_counts()   from anon, authenticated;


-- ------------------------------------------------------------
-- 4. トリガが動いていなかった間に入った行を数え直す
-- ------------------------------------------------------------
select public.recalc_school_cheer_counts();
select public.recalc_poll_vote_counts();

commit;


-- 確認用
select 'cheer_count の合計' as 項目, sum(cheer_count)::text as 値 from public.schools
union all
select 'school_cheers の件数', count(*)::text from public.school_cheers
union all
select 'vote_count の合計', coalesce(sum(vote_count), 0)::text from public.poll_options
union all
select 'poll_votes の件数', count(*)::text from public.poll_votes;
