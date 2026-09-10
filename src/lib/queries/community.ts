import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toPrefectureRef } from "@/lib/queries/shared";
import { bulkLoader, fetchAllRows, EDITORIAL_TTL_MS } from "@/lib/queries/bulk";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";
import type { CheerMessageRow, PollRow } from "@/types/database";
import type { CheerMessage, Poll } from "@/types/app";

/**
 * コミュニティ機能の読み取り。
 *
 * 票そのもの（poll_votes）と応援の押下記録（school_cheers）は
 * **RLS に select ポリシーを作っていないので読めない。** 誰が何に投票したかは
 * 返す必要が無く、返せば利用者の行動履歴を配ることになるため。
 * 画面に出す数は poll_options.vote_count と schools.cheer_count にある。
 */

const POLL_SELECT = `
  id, slug, question, description, starts_at, ends_at,
  prefecture:prefectures ( name, slug ),
  poll_options ( id, label, sort_order, vote_count, schools ( slug, name ) )
`;

function toPoll(row: PollRow): Poll {
  const options = (row.poll_options ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({
      id: o.id,
      label: o.label,
      voteCount: o.vote_count,
      school: o.schools ? { slug: o.schools.slug, name: o.schools.name } : null,
    }));

  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    description: row.description,
    prefecture: toPrefectureRef(row.prefecture),
    endsAt: row.ends_at,
    options,
    totalVotes: options.reduce((sum, o) => sum + o.voteCount, 0),
  };
}

/**
 * 受付中の設問。
 *
 * 期間の判定をDB側の now() ではなくアプリ側で行っているのは、
 * Next.js のキャッシュに載った古い結果をそのまま出さないため
 * （締め切り後も投票欄が出てしまうが、投票自体は guard_poll_vote が弾く）。
 */
export async function getActivePolls(prefectureSlug?: string): Promise<Poll[]> {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("polls")
    .select(POLL_SELECT)
    .order("sort_order", { ascending: true });

  if (prefectureSlug) {
    // 埋め込み側（prefectures.slug）で絞ると、!inner を付けない限り
    // 親の行が落ちない。**親のカラムで絞るほうが確実。**
    // 全国のお題（prefecture_id が null）も一緒に出す。
    const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
    if (!prefecture) return [];
    query = query.or(`prefecture_id.eq.${prefecture.id},prefecture_id.is.null`);
  }

  const { data, error } = await query;
  throwIfError(error, "設問の取得");

  const now = Date.now();
  return ((data ?? []) as unknown as PollRow[])
    .filter((row) => {
      const started = !row.starts_at || new Date(row.starts_at).getTime() <= now;
      const notEnded = !row.ends_at || new Date(row.ends_at).getTime() >= now;
      return started && notEnded;
    })
    .map(toPoll);
}

/**
 * 公開済みの応援メッセージ。新しい順。
 * 承認したものしか返らない（RLS で status = 'published' を強制）。
 *
 * **0008 で学校単位になった。** 絞り方は2通りある。
 *
 *   - `schoolId` … 学校ページ。その学校あての投稿だけ
 *   - `prefectureSlug` … 都道府県ページ。**その県の学校あての投稿を集める。**
 *     投稿欄は学校ページにしか無いので、県ページは集約表示に徹する
 *
 * `prefecture_id` は投稿時にDBのトリガが学校から引いて入れているので、
 * 県で絞るのに学校を経由した結合は要らない。
 */
/*
  ★★**学校ページ1枚ごとに問い合わせない**（2026-09-10。`bulk.ts` を読むこと）。
  **3,500枚が1枚ずつ聞いていた。** 承認済みのものだけが返る表で、件数は多くない。

  ★★**憶えておく時間は短く**（`EDITORIAL_TTL_MS`）——
  **承認したらすぐ画面に出したい**もの。**1回のビルドをまたげれば十分**なので、
  短くしても問い合わせの回数はほとんど変わらない。
  ★**RLS はそのまま効く**（承認済みの行しか返らない。絞り込みを手元に移しただけ）。
*/
type CheerRow = CheerMessageRow & {
  school_id: string | null;
  prefecture_id: number | null;
};

const loadCheerMessages = bulkLoader("cheer-messages", EDITORIAL_TTL_MS, async () => {
  const supabase = createSupabaseServerClient();
  const rows = await fetchAllRows<CheerRow>("応援メッセージの取得", (from, to) =>
    supabase
      .from("cheer_messages")
      .select(
        `id, body, display_name, published_at, school_id, prefecture_id,
       schools ( slug, name ),
       prefecture:prefectures ( name, slug )`,
      )
      // ★**並びを一意に決めてから取る**（ページの境目で抜けないように）
      .order("id", { ascending: true })
      .range(from, to),
  );
  /*
    ★**新しい順。公開日の無いものは後ろ**（`nullsFirst: false` と同じ並び）。
  */
  return rows.sort((a, b) => {
    if (a.published_at === b.published_at) return 0;
    if (a.published_at === null) return 1;
    if (b.published_at === null) return -1;
    return String(b.published_at).localeCompare(String(a.published_at));
  });
});

export async function getCheerMessages(
  options: {
    schoolId?: string;
    prefectureSlug?: string;
    limit?: number;
  } = {},
): Promise<CheerMessage[]> {
  let prefectureId: number | null = null;
  if (options.prefectureSlug) {
    const prefecture = PREFECTURE_BY_SLUG.get(options.prefectureSlug);
    if (!prefecture) return [];
    prefectureId = prefecture.id;
  }

  const rows = (await loadCheerMessages())
    .filter((row) => !options.schoolId || row.school_id === options.schoolId)
    .filter((row) => prefectureId === null || row.prefecture_id === prefectureId)
    .slice(0, options.limit ?? 20);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    displayName: row.display_name,
    publishedAt: row.published_at,
    school: row.schools ? { slug: row.schools.slug, name: row.schools.name } : null,
    prefecture: toPrefectureRef(row.prefecture),
  }));
}
