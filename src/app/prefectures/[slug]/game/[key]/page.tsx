import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Swords } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { AdSlot } from "@/components/ads/AdSlot";
import { GameScoreboard } from "@/components/results/GameScoreboard";

import { getPrefectureBySlug } from "@/lib/queries/prefectures";
import {
  formatRegionalDate,
  getRegionalDistrict,
  hasInnings,
  seasonLabel,
} from "@/lib/regional-results";
import { findGame } from "@/lib/regional-tournaments";
import { findLiveInnings } from "@/lib/live-innings";
import { vsPath } from "@/lib/head-to-head";

/**
 * 1試合のページ（`/prefectures/<県>/game/<鍵>`）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ「大会」を経由しないURLにしたか**（2026-09-06。運営者の指示で作った）
 *
 * **トップの結果カードは大会の slug を持っていない**（抜粋に入っているのは
 * 大会「名」だけ）。**県のファイルはどのみち丸ごと読む**ので、
 * **県 ＋ 試合の鍵**で引けるようにしてある（`findGame`）。
 * ★**`game` は静的な区間なので `[tournament]` より先に当たる**（大会 slug は
 * `2026-autumn` の形なので、ぶつかることはない）。
 *
 * ------------------------------------------------------------------
 * ★★★**検索インデックスに入れない**（`noindex`）。
 *
 * **試合は7万件以上ある。** 1試合ぶんの中身しか無いページを全部載せると、
 * **サイト全体が「薄いページの山」になる**（`school-index.ts` が避けているのと同じ話）。
 * ★**sitemap にも入れない。** ここは**見に来た人がたどる先**であって、
 * 検索の入口ではない（`/live/<県>/<token>` と同じ扱い）。
 *
 * ------------------------------------------------------------------
 * ★★**空の `generateStaticParams` を置く。**
 * この版の Next は**それが無い動的な区間を「毎回サーバーで作る」**として扱い、
 * **`revalidate` を書いても効かない**（`/live/<県>` で実測した罠）。
 */
/*
  ★★★**キャッシュしない**（2026-09-08。速報から各回の得点を借りるようにしたので）。

  **ページを1時間キャッシュすると、その日の試合を最初に開いた人の
  「まだ取り込めていません」が1時間残る**（`/live/<県>` で踏んだのと同じ話）。
  ★**描くのは速い** —— 県のファイルはモジュールに持っている（`districtCache`）。
  ★**速報を叩くのは「今日の試合」を開いたときだけ**で、その取得も60秒キャッシュ。
  ★**このページは `noindex` で sitemap にも入れていない**ので、
  **作り置きの意味がもともと薄い。**
*/
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; key: string }> };

async function load(slug: string, key: string) {
  const district = await getRegionalDistrict(slug);
  if (!district) return null;
  const found = findGame(district, key);
  return found ? { district, ...found } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, key } = await params;
  const found = await load(slug, key);
  if (!found) return { title: "試合が見つかりません", robots: { index: false, follow: true } };

  const { game, tournament } = found;
  const label = game.teams.map((t) => `${t.display} ${t.score}`).join(" - ");
  const name = tournament.displayName ?? seasonLabel(game.season);

  return {
    title: `${label}｜${name}`,
    description: [
      `${name}${game.round ? `・${game.round}` : ""}の${game.teams.map((t) => t.display).join("と")}の試合結果。`,
      game.date ? `${formatRegionalDate(game.date)}。` : "",
      hasInnings(game) ? "各回の得点も出しています。" : "",
    ].join(""),
    // ★**検索インデックスに入れない**（上の説明を読むこと）
    robots: { index: false, follow: true },
  };
}

export default async function RegionalGamePage({ params }: Props) {
  const { slug, key } = await params;
  const [found, prefecture] = await Promise.all([
    load(slug, key),
    getPrefectureBySlug(slug),
  ]);
  if (!found || !prefecture) notFound();

  const { district, game, tournament } = found;
  const name = tournament.displayName ?? seasonLabel(game.season);
  /*
    ★**2校とも公立のときだけ、直接対決のページへ出せる**
    （あちらは公立どうしの組しか持っていない）。
  */
  const publicPair = game.teams.filter((t) => t.slug && !t.combined);
  const versus =
    publicPair.length === 2 ? vsPath(publicPair[0].slug!, publicPair[1].slug!) : null;

  /*
    ★★★**その日の試合は速報から各回の得点を借りる**（2026-09-08。運営者から
    「スコアボードはないんだっけ？速報では出ているけど」）。

    **取り込みは1日1回（23時）**なので、**その日に終わった試合は夜まで生成物に入らない。**
    ★**速報は同じ試合の箱スコアをすでに出している**ので、そこから借りる。
    ★**見に行くのは「今日の試合」だけ**（`findLiveInnings` が日付で弾く）——
    **試合は7万件以上あり、古い試合まで叩きに行くと出典に迷惑がかかる。**
    ★**照合できなければ何も出さない**（当て推量で別の試合の得点を貼らない）。
  */
  const liveInnings = hasInnings(game) ? null : await findLiveInnings(slug, game);
  const teams = hasInnings(game)
    ? game.teams
    : liveInnings
      ? game.teams.map((t, i) => ({ ...t, innings: liveInnings[i] }))
      : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "都道府県", href: "/prefectures" },
          { label: district.district, href: `/prefectures/${slug}` },
          { label: name, href: `/prefectures/${slug}/${tournament.slug}` },
          { label: "試合" },
        ]}
      />

      <article className="mt-1 rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">
          {name}
          {game.round && `　${game.round}`}
        </p>

        {/*
          ★**見出しは「◯◯ 5 - 1 ◯◯」。** 校名を切らない（AGENTS の決めごと）ので、
          狭い画面では折り返す。
        */}
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {game.teams.map((t, i) => (
            <span key={i}>
              {i > 0 && <span className="px-2 text-ink-muted">-</span>}
              <span className={t.won ? "text-accent-800" : undefined}>
                {t.display} {t.score}
              </span>
            </span>
          ))}
        </h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          {game.date && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} aria-hidden="true" className="text-accent-500" />
              {formatRegionalDate(game.date)}
            </span>
          )}
          {game.venue && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} aria-hidden="true" className="text-accent-500" />
              {game.venue}
            </span>
          )}
        </p>

        {/*
          ★★**各回の得点は「持っている試合」だけ**（`GameScoreboard` の説明）。
          ★**無いときは、無いと書く。** 黙って何も出さないと、
          **読み込みに失敗したのか、もともと無いのかが分からない。**
        */}
        <div className="mt-5">
          {teams ? (
            /*
              ★**出典の行は 2026-09-06 に運営者の判断で画面から外した。**
              **データ側（`game.inningsSource`）は残してある**ので、戻すのはここだけ。
              文言は「各回の得点の出典：◯◯（スコアは◯◯）」だった
              （スコアは連盟・各回は速報、という試合が528件ある）。
              ★**結果カードの出典の行を 2026-08-21 に外したのと同じ判断。**
            */
            <GameScoreboard teams={teams} />
          ) : (
            /*
              ★★**「出典が合計得点だけを出しているため」と書かないこと**（2026-09-08）。
              **その日の試合は、速報が箱スコアを出していても夜まで取り込まれない**
              （取り込みは1日1回）。**そう書くと事実でないことを言うことになる。**
              ★**上の `liveInnings` でその日のぶんは補うようにしたが、
              照合できなかったときはここに来る。** 分かることだけ書く。
            */
            <p className="rounded-lg border border-line bg-navy-50/40 p-4 text-sm leading-relaxed text-ink-muted">
              この試合の各回の得点は、まだ取り込めていません。
            </p>
          )}
        </div>

        {/* ★**学校ページへの入口。** 公立・国立の学校だけリンクになる */}
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {game.teams.map((t, i) => (
            <li key={i}>
              {t.slug && !t.combined ? (
                <Link
                  href={`/schools/${t.slug}`}
                  className="flex min-h-11 items-center justify-between rounded-lg border border-line px-4 text-sm font-bold text-navy-800 hover:bg-navy-50"
                >
                  {t.name}の野球部
                  <span className="text-xs font-normal text-ink-faint">戦績を見る</span>
                </Link>
              ) : (
                <span className="flex min-h-11 items-center rounded-lg border border-line px-4 text-sm text-ink-muted">
                  {t.display}
                </span>
              )}
            </li>
          ))}
        </ul>

        {versus && (
          <Link
            href={versus}
            className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"
          >
            <Swords size={16} aria-hidden="true" className="text-accent-500" />
            この2校の対戦成績
          </Link>
        )}
      </article>

      <Link
        href={`/prefectures/${slug}/${tournament.slug}`}
        className="mt-4 flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"
      >
        {name}の全試合とトーナメント表
      </Link>

      <AdSlot slot="school-detail-bottom" />
    </Container>
  );
}
