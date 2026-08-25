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

import { PREFECTURES } from "@/lib/constants";
import { getPrefectureBySlug } from "@/lib/queries/prefectures";
import { getRegionalDistrict, seasonLabel } from "@/lib/regional-results";
import { buildRegionalBracket } from "@/lib/regional-bracket";
import { findTournament, listTournaments } from "@/lib/regional-tournaments";

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

  const title = entry.name ?? `${entry.year ?? ""}年${seasonLabel(entry.season)}`;
  return {
    title: `${title}｜${district.district}`,
    description: `${title}の試合結果とトーナメント表。公立高校の勝ち上がりが分かるようにしています。`,
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

  const title = entry.name ?? `${entry.year ?? ""}年${seasonLabel(entry.season)}の大会`;
  const publicGames = entry.games.filter((g) =>
    g.teams.some((t) => t.slug && !t.combined),
  ).length;

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
        <TournamentLinks prefectureSlug={slug} entries={others} initial={6} />
      </div>
    </section>
  );
}
