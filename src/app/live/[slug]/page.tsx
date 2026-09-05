import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPinned } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { LiveBoard } from "@/components/results/LiveBoard";
import { LiveRefresh } from "@/components/results/LiveRefresh";
import { PREFECTURES } from "@/lib/constants";
import { fetchLiveBoard, isLiveCovered } from "@/lib/live/hsb";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 県の速報ページ。
 *
 * ------------------------------------------------------------------
 * ★★★**このルートだけ「描くときに取りに行く」。** 他のページは生成物を読む。
 * ★**`revalidate = 60`** —— 出典を叩く間隔は `hsb.ts` の `fetch` が持っており、
 *   **試合時間帯（8〜20時）以外は30分**になる。ここはページの焼き直しの間隔。
 * ★**静的生成しない**（`generateStaticParams` を置かない）。
 *   **41県ぶんを1分ごとに焼き直すことになる。** 見られている県だけでよい。
 */
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pref = PREFECTURES.find((p) => p.slug === slug);
  if (!pref) return {};
  return {
    title: `${pref.name}の試合速報`,
    description: `${pref.name}で今日行われている高校野球の試合を、イニングごとに出しています。`,
    // ★**速報は残らない**（明日には別の中身になる）。検索結果に古い日の内容を残さない
    robots: { index: false, follow: true },
  };
}

export default async function LivePrefecturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pref = PREFECTURES.find((p) => p.slug === slug);
  if (!pref) notFound();

  /*
    ★★**収録していない県は、取りに行く前にここで止める。**
    「取れなかった」と書くと**出典の不調と読み違えられる**（直らない不具合に見える）。
    ★**6県を収録していないのは規約の判断**で、出典の都合ではない。
  */
  const covered = isLiveCovered(slug);
  const board = covered ? await fetchLiveBoard(slug) : null;
  /*
    ★**学校マスタは公立だけ。** 引けた校名に印を付けるために使う。
    ★**取れなくても速報は出す**（印が付かないだけ）。出典が生きていることのほうが大事。
  */
  const index = await getSchoolNameIndex("koshien").catch(() => null);

  return (
    <Container className="py-6">
      <Breadcrumb
        items={[
          // ★ Breadcrumb が先頭の「ホーム」を自分で出すので、ここには入れない
          { label: pref.name, href: `/prefectures/${slug}` },
          { label: "試合速報" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{pref.name}の試合速報</h1>
        {/* ★収録していない県では自動更新の操作を出さない（取りに行かないので意味が無い） */}
        {covered && <LiveRefresh />}
      </div>

      <div className="mt-4">
        {!covered ? (
          <p className="rounded-xl border border-line bg-white p-5 text-sm text-ink-muted">
            {pref.name}の試合結果は、このサイトでは収録していません。
            {/* ★**理由を書く。** 「まだ対応していない」と読まれないように（AGENTS の書き方） */}
            高校野球連盟が転載を制限しているため、地方大会の結果を扱っていない県です。
          </p>
        ) : board ? (
          <LiveBoard board={board} index={index} />
        ) : (
          /*
            ★**「試合がありません」と書かないこと。** 取れなかっただけかもしれない。
            **どちらなのか分からない**ので、分からないと書く。
          */
          <p className="rounded-xl border border-line bg-white p-5 text-sm text-ink-muted">
            いま速報を取れませんでした。出典が止まっているか、この県の大会が開かれていません。
          </p>
        )}
      </div>

      <p className="mt-4 text-sm">
        <Link
          href={`/prefectures/${slug}`}
          className="inline-flex items-center gap-1 font-bold text-navy-800 underline"
        >
          <MapPinned size={16} aria-hidden />
          {pref.name}のページ（過去の大会・学校一覧）
        </Link>
      </p>
    </Container>
  );
}
