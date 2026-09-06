import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPinned } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { LeadText } from "@/components/common/LeadText";
import { LiveBoard } from "@/components/results/LiveBoard";
import { LiveRefresh } from "@/components/results/LiveRefresh";
import { ALL_DISTRICT_SLUGS } from "@/lib/constants";
import { fetchLiveBoard, livePrefectures } from "@/lib/live/hsb";
import { getSchoolNameIndex } from "@/lib/queries/schools";
import { buildLiveLead } from "@/lib/live-lead";

/**
 * 県の速報ページ。
 *
 * ------------------------------------------------------------------
 * ★★★**このルートだけ「描くときに取りに行く」。** 他のページは生成物を読む。
 * ★**`revalidate = 60`** —— 出典を叩く間隔は `hsb.ts` の `fetch` が持っており、
 *   **試合時間帯（8〜20時）以外は30分**になる。ここはページの焼き直しの間隔。
 * ★**静的生成しない**（`generateStaticParams` を置かない）。
 *   **47県ぶんを1分ごとに焼き直すことになる。** 見られている県だけでよい。
 */
export const revalidate = 60;

/*
  ★★★**空の `generateStaticParams` を置く**（2026-09-06。**これが無いとキャッシュされない**）。

  この版の Next は、**`generateStaticParams` の無い動的な区間を「毎回サーバーで作る」**
  として扱う。**`revalidate` を書いても効かない。** 手元の本番ビルドで測ると:

      /live                （動的な区間なし）        … s-maxage=300 で作り置き
      /prefectures/<県>    （generateStaticParams あり）… 同上
      /live/<県>           （**無い**）              … private, no-store（毎回作成）

  ★**空の配列を返すのが要点** —— **ビルドでは1枚も作らない**（47県ぶんの盤を
  ビルド時に取りに行かないし、**作り置きが何時間も前の盤になることもない**）。
  **最初に開かれたときに作り、そのあとは `revalidate` の間隔で作り直す。**

  ★★**「本当に直ったか」はヘッダで確かめること**（`cache-control` と
  Vercel の `x-vercel-cache`）。**画面を見ても分からない。**
*/
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pref = livePrefectures().find((p) => p.slug === slug);
  if (!pref) return {};
  /*
    ★**同じ `fetch` は1リクエストの中でまとめられる**ので、本文と2回叩くことにはならない。
    ★★**中身から description を作る** —— 47県が同じ定型文だと、
    **県名しか違いが無く「◯◯ 高校野球 速報」の検索で区別が付かない**
    （県のページで 2026-08-29 に直したのと同じ話）。
  */
  const board = await fetchLiveBoard(slug);
  const name = board?.name ?? pref.name;
  const playing = board?.games.filter((g) => g.playing).length ?? 0;
  const description = [
    `${name}の高校野球の試合速報。`,
    board?.tournament ? `${board.tournament}を` : "地方大会を",
    board && board.games.length > 0
      ? `${board.day ?? "今日"}${board.games.length}試合、イニングごとの得点つきで出しています。`
      : "イニングごとの得点つきで出しています。",
    playing > 0 ? `いま${playing}試合が進行中です。` : "",
    "公立・国立の高校が出ている試合は校名を太字にしています。",
  ].join("");

  return {
    /*
      ★★**「速報」を見出しの語に入れる**（検索されるのは「◯◯ 高校野球 速報」）。
      ★**県名 → 競技 → 速報 の順**。読んだときに何のページか分かる並びにする。
    */
    title: `${name}の高校野球 試合速報`,
    description,
    alternates: { canonical: `/live/${slug}` },
    /*
      ★★★**このページは検索に載せる**（2026-09-05）。
      **URLは県ごとに固定**で、中身が毎日変わるのは新聞の速報面と同じ。
      ★**中身が入れ替わるページを noindex にすると、
      「◯◯ 高校野球 速報」という検索がまるごと取れない**（この機能の主な入口）。
      ★**試合ごとのページ（`/live/<県>/<token>`）は別で、あちらは noindex のまま** ——
      **トークンに期限が入っており、URLが数時間で無効になる。**
    */
  };
}

export default async function LivePrefecturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  /*
    ★★**速報は県単位**（47件）。甲子園の区分で割れている4地区（北北海道など）は
    `liveSlugOf` で `hokkaido` / `tokyo` に寄せてからここへ来る。
  */
  const pref = livePrefectures().find((p) => p.slug === slug);
  if (!pref) notFound();

  /*
    ★★★**2つの待ちを直列にしないこと**（2026-09-06。運営者から「遷移に時間がかかる」）。
    **出典の取得**（〜0.3秒。詰まると8秒で打ち切り）と
    **学校マスタの校名索引**（Supabase に4リクエスト。〜1.5秒）は**互いに関係が無い。**
    ★**直列に `await` すると足し算になる。** 並べれば長いほうだけで済む。
    ★**このページは `revalidate = 60` で、しかも47県ぶんある** ——
    **初めて開かれた県は作り置きが無いので、この待ち時間がそのまま画面の遅さになる。**
  */
  const [board, index] = await Promise.all([
    fetchLiveBoard(slug),
    /*
      ★**学校マスタは公立だけ。** 引けた校名に印を付けるために使う。
      ★**取れなくても速報は出す**（印が付かないだけ）。出典が生きていることのほうが大事。
    */
    getSchoolNameIndex("koshien").catch(() => null),
  ]);

  /*
    ★**県のページがある地区だけリンクする。**
    ★**`hokkaido` / `tokyo` にもページができた**（2026-09-05 その2。春季・秋季の置き場所）。
  */
  const districtHref = ALL_DISTRICT_SLUGS.includes(slug) ? `/prefectures/${slug}` : null;
  // ★**夏は盤の大会名から「北北海道」などになる**（`boardName`）
  const title = board?.name ?? pref.name;
  /*
    ★**公立が絡む試合の数**（リード文に使う）。
    ★**索引が引けなかったときは null**（0と書かない。当て推量をしない）。
  */
  const publicCount = index
    ? (board?.games.filter((g) => index.find(g.first) || index.find(g.third)).length ?? 0)
    : null;
  const lead = buildLiveLead({ board, name: title, publicCount });

  return (
    <Container className="py-6">
      <Breadcrumb
        items={[
          // ★ Breadcrumb が先頭の「ホーム」を自分で出すので、ここには入れない
          { label: pref.name, ...(districtHref ? { href: districtHref } : {}) },
          { label: "試合速報" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/*
          ★**見出しは「◯◯の高校野球 試合速報」**（2026-09-05）。
          「◯◯の試合速報」だけだと**何の競技か書いていない** ——
          このサイトの他のページと違い、速報は県名＋競技名で探される。
        */}
        <h1 className="text-2xl font-bold">{title}の高校野球 試合速報</h1>
        <LiveRefresh />
      </div>

      {/*
        ★★**リード文**（`src/lib/live-lead.ts`）。**その日の状態で段落の構成が変わる。**
        ★**組み立てをここに書かないこと**（規則が2か所に散る）。
      */}
      <LeadText paragraphs={lead} label="この画面の見かた" />

      <div className="mt-4">
        {board ? (
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

      {districtHref && (
        <p className="mt-4 text-sm">
          <Link
            href={districtHref}
            className="inline-flex items-center gap-1 font-bold text-navy-800 underline"
          >
            <MapPinned size={16} aria-hidden />
            {pref.name}のページ（過去の大会・学校一覧）
          </Link>
        </p>
      )}
    </Container>
  );
}
