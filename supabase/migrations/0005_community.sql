-- ============================================================
-- 0005 コミュニティ機能（応援ボタン・投票・応援メッセージ）
--
-- ⚠️ このマイグレーションで、**anon に初めて書き込みを許可する。**
--
-- 0002_rls.sql の方針は「書き込みは service_role のみ」だった。
-- しかし service_role キーを持っていない（README「Vercel の環境変数」）ため、
-- 利用者の投稿を受けるには anon に insert を開けるしかない。
--
-- anon キーはブラウザに露出する公開鍵なので、**アプリを経由せず
-- 直接 Supabase を叩かれる前提で設計する。** Next.js の API ルートを
-- 挟んでも、その裏口は塞げない。したがって守りはすべてDB側に置く。
--
--   1. ポリシーで insert できる行の形を縛る（status は draft のみ等）
--   2. トリガで status・公開日時をサーバ側で強制的に上書きする
--      （ポリシーの with check だけだと、列を増やしたときに漏れる）
--   3. CHECK 制約で本文の長さ・visitor_key の形を縛る
--   4. トリガで同一 visitor_key の連続投稿を止める
--
-- visitor_key は利用者のブラウザが localStorage に持つUUID。
-- **利用者が自由に作り替えられるので、本人確認ではない。**
-- 二重クリックとカジュアルな連投を防ぐためのもの。
-- 本格的な荒らし対策にはログイン（Supabase Auth）が要る。
--
-- 個人情報は保存しない。IPアドレスもメールアドレスも取らない。
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 共通: visitor_key の形
-- 長すぎる値を入れられないようにする。UUID を想定。
-- ------------------------------------------------------------
-- create domain に if not exists が無いので、流し直せるように包む
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'visitor_key' and n.nspname = 'public'
  ) then
    create domain public.visitor_key as text
      check (value ~ '^[0-9a-zA-Z_-]{16,64}$');
  end if;
end
$$;


-- ============================================================
-- 1. 応援ボタン
-- ============================================================

-- 学校ごとの応援数。一覧カードで毎回 count(*) すると重いので
-- schools 側に非正規化する（甲子園出場回数と同じやり方）。
alter table public.schools
  add column if not exists cheer_count integer not null default 0;

create table if not exists public.school_cheers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  visitor_key public.visitor_key not null,
  created_at  timestamptz not null default now(),
  -- 同じ人が同じ学校を何度も押せないようにする
  unique (school_id, visitor_key)
);

create index if not exists school_cheers_school_idx
  on public.school_cheers (school_id);

-- 応援数の再計算。トリガで増減させるが、ずれたときのために全件計算も置く。
create or replace function public.recalc_school_cheer_counts()
returns void
language sql
set search_path = ''
as $$
  update public.schools s
  set cheer_count = coalesce(
    (select count(*) from public.school_cheers c where c.school_id = s.id),
    0
  );
$$;

create or replace function public.bump_school_cheer_count()
returns trigger
language plpgsql
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

drop trigger if exists school_cheers_count on public.school_cheers;
create trigger school_cheers_count
  after insert or delete on public.school_cheers
  for each row execute function public.bump_school_cheer_count();

-- 下書きの学校（硬式野球部が無い等）に応援を入れさせない。
-- RLS の select ポリシーで見えない学校に書き込めてしまうと、
-- 存在しないはずの学校の存在が cheer_count 経由で漏れる。
create or replace function public.guard_school_cheer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.schools s
    where s.id = new.school_id and s.status = 'published'
  ) then
    raise exception '公開されていない学校には応援できません';
  end if;
  return new;
end;
$$;

drop trigger if exists school_cheers_guard on public.school_cheers;
create trigger school_cheers_guard
  before insert on public.school_cheers
  for each row execute function public.guard_school_cheer();


-- ============================================================
-- 2. 投票・アンケート
-- ============================================================

create table if not exists public.polls (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  question      text not null,
  description   text,
  -- 全国のお題なら null、都道府県ごとのお題なら地区を入れる
  prefecture_id smallint references public.prefectures (id),
  status        public.content_status not null default 'draft',
  -- 投票を受け付ける期間。null なら期限なし
  starts_at     timestamptz,
  ends_at       timestamptz,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists polls_updated_at on public.polls;
create trigger polls_updated_at
  before update on public.polls
  for each row execute function public.set_updated_at();

create table if not exists public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  label      text not null,
  -- 学校を選ぶ設問なら学校にひもづける（学校ページから辿れるようにする）
  school_id  uuid references public.schools (id) on delete set null,
  sort_order smallint not null default 0,
  -- 毎回 count(*) しないための非正規化
  vote_count integer not null default 0
);

create index if not exists poll_options_poll_idx on public.poll_options (poll_id);

create table if not exists public.poll_votes (
  id             uuid primary key default gen_random_uuid(),
  -- poll_id を持たせているのは「1つの設問につき1票」の一意制約を張るため。
  -- poll_option_id だけだと、同じ人が複数の選択肢に入れられてしまう。
  poll_id        uuid not null references public.polls (id) on delete cascade,
  poll_option_id uuid not null references public.poll_options (id) on delete cascade,
  visitor_key    public.visitor_key not null,
  created_at     timestamptz not null default now(),
  unique (poll_id, visitor_key)
);

create or replace function public.bump_poll_vote_count()
returns trigger
language plpgsql
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

drop trigger if exists poll_votes_count on public.poll_votes;
create trigger poll_votes_count
  after insert or delete on public.poll_votes
  for each row execute function public.bump_poll_vote_count();

-- 締め切った設問・非公開の設問に投票させない。
-- 選択肢と設問の対応が食い違う票（別の設問の選択肢に入れる）も弾く。
create or replace function public.guard_poll_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p record;
begin
  -- record 変数の null 判定は分かりにくいので found を使う
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

drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard
  before insert on public.poll_votes
  for each row execute function public.guard_poll_vote();


-- ============================================================
-- 3. 応援メッセージ（都道府県単位・お題つき・承認制）
--
-- **学校単位ではなく都道府県単位にしている。**
-- 学校ページに自由記述欄を置くと「○○高校の△△君」という書き込みが出る。
-- このサイトは「選手個人のページ・個人成績は作らない（未成年への配慮）」を
-- 方針にしている（AGENTS.md）ので、自分が載せない情報を利用者に
-- 書かせる場所を作らない。都道府県単位なら個人が特定されにくい。
-- ============================================================

-- お題。自由記述にせず「何を書く場所か」を示して内容を誘導する。
create table if not exists public.cheer_topics (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text,
  status      public.content_status not null default 'draft',
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.cheer_messages (
  id            uuid primary key default gen_random_uuid(),
  prefecture_id smallint not null references public.prefectures (id),
  topic_id      uuid references public.cheer_topics (id) on delete set null,
  -- 短く区切る。長文ほど個人の特定や誹謗中傷が入りやすい。
  body          text not null check (char_length(body) between 1 and 200),
  display_name  text check (display_name is null or char_length(display_name) between 1 and 20),
  status        public.content_status not null default 'draft',
  visitor_key   public.visitor_key not null,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create index if not exists cheer_messages_pref_idx
  on public.cheer_messages (prefecture_id, published_at desc);
create index if not exists cheer_messages_status_idx
  on public.cheer_messages (status);
create index if not exists cheer_messages_visitor_idx
  on public.cheer_messages (visitor_key, created_at desc);

-- 投稿時にサーバ側で値を強制する。
-- **ポリシーの with check だけに頼らない。** 列を足したときに
-- ポリシーの更新を忘れても、ここで潰れるようにしておく。
create or replace function public.force_cheer_message_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'draft';        -- 承認されるまで公開しない
  new.published_at := null;
  new.created_at := now();
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

drop trigger if exists cheer_messages_force_draft on public.cheer_messages;
create trigger cheer_messages_force_draft
  before insert on public.cheer_messages
  for each row execute function public.force_cheer_message_draft();

-- 連投を止める。visitor_key は作り替えられるので完全ではないが、
-- ブラウザから素直に投げる限りは効く。
create or replace function public.limit_cheer_message_rate()
returns trigger
language plpgsql
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

drop trigger if exists cheer_messages_rate_limit on public.cheer_messages;
create trigger cheer_messages_rate_limit
  before insert on public.cheer_messages
  for each row execute function public.limit_cheer_message_rate();

-- 承認して公開するときに published_at を入れる
create or replace function public.set_cheer_message_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists cheer_messages_published_at on public.cheer_messages;
create trigger cheer_messages_published_at
  before update on public.cheer_messages
  for each row execute function public.set_cheer_message_published_at();


-- ============================================================
-- RLS
-- ============================================================

alter table public.school_cheers  enable row level security;
alter table public.polls          enable row level security;
alter table public.poll_options   enable row level security;
alter table public.poll_votes     enable row level security;
alter table public.cheer_topics   enable row level security;
alter table public.cheer_messages enable row level security;

drop policy if exists "anyone can cheer"                on public.school_cheers;
drop policy if exists "published polls are public"      on public.polls;
drop policy if exists "options follow poll"             on public.poll_options;
drop policy if exists "anyone can vote"                 on public.poll_votes;
drop policy if exists "published topics are public"     on public.cheer_topics;
drop policy if exists "published messages are public"   on public.cheer_messages;
drop policy if exists "anyone can post a message"       on public.cheer_messages;

-- ------------------------------------------------------------
-- 応援ボタン: 書けるが読めない。
-- 誰がどこを応援したかの一覧を返す必要はなく、返せば利用者の
-- 行動履歴を配ることになる。表示に使う数は schools.cheer_count にある。
-- ------------------------------------------------------------
create policy "anyone can cheer"
  on public.school_cheers for insert
  to anon, authenticated
  with check (true);   -- 中身の妥当性は guard_school_cheer トリガで見る

-- ------------------------------------------------------------
-- 投票: 設問と選択肢は公開済みのものだけ読める。票は書けるが読めない。
-- ------------------------------------------------------------
create policy "published polls are public"
  on public.polls for select
  to anon, authenticated
  using (status = 'published');

create policy "options follow poll"
  on public.poll_options for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and p.status = 'published'
    )
  );

create policy "anyone can vote"
  on public.poll_votes for insert
  to anon, authenticated
  with check (true);   -- 妥当性は guard_poll_vote トリガで見る

-- ------------------------------------------------------------
-- 応援メッセージ: 公開済みだけ読める。投稿はできるが下書きにしかならない。
--
-- with check で status を縛ったうえで、トリガでも上書きしている。
-- 二重にしているのは、ポリシーは列を足したときに追従を忘れやすいため。
-- ------------------------------------------------------------
create policy "published topics are public"
  on public.cheer_topics for select
  to anon, authenticated
  using (status = 'published');

create policy "published messages are public"
  on public.cheer_messages for select
  to anon, authenticated
  using (status = 'published');

create policy "anyone can post a message"
  on public.cheer_messages for insert
  to anon, authenticated
  with check (status = 'draft' and published_at is null);

-- anon には update / delete のポリシーを作らない。
-- 投稿の取り消しは通報導線を経由して運営が行う。

-- ------------------------------------------------------------
-- 権限
--
-- Supabase は public スキーマの新しいテーブルに anon/authenticated の
-- 権限を自動で付ける設定になっているが、**この機能は権限が付いているか
-- どうかに全面的に依存する**ので、当てにせず明示的に付けておく。
-- 何が実際に読み書きできるかは、この上の RLS ポリシーが決める。
-- ------------------------------------------------------------
grant select on
  public.polls, public.poll_options, public.cheer_topics, public.cheer_messages
  to anon, authenticated;

grant insert on
  public.school_cheers, public.poll_votes, public.cheer_messages
  to anon, authenticated;

-- update / delete は誰にも与えない（運営はダッシュボードから行う）

comment on table public.school_cheers is
  '応援ボタンの押下記録。visitor_key はブラウザのlocalStorageのUUIDで本人確認ではない。';
comment on table public.cheer_messages is
  '都道府県単位の応援メッセージ。投稿は必ず draft で入り、承認したものだけ published になる。';

commit;
