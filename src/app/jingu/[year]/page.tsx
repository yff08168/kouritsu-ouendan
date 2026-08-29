import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, GitBranch, ListOrdered, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { RegionalBracket } from "@/components/results/RegionalBracket";
import { RegionalGameList } from "@/components/results/RegionalGameList";
import { PublicEntrantList } from "@/components/results/PublicEntrantList";

import {
  finalists,
  findJinguTournament,
  listJinguTournaments,
  publicEntrants,
  toRegionalGames,
} from "@/lib/national-tournaments";
import { jinguPrefectureOf } from "@/lib/jingu-games";
import { buildRegionalBracket } from "@/lib/regional-bracket";
import { buildNationalLead } from "@/lib/national-lead";
import { LeadText } from "@/components/common/LeadText";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/** 1つの明治神宮大会のページ（`/jingu/<年>`）。作りは甲子園の大会ページと同じ */
export const revalidate = 3600;

type Props = {
  params: Promise<{ year: string }>;
};

export async function generateStaticParams() {
  return listJinguTournaments().map((t) => ({ year: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const t = findJinguTournament(year);
  if (!t) return { title: "大会が見つかりません" };

  const f = finalists(t);
  const description = [
    `${t.name}の全${t.games.length}試合の結果。`,
    f ? `優勝は${f.champion}、決勝の相手は${f.runnerUp}。` : "",
    "出場した公立高校の成績もまとめています。",
  ].join("");

  return {
    title: t.name,
    description,
    alternates: { canonical: `/jingu/${t.slug}` },
    openGraph: { type: "article", title: `${t.name}｜公立応援団`, description },
  };
}

export default async function JinguTournamentPage({ params }: Props) {
  const { year } = await params;
  const t = findJinguTournament(year);
  if (!t) notFound();

  const index = await getSchoolNameIndex("jingu");
  /*
    ★**神宮の出典は県を書いていない**ので、甲子園の生成物から借りた県で引く
    （`jinguPrefectureOf`。県が1つに決まる校名だけ借りる）。
  */
  const resolve = (display: string, pref?: string) =>
    index.find(display, pref ?? jinguPrefectureOf(display));

  const games = toRegionalGames(t, resolve);
  const bracket = buildRegionalBracket(games);
  const entrants = publicEntrants(t, resolve);
  const f = finalists(t);

  const championIsPublic = f ? Boolean(resolve(f.champion)) : false;
  /*
    ★★**リード文**（2026-08-29 その3 追加）。**このページ唯一の地の文。**
    組み立ての規則は `src/lib/national-lead.ts`。
  */
  const lead = buildNationalLead({
    tournament: t,
    entrants,
    finalists: f,
    championIsPublic,
    hasBracket: Boolean(bracket),
  });

  const all = listJinguTournaments();
  const at = all.findIndex((x) => x.slug === t.slug);
  const newer = at > 0 ? all[at - 1] : null;
  const older = at >= 0 && at < all.length - 1 ? all[at + 1] : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "明治神宮大会", href: "/jingu" },
          { label: `${t.year}年` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">{t.year}年　秋</p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {t.name}
        </h1>

        {f && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="flex items-baseline gap-1.5">
              <Trophy
                size={15}
                aria-hidden="true"
                className="translate-y-0.5 text-accent-500"
              />
              <span className="text-ink-muted">優勝</span>
              <strong
                className={
                  championIsPublic
                    ? "text-base font-bold text-accent-800"
                    : "text-base font-bold text-navy-800"
                }
              >
                {f.champion}
              </strong>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-ink-muted">準優勝</span>
              <span className="font-medium text-ink">{f.runnerUp}</span>
            </span>
          </p>
        )}

        <p className="mt-2 text-sm text-ink-muted">
          収録している試合 {t.games.length}件
          {entrants.length > 0 && (
            <>
              {" ／ "}
              <span className="text-accent-800">公立 {entrants.length}校</span>
            </>
          )}
        </p>
      </header>

      <LeadText paragraphs={lead} />

      {entrants.length > 0 && (
        <section
          aria-labelledby="j-public"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="j-public"
            title="この大会に出場した公立高校"
            icon={<Trophy size={18} />}
          />
          <div className="mt-3">
            <PublicEntrantList entrants={entrants} />
          </div>
        </section>
      )}

      {bracket && (
        <section
          aria-labelledby="j-bracket"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="j-bracket"
            title={`${t.name}　トーナメント表`}
            icon={<GitBranch size={18} />}
          />
          <RegionalBracket bracket={bracket} />
        </section>
      )}

      <AdSlot slot="sidebar" />

      <section
        aria-labelledby="j-games"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="j-games"
          title="全試合"
          icon={<ListOrdered size={18} />}
        />
        <RegionalGameList games={games} />
      </section>

      <section
        aria-labelledby="j-others"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="j-others"
          title="ほかの大会"
          icon={<CalendarDays size={18} />}
          moreHref="/jingu"
          moreLabel="大会一覧へ"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[older, newer].filter((x) => x !== null).map((other) => (
            <li key={other.slug}>
              <Link
                href={`/jingu/${other.slug}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {other.name}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {other.games.length}試合
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
