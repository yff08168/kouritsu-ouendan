import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPinned, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { LeadText } from "@/components/common/LeadText";
import { LiveBoard } from "@/components/results/LiveBoard";
import { LiveRefresh } from "@/components/results/LiveRefresh";
import { ALL_DISTRICT_SLUGS } from "@/lib/constants";
import { fetchLiveBoard, fetchStadiumNames, livePrefectures } from "@/lib/live/hsb";
import { getSchoolNameIndex } from "@/lib/queries/schools";
import { buildLiveLead } from "@/lib/live-lead";
import { findLiveTournamentHref } from "@/lib/live-tournament";

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
/*
  ★★★**このページはキャッシュしない**（2026-09-08。運営者から
  「法政二の試合がこのページでは0-0だけど、遷移すると7-0になってる。更新がずれてる」）。

  ------------------------------------------------------------------
  ★★ なぜ「ページのキャッシュ」と「取得のキャッシュ」を重ねてはいけないか

  **2つを直列にすると、遅れが足し算になる:**

      ① ページ（ISR 60秒）  … 期限が切れたあと、**次の1人には古いほうを返し**、
                              裏で作り直す（stale-while-revalidate）
      ② 取得（fetch 60秒）  … 作り直すときに読むのは、**最大60秒前の盤**

  **本番のヘッダで実測** —— `X-Vercel-Cache: STALE` / `Age: 67`。
  そのとき**出典は5回表、うちの画面は4回表**だった（1イニングぶん遅れていた）。

  ★★★**試合ごとのページ（`/live/<県>/<token>`）はこれを持っていない**ので、
  **いつも新しい。** 同じ試合が**盤では 0-0、開くと 7-0** になるのはこれが理由。

  ------------------------------------------------------------------
  ★★**取得のキャッシュは残す。** 出典を叩くのは今までどおり**60秒に1回**で、
  **訪問者が何人いても増えない**（負荷の約束は変えていない）。
  **毎回作り直すのはHTMLだけ**で、読むのは60秒以内の盤。**遅れの上限が半分になる。**

  ★**描くのは速い** —— 盤の取得はキャッシュ当たり、学校マスタの索引も
  モジュールに5分持っている（`fetchSchoolNameRows`）。
  ★**2026-09-06 に置いた空の `generateStaticParams` はここで外した。**
  **戻さないこと** —— 戻すと①が復活して、また盤だけが遅れる。
*/
export const dynamic = "force-dynamic";

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

      ★★**「結果」も入れる**（2026-09-06）。**同じ人が日中は「速報」で、
      夜は「結果」で探す。** この盤は終わった試合もその日の分は載せているので、
      **どちらの語も画面の中身と合っている。**
      ★**過去の大会の結果は `/prefectures/<県>` が持つ**（住み分けはあちらのコメント）。
    */
    title: `${name}の高校野球 試合速報・結果`,
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
  const [board, index, stadiums] = await Promise.all([
    fetchLiveBoard(slug),
    /*
      ★**学校マスタは公立だけ。** 引けた校名に印を付けるために使う。
      ★**取れなくても速報は出す**（印が付かないだけ）。出典が生きていることのほうが大事。
    */
    getSchoolNameIndex("koshien").catch(() => null),
    /*
      ★**球場名の略称の対応表**（2026-09-07。盤の球場欄が `メ 09:00` のように1文字）。
      ★★**取り直す間隔は1日**（`fetchStadiumNames`）。**盤の60秒に引きずらせない** ——
      Next は**ページの中でいちばん短い間隔**を採るので、ここを短くする意味が無い。
      ★**ここも並べて待つ**（直列にすると足し算になる）。
    */
    fetchStadiumNames(slug).catch(() => null),
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
  /*
    ★★**県まで渡して引く**（2026-09-08）。**渡さないと `橘` のように
    全国に2つ以上ある校名が引けず、公立なのに数に入らない**（盤の太字も同じ）。
  */
  const publicCount = index
    ? (board?.games.filter((g) => index.find(g.first, pref.name) || index.find(g.third, pref.name))
        .length ?? 0)
    : null;
  const lead = buildLiveLead({ board, name: title, publicCount });

  /*
    ★★**盤が出している大会のページ**（2026-09-08。運営者の指示）。
    ★**盤を取ったあとに引く**（大会名が要る）。**生成物を読むだけ**なので出典は叩かない。
    ★**決められなければ null**（下の県ページへのリンクが受け皿になる）。
  */
  const tournamentHref = board
    ? await findLiveTournamentHref(slug, board.tournament).catch(() => null)
    : null;

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
          ★**「結果」まで入れた**（2026-09-06。title と語をそろえる。
          理由は `generateMetadata` のコメント）。
        */}
        {/*
          ★**語のまとまりで折り返す**（2026-09-06）。日本語はどこでも改行できるので、
          そのままだと**375px幅で「…試合速報・結」「果」と1文字だけ落ちる**（実測）。
          ★**`whitespace-nowrap` を2つに分けて、県名と「試合速報・結果」の
          あいだで折り返させる。** `<br>` で決め打ちしないこと ——
          県名の長さが「北北海道」から「三重」まで幅3文字ぶん違う。
        */}
        <h1 className="text-2xl font-bold">
          <span className="whitespace-nowrap">{title}の高校野球</span>{" "}
          <span className="whitespace-nowrap">試合速報・結果</span>
        </h1>
        <LiveRefresh />
      </div>

      {/*
        ★★**リード文**（`src/lib/live-lead.ts`）。**その日の状態で段落の構成が変わる。**
        ★**組み立てをここに書かないこと**（規則が2か所に散る）。
      */}
      <LeadText paragraphs={lead} label="この画面の見かた" />

      <div className="mt-4">
        {board ? (
          <LiveBoard
            board={board}
            index={index}
            pref={pref.name}
            stadiums={stadiums}
            tournamentHref={tournamentHref}
          />
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

      {/*
        ★**次にどこへ行けるか**（2026-09-08 に大会のページを足した）。
        ★**大会 → 県 の順**。速報を見に来た人がいちばん見たいのは
        **いま進んでいる大会のトーナメント表**で、県のページはその外側。
      */}
      {(tournamentHref || districtHref) && (
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {tournamentHref && (
            <Link
              href={tournamentHref}
              className="inline-flex items-center gap-1 font-bold text-navy-800 underline"
            >
              <Trophy size={16} aria-hidden />
              この大会のページ（トーナメント表・全試合）
            </Link>
          )}
          {districtHref && (
            <Link
              href={districtHref}
              className="inline-flex items-center gap-1 font-bold text-navy-800 underline"
            >
              <MapPinned size={16} aria-hidden />
              {pref.name}のページ（過去の大会・学校一覧）
            </Link>
          )}
        </p>
      )}
    </Container>
  );
}
