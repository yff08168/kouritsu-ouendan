import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { NationalDataNote } from "@/components/results/NationalDataNote";
import { PublicEntrantList } from "@/components/results/PublicEntrantList";
import { KoshienStat } from "@/components/results/KoshienStat";
import { cn } from "@/lib/utils";

import {
  buildPublicIndexLead,
  listPublicYearsWithEntrants,
  seasonLabel,
  type PublicYear,
} from "@/lib/koshien-public";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 甲子園に出場した公立高校の年別一覧（`/koshien/public`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-09-21）
 *
 *   「公立高校 甲子園」の受け皿。**いちばん新しい年の出場校をこのページに直接置く**
 *   （8月に探しに来る人が見たいのは今年の夏の出場校）。過去の年は年ごとのページへ。
 *
 * ★ 10年ごとに `<details>` でまとめる（`KoshienTournamentList` と同じ理由）。
 *   **タブ（JavaScript）にしないこと。** `<details>` なら畳んだままでも
 *   `Ctrl+F` で当たり、クローラからも見える。
 * ★ 公立が1校も結び付かない年は一覧に載せない（`listPublicYearsWithEntrants`）。
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const index = await getSchoolNameIndex("koshien");
  const years = listPublicYearsWithEntrants((d, p) => index.find(d, p));
  const title = "公立高校の甲子園出場校と成績（年別）";
  const description = buildPublicIndexLead(years).slice(0, 2).join("");
  return {
    title,
    description,
    alternates: { canonical: "/koshien/public" },
    openGraph: { type: "website", title: `${title}｜公立応援団`, description },
  };
}

export default async function KoshienPublicIndexPage() {
  const index = await getSchoolNameIndex("koshien");
  const years = listPublicYearsWithEntrants((d, p) => index.find(d, p));
  const latest = years[0] ?? null;
  const lead = buildPublicIndexLead(years);
  const entrants = years.reduce((n, y) => n + y.entrantCount, 0);
  const champions = years.reduce((n, y) => n + y.publicChampions, 0);
  const decades = groupByDecade(years);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "公立高校の出場校" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">年別</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          甲子園に出場した公立高校
        </h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <KoshienStat label="年" value={`${years.length}`} unit="年" />
          <KoshienStat
            label="公立の出場（のべ）"
            value={entrants.toLocaleString()}
            unit="校"
          />
          <KoshienStat label="公立が優勝" value={`${champions}`} unit="大会" accent />
        </dl>
      </header>

      <LeadText paragraphs={lead} />

      {/* ------- いちばん新しい年 ------- */}
      {latest &&
        latest.tournaments
          .filter((s) => s.entrants.length > 0)
          .map((s) => {
            const t = s.tournament;
            const badges = new Map<string, string>();
            for (const slug of s.twentyFirst) badges.set(slug, "21世紀枠");
            return (
              <section
                key={t.slug}
                aria-labelledby={`kpi-${t.slug}`}
                className="mt-4 rounded-xl border border-line bg-white p-5"
              >
                <SectionHeading
                  id={`kpi-${t.slug}`}
                  title={`${latest.year}年 ${seasonLabel(t)}に出場した公立高校`}
                  icon={<Trophy size={18} />}
                  note={`公立 ${s.entrants.length}校・勝ち上がった順`}
                  moreHref={`/koshien/public/${latest.year}`}
                  moreLabel="この年のページへ"
                />
                <div className="mt-3">
                  <PublicEntrantList entrants={s.entrants} badges={badges} />
                </div>
              </section>
            );
          })}

      <AdSlot slot="sidebar" />

      {/* ------- 年をたどる ------- */}
      <section
        aria-labelledby="kpi-years"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="kpi-years"
          title="年をたどる"
          icon={<CalendarDays size={18} />}
          note="新しい順"
        />
        <div className="mt-3 space-y-2">
          {decades.map((group, i) => (
            <details
              key={group.decade}
              open={i === 0}
              className="group rounded-lg border border-line"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-navy-800 marker:content-none">
                <span>{group.decade}年代</span>
                <span className="text-xs font-normal text-ink-muted">
                  {group.years.length}年
                  {group.publicChampions > 0 && (
                    <span className="ml-2 text-accent-800">
                      公立優勝 {group.publicChampions}大会
                    </span>
                  )}
                </span>
              </summary>
              <ul className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
                {group.years.map((y) => (
                  <li key={y.year}>
                    <Link
                      href={`/koshien/public/${y.year}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
                    >
                      <span
                        className={cn(
                          "text-sm font-medium",
                          y.publicChampions > 0 ? "text-accent-800" : "text-ink",
                        )}
                      >
                        {y.year}年
                        {y.publicChampions > 0 && (
                          <span className="ml-1.5 text-xs">公立優勝</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {y.tournaments
                          .filter((s) => s.entrants.length > 0)
                          .map(
                            (s) =>
                              `${seasonLabel(s.tournament).slice(0, 1)} ${s.entrants.length}校`,
                          )
                          .join(" ／ ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          1924年以前の大会は球場が甲子園ではないため、年のページでは「全国大会」と書いています。
          公立高校が1校も学校マスタと結び付かない年は、この一覧に入れていません。
        </p>
      </section>

      <NationalDataNote className="mt-4" />
    </Container>
  );
}

type DecadeGroup = {
  decade: number;
  years: PublicYear[];
  publicChampions: number;
};

/** 10年ごとにまとめる。**並びは元のまま**（新しい順で渡ってくる） */
function groupByDecade(years: PublicYear[]): DecadeGroup[] {
  const groups = new Map<number, DecadeGroup>();
  for (const y of years) {
    const decade = Math.floor(y.year / 10) * 10;
    let group = groups.get(decade);
    if (!group) {
      group = { decade, years: [], publicChampions: 0 };
      groups.set(decade, group);
    }
    group.years.push(y);
    group.publicChampions += y.publicChampions;
  }
  return [...groups.values()];
}
