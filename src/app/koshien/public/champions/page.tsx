import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Medal, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { NationalDataNote } from "@/components/results/NationalDataNote";
import { KoshienStat } from "@/components/results/KoshienStat";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";

import {
  buildPublicChampionsLead,
  listPublicChampions,
  seasonLabel,
  venueLabel,
  type PublicFinalEntry,
} from "@/lib/koshien-public";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 甲子園で優勝した公立高校の一覧（`/koshien/public/champions`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-09-21。運営者の指示）
 *
 *   キーワードプランナーで「甲子園 優勝回数 ランキング」が月平均1,600・8月12,100。
 *   このサイトは私立を収録していないので全国の順位は書けないが、
 *   **公立高校が優勝した大会の一覧**は決勝の記録と校名索引から描ける。
 *
 * ★ 数え方は大会ページと同じ（`finalists` ＋ `getSchoolNameIndex("koshien")`）。
 * ★ 「ランキング」と書かない。私立を収録していないので順位ではない（AGENTS.md）。
 *   優勝回数の多い順に並べるが、それは「この一覧の中での」並びであることを注記する。
 * ★ 「甲子園」と書けるのは 1925年から（`venueLabel`）。それより前の優勝は注記を付ける。
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const index = await getSchoolNameIndex("koshien");
  const data = listPublicChampions((d, p) => index.find(d, p));
  const title = "甲子園で優勝した公立高校の一覧（春・夏の歴代）";
  const description = buildPublicChampionsLead(data).slice(0, 2).join("");
  return {
    title,
    description,
    alternates: { canonical: "/koshien/public/champions" },
    openGraph: { type: "website", title: `${title}｜公立応援団`, description },
  };
}

export default async function KoshienPublicChampionsPage() {
  const index = await getSchoolNameIndex("koshien");
  const data = listPublicChampions((d, p) => index.find(d, p));
  const lead = buildPublicChampionsLead(data);
  const spring = data.champions.filter((e) => e.tournament.season === "spring").length;
  const summer = data.champions.length - spring;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "公立高校の出場校", href: "/koshien/public" },
          { label: "優勝した公立高校" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">歴代</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          甲子園で優勝した公立高校
        </h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <KoshienStat label="公立が優勝した大会" value={`${data.champions.length}`} unit="大会" accent />
          <KoshienStat label="夏の選手権" value={`${summer}`} unit="大会" />
          <KoshienStat label="春の選抜" value={`${spring}`} unit="大会" />
        </dl>
      </header>

      <LeadText paragraphs={lead} />

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection", "tournament-rules"]} />

      {/* ------- 優勝した大会 ------- */}
      <section
        aria-labelledby="pc-list"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pc-list"
          title="公立高校が優勝した大会"
          icon={<Trophy size={18} />}
          note="新しい順"
        />
        <FinalTable entries={data.champions} role="champion" />
        <p className="mt-3 text-xs text-ink-faint">
          校名は出典の大会記事の表記です。1924年以前の大会は球場が甲子園ではありません。
        </p>
      </section>

      {/* ------- 優勝回数の多い公立校 ------- */}
      {data.bySchool.length > 0 && (
        <section
          aria-labelledby="pc-schools"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pc-schools"
            title="優勝回数の多い公立高校"
            icon={<Medal size={18} />}
            note="この一覧の中での並び"
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.bySchool.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/schools/${s.slug}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-accent-800">{s.name}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {s.entries
                        .map((e) => `${e.tournament.year}${e.tournament.season === "spring" ? "春" : "夏"}`)
                        .join("・")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-navy-800">
                    {s.count}
                    <span className="ml-0.5 text-xs font-normal text-ink-muted">回</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            このサイトは私立を収録していないので、全国での順位ではありません。
            統廃合や校名変更で現在の学校に引き継いだ出場歴は、現在の校名で数えています。
          </p>
        </section>
      )}

      <AdSlot slot="sidebar" />

      {/* ------- 準優勝 ------- */}
      {data.runnersUp.length > 0 && (
        <section
          aria-labelledby="pc-runners"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pc-runners"
            title="公立高校が準優勝した大会"
            icon={<CalendarDays size={18} />}
            note="新しい順"
          />
          <FinalTable entries={data.runnersUp} role="runnerUp" />
        </section>
      )}

      <NationalDataNote className="mt-4" />
    </Container>
  );
}

function FinalTable({ entries, role }: { entries: PublicFinalEntry[]; role: "champion" | "runnerUp" }) {
  if (entries.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">該当する大会はありません。</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">大会</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">優勝</th>
            <th scope="col" className="py-1.5 pr-3 font-medium tabular-nums">決勝</th>
            <th scope="col" className="py-1.5 font-medium">準優勝</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const t = e.tournament;
            const champ = role === "champion" ? e.school : null;
            const runner = role === "runnerUp" ? e.school : null;
            return (
              <tr key={t.slug} className="border-b border-line last:border-0 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <Link href={`/koshien/${t.slug}`} className="text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800">
                    {t.year}年 {seasonLabel(t)}
                  </Link>
                  {venueLabel(t.year) !== "甲子園" && (
                    <span className="ml-1 text-[0.6875rem] text-ink-faint">甲子園以前</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {champ ? (
                    <Link href={`/schools/${champ.slug}`} className="font-bold text-accent-800 underline decoration-line underline-offset-2">
                      {e.champion}
                    </Link>
                  ) : (
                    <span className="text-ink">{e.champion}</span>
                  )}
                </td>
                <td className="py-2 pr-3 tabular-nums text-ink">{e.score ?? ""}</td>
                <td className="py-2">
                  {runner ? (
                    <Link href={`/schools/${runner.slug}`} className="font-bold text-accent-800 underline decoration-line underline-offset-2">
                      {e.runnerUp}
                    </Link>
                  ) : (
                    <span className="text-ink">{e.runnerUp}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
