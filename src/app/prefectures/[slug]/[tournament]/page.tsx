import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, GitBranch, ListOrdered } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { RegionalBracket } from "@/components/results/RegionalBracket";
import { RegionalGameList } from "@/components/results/RegionalGameList";
import { TournamentLinks } from "@/components/results/TournamentLinks";
import { LeadText } from "@/components/common/LeadText";

import { PREFECTURES } from "@/lib/constants";
import { getPrefectureBySlug } from "@/lib/queries/prefectures";
import { getRegionalDistrict, seasonLabel } from "@/lib/regional-results";
import { buildRegionalBracket } from "@/lib/regional-bracket";
import {
  findTournament,
  listTournaments,
  summarizeTournament,
} from "@/lib/regional-tournaments";
import { buildTournamentLead } from "@/lib/tournament-lead";

/**
 * 1つの大会のページ（`/prefectures/<県>/<年-季節>`）。
 *
 * ------------------------------------------------------------------
 * ★★ 県のページとの役割分担
 *
 *   県のページ … **いちばん新しい大会**だけを出す（回遊の入口）
 *   ここ       … **その大会の全試合**と、組めればトーナメント表
 *
 *   県のページに全大会を積むと、応援メッセージや投票がずっと下になる。
 *   **過去の大会は「見に行くもの」**なので、ページを分けている。
 *
 * ------------------------------------------------------------------
 * ★★ 試合は絞らない
 *
 *   県のページは24件までにしているが、**ここは全部出す。**
 *   この大会を見に来た人に「一部です」と返す理由が無い。
 *
 * ------------------------------------------------------------------
 * ★ 私立の試合も出す
 *
 *   **枝が切れるので落とせない**（2026-08-21 の方針変更）。
 *   着目するところは `RegionalBracket` / `RegionalGameList` が
 *   **公立をオレンジにする**ことで示している。
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string; tournament: string }>;
};

/**
 * ★**全県ぶんの大会を静的に作る。**
 * 実測150大会ほどで、学校ページ（3,500件）に比べれば小さい。
 *
 * ★**`getRegionalDistrict` は県ごとの動的 import**なので、
 * ここで全県を読んでも1つのページに全国ぶんが入ることはない。
 */
export async function generateStaticParams() {
  const out: { slug: string; tournament: string }[] = [];
  for (const p of PREFECTURES) {
    const district = await getRegionalDistrict(p.slug);
    if (!district) continue;
    for (const t of listTournaments(district)) {
      out.push({ slug: p.slug, tournament: t.slug });
    }
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, tournament } = await params;
  const district = await getRegionalDistrict(slug);
  const entry = district ? findTournament(district, tournament) : null;
  if (!district || !entry) return {};

  // ★**画面に出すのは `displayName`**（出典のページ見出しを落としたもの）
  const title = entry.displayName ?? `${entry.year ?? ""}年${seasonLabel(entry.season)}`;

  /*
    ★★**description に実際の数字を入れる**（2026-08-29）。

    それまでは**600件の大会ページが全部同じ定型文**だった。
    「2025 神奈川 高校野球 決勝」「◯◯県大会 優勝」のような検索は、
    **その大会にしか無い言葉**（年・優勝校・試合数）でしか当たらない。

    ★★**読み取れなかったものは書かない。**
    優勝校は決勝が1試合だけ読めているときにしか出さない
    （`summarizeTournament`）。**当て推量を検索結果に出さない。**
  */
  const s = summarizeTournament(entry);
  const bracket = buildRegionalBracket(entry.games);

  /*
    ★★**年を必ず入れる。** 狙っているのは「2025 神奈川 高校野球 決勝」のような
    **年つきの検索**で、大会名だけでは当たらない
    （`第108回…` と書かれていても、探す人は西暦で打つ）。
    ★**大会名に既に西暦が入っている県がある**ので、そのときは重ねない
    （大阪は `…大阪大会〔令和7(2025)年〕`）。
  */
  const hasYear = entry.year != null && title.includes(String(entry.year));
  const label = [entry.year != null && !hasYear ? `${entry.year}年` : "", district.district]
    .filter(Boolean)
    .join("・");

  const description = [
    `${title}（${label}）の結果。`,
    `${s.teams}校が出場し、${s.games}試合を掲載しています。`,
    s.champion ? `優勝は${s.champion}。` : "",
    // ★**「トーナメント表」は検索語として強い。組めた大会でだけ書く**
    bracket
      ? "トーナメント表と全試合のスコア、公立高校の勝ち上がりが分かります。"
      : "全試合のスコアと、公立高校の勝ち上がりが分かります。",
  ].join("");

  return {
    // ★**title にも年を入れる**（description より効くため。重複するときは足さない）
    title: entry.year != null && !hasYear
      ? `${title}（${entry.year}年）｜${district.district}`
      : `${title}｜${district.district}`,
    description,
    alternates: { canonical: `/prefectures/${slug}/${tournament}` },
  };
}

export default async function TournamentPage({ params }: Props) {
  const { slug, tournament } = await params;
  const [prefecture, district] = await Promise.all([
    getPrefectureBySlug(slug),
    getRegionalDistrict(slug),
  ]);
  if (!prefecture || !district) notFound();

  const entry = findTournament(district, tournament);
  if (!entry) notFound();

  /*
    ★**枝は「組めたときだけ」出す**（2026-08-22 の決めごと）。
    ブロック予選・出典に載っていない試合がある・校名が一意でない、
    のいずれかで組めない。**「だいたい合っている表」は出さない。**
  */
  const bracket = buildRegionalBracket(entry.games);

  const title = entry.displayName ?? `${entry.year ?? ""}年${seasonLabel(entry.season)}の大会`;
  // ★**description と同じ関数で数える**（画面と検索結果で数が食い違わないように）
  const publicGames = summarizeTournament(entry).publicGames;

  /*
    ★★**リード文**（2026-08-29 その3 追加）。**このページ唯一の地の文。**
    組み立ての規則は `src/lib/tournament-lead.ts`。
    ★**`hasBracket` を渡すのは、組めていない大会に「トーナメント表が見られます」と
    書かせないため** —— 画面の断り書きと食い違う。
  */
  const lead = buildTournamentLead({ district, entry, title, hasBracket: Boolean(bracket) });

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "都道府県", href: "/prefectures" },
          { label: prefecture.name, href: `/prefectures/${slug}` },
          { label: title },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">
          {prefecture.name}・{seasonLabel(entry.season)}
          {entry.year != null && `　${entry.year}年`}
        </p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          全{entry.games.length}試合
          {publicGames > 0 && `（公立が絡む試合 ${publicGames}件）`}
        </p>
      </header>

      <LeadText paragraphs={lead} />

      {/* ------- トーナメント表（枝が組めた大会だけ） ------- */}
      {bracket ? (
        <section
          aria-labelledby="t-bracket"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="t-bracket"
            title="トーナメント表"
            icon={<GitBranch size={18} />}
          />
          <RegionalBracket bracket={bracket} />
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-navy-50 p-4 text-sm text-ink-muted">
          この大会はトーナメント表を組めていません。
          ブロックに分かれている大会や、出典に載っていない試合がある大会では、
          <strong>確かでない表を出さない</strong>ようにしています。
        </p>
      )}

      <AdSlot slot="sidebar" />

      {/* ------- 全試合 ------- */}
      <section
        aria-labelledby="t-games"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="t-games"
          title="全試合"
          icon={<ListOrdered size={18} />}
        />
        <RegionalGameList games={entry.games} />
      </section>

      <OtherTournaments slug={slug} current={entry.slug} district={district} />
    </Container>
  );
}

/** 同じ県の他の大会への導線。**回遊を切らさない。** */
function OtherTournaments({
  slug,
  current,
  district,
}: {
  slug: string;
  current: string;
  district: NonNullable<Awaited<ReturnType<typeof getRegionalDistrict>>>;
}) {
  const others = listTournaments(district).filter((t) => t.slug !== current);
  if (!others.length) return null;

  return (
    <section
      aria-labelledby="t-others"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <SectionHeading
        id="t-others"
        title={`${district.district}の他の大会`}
        icon={<CalendarDays size={18} />}
        moreHref={`/prefectures/${slug}`}
      />
      <div className="mt-3">
        {/* ★大会のページでは早めに年でまとめる（本文は「その大会」なので、ここは索引） */}
        <TournamentLinks prefectureSlug={slug} entries={others} groupFrom={4} />
      </div>
    </section>
  );
}
