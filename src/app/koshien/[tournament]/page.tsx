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
import { NationalDataNote } from "@/components/results/NationalDataNote";
import { PublicEntrantList } from "@/components/results/PublicEntrantList";

import {
  finalists,
  findKoshienTournament,
  listKoshienTournaments,
  publicEntrants,
  supplementSource,
  toRegionalGames,
} from "@/lib/national-tournaments";
import { buildRegionalBracket } from "@/lib/regional-bracket";
import { buildNationalLead } from "@/lib/national-lead";
import { LeadText } from "@/components/common/LeadText";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 1つの甲子園大会のページ（`/koshien/<年-季節>`）。
 *
 * ------------------------------------------------------------------
 * ★★ 地方大会のページ（`/prefectures/<県>/<大会>`）と同じ作りにしてある
 *
 *   見出し → 出場した公立校 → トーナメント表 → 全試合。
 *   部品も同じもの（`RegionalBracket` / `RegionalGameList`）を使う。
 *   ★**利用者から見て「大会のページ」は1種類**であるべきで、
 *   全国大会と地方大会で並びや色が変わる理由が無い。
 *
 * ------------------------------------------------------------------
 * ★ 試合は絞らない
 *
 *   この大会を見に来た人に「一部です」と返さない（地方大会と同じ）。
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ tournament: string }>;
};

export async function generateStaticParams() {
  return listKoshienTournaments().map((t) => ({ tournament: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tournament } = await params;
  const t = findKoshienTournament(tournament);
  if (!t) return { title: "大会が見つかりません" };

  const f = finalists(t);
  const description = [
    `${t.name}（${t.year}年）の全${t.games.length}試合の結果とトーナメント表。`,
    f ? `優勝は${f.champion}、準優勝は${f.runnerUp}。` : "",
    "出場した公立高校の成績もまとめています。",
  ].join("");

  return {
    title: t.name,
    description,
    alternates: { canonical: `/koshien/${t.slug}` },
    openGraph: { type: "article", title: `${t.name}｜公立応援団`, description },
  };
}

export default async function KoshienTournamentPage({ params }: Props) {
  const { tournament } = await params;
  const t = findKoshienTournament(tournament);
  if (!t) notFound();

  const index = await getSchoolNameIndex("koshien");
  /*
    ★**県が分かるときは一致を要求する**（2026-08-26）。
    大会記事の校名は略称で、**別の県の同名校に当たる**
    （2003年夏の「金沢」＝石川の私立が、横浜市立金沢として出ていた）。
  */
  const resolve = (display: string, pref?: string) => index.find(display, pref);

  const games = toRegionalGames(t, resolve);
  /*
    ★**枝は「組めたときだけ」出す**（地方大会と同じ決めごと）。
    ★**古い大会は回戦の名前が付いていない試合がある**ので、そこは組めない。
    **「だいたい合っている表」は出さない。**
  */
  const bracket = buildRegionalBracket(games);
  const entrants = publicEntrants(t, resolve);
  const f = finalists(t);

  // ★この大会だけ出所が違うなら、画面に出す
  const source = supplementSource(t);
  const championIsPublic = f ? Boolean(resolve(f.champion, f.championPref)) : false;
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

  const all = listKoshienTournaments();
  const at = all.findIndex((x) => x.slug === t.slug);
  // ★一覧は新しい順なので、次の大会は手前にある
  const newer = at > 0 ? all[at - 1] : null;
  const older = at >= 0 && at < all.length - 1 ? all[at + 1] : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[{ label: "甲子園の記録", href: "/koshien" }, { label: t.name }]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">
          {t.year}年　{t.season === "spring" ? "春の選抜" : "夏の選手権"}
        </p>
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
              {championIsPublic && (
                <span className="text-xs text-accent-800">公立</span>
              )}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-ink-muted">準優勝</span>
              <span className="font-medium text-ink">{f.runnerUp}</span>
            </span>
          </p>
        )}

        <p className="mt-2 text-sm text-ink-muted">
          収録している試合 {t.games.length}件
          {t.reference && (
            <>
              {" ／ "}
              出場校 {t.reference.schoolCount}校
            </>
          )}
          {entrants.length > 0 && (
            <>
              {" ／ "}
              <span className="text-accent-800">公立 {entrants.length}校</span>
            </>
          )}
        </p>
      </header>

      <LeadText paragraphs={lead} />

      {/* ------- 出場した公立校 ------- */}
      {entrants.length > 0 && (
        <section
          aria-labelledby="k-public"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="k-public"
            title="この大会に出場した公立高校"
            icon={<Trophy size={18} />}
            note="勝ち上がった順"
          />
          <div className="mt-3">
            <PublicEntrantList entrants={entrants} />
          </div>
        </section>
      )}

      {/* ------- トーナメント表 ------- */}
      {bracket ? (
        <section
          aria-labelledby="k-bracket"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="k-bracket"
            title={`${t.name}　トーナメント表`}
            icon={<GitBranch size={18} />}
          />
          <RegionalBracket bracket={bracket} />
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-navy-50 p-4 text-sm text-ink-muted">
          この大会はトーナメント表を組めていません。
          出典の記事に回戦の名前が入っていない試合がある大会では、
          <strong>確かでない表を出さない</strong>ようにしています。
          下の全試合はそのまま読めます。
        </p>
      )}

      <AdSlot slot="sidebar" />

      {/* ------- 全試合 ------- */}
      <section
        aria-labelledby="k-games"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="k-games"
          title="全試合"
          icon={<ListOrdered size={18} />}
        />
        <RegionalGameList games={games} />
      </section>

      <NationalDataNote className="mt-4" source={source} />

      {/* ------- 前後の大会 ------- */}
      <section
        aria-labelledby="k-others"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="k-others"
          title="ほかの大会"
          icon={<CalendarDays size={18} />}
          moreHref="/koshien"
          moreLabel="大会一覧へ"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[older, newer].filter((x) => x !== null).map((other) => (
            <li key={other.slug}>
              <Link
                href={`/koshien/${other.slug}`}
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
