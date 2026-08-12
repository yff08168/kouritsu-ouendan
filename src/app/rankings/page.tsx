import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronRight, Medal, School, Sparkles, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { RankingList } from "@/components/rankings/RankingList";
import { StatTile } from "@/components/rankings/StatTile";
import { PublicShareChart } from "@/components/rankings/PublicShareChart";
import { DataNote } from "@/components/rankings/DataNote";

import { getKoshienDataset, rankByAppearances } from "@/lib/queries/rankings";
import { getSchoolCountByPrefecture } from "@/lib/queries/schools";
import { RANKINGS } from "@/lib/constants";
import { TWENTY_FIRST_CENTURY_BERTHS } from "@/lib/data/twenty-first-century";

// 出場歴が増えるのは年に2回だけ。長めに取って毎回の集計を減らす。
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "記録・ランキング",
  description:
    "全国の公立高校の甲子園記録をまとめたページ。出場回数・通算勝利数・春夏の最高成績・21世紀枠・都道府県別の分布まで、公立高校野球の記録を図で見られます。",
  alternates: { canonical: "/rankings" },
};

export default async function RankingsPage() {
  const [dataset, counts] = await Promise.all([
    getKoshienDataset(),
    getSchoolCountByPrefecture(),
  ]);

  const registered = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const top = rankByAppearances(dataset.schools, "total").slice(0, 10);
  const champions = dataset.schools.filter((s) => s.titles > 0);
  const berthYears = new Set(TWENTY_FIRST_CENTURY_BERTHS.map((b) => b.year));

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "記録・ランキング" }]} />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            記録・ランキング
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          全国の公立高校の甲子園記録を集めました。出場回数、通算勝利数、
          春夏それぞれの最高成績、21世紀枠、都道府県別の分布まで、
          数字と図で見られます。
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="収録している公立高校"
          value={registered.toLocaleString("ja-JP")}
          unit="校"
          note="公立・国立・高専。私立は収録していません"
          icon={<School size={14} />}
          href="/schools"
        />
        <StatTile
          label="甲子園に出た学校"
          value={dataset.schools.length.toLocaleString("ja-JP")}
          unit="校"
          note={`出場は延べ ${dataset.appearanceCount.toLocaleString("ja-JP")} 回`}
          icon={<Medal size={14} />}
          href="/rankings/koshien"
        />
        <StatTile
          label="全国制覇した学校"
          value={champions.length.toLocaleString("ja-JP")}
          unit="校"
          note="春夏どちらかで優勝した公立高校"
          icon={<Trophy size={14} />}
          href="/rankings/best"
        />
        <StatTile
          label="21世紀枠で出場"
          value={TWENTY_FIRST_CENTURY_BERTHS.length.toLocaleString("ja-JP")}
          unit="校"
          note={`2001年の創設から${berthYears.size}大会ぶん`}
          icon={<Sparkles size={14} />}
          href="/rankings/21seiki-waku"
        />
      </div>

      <section
        aria-labelledby="top-appearances"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="top-appearances"
          title="甲子園出場回数トップ10"
          note="春夏通算"
          icon={<Trophy size={18} />}
          moreHref="/rankings/koshien"
          moreLabel="1位から見る"
        />
        <RankingList
          className="mt-2"
          rows={top}
          valueOf={(s) => s.total}
          formatValue={(s) => `${s.total}回`}
          formatNote={(s) =>
            `春${s.spring}回・夏${s.summer}回　通算${s.wins}勝` +
            (s.lastYear ? `　最後の出場 ${s.lastYear}年` : "")
          }
        />
      </section>

      <section
        aria-labelledby="ranking-index"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="ranking-index" className="text-sm font-bold text-navy-800">
          記録のページ
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {RANKINGS.map((ranking) => (
            <li key={ranking.slug}>
              <Link
                href={`/rankings/${ranking.slug}`}
                className="group flex h-full items-start gap-2 rounded-lg border border-line p-3 hover:border-navy-300 hover:bg-navy-50/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-navy-800 group-hover:underline">
                    {ranking.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {ranking.description}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ink-faint"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="share-preview"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="share-preview"
          title="甲子園に占める公立の割合"
          note="大会ごと"
          icon={<BarChart3 size={18} />}
          moreHref="/rankings/history"
        />
        <PublicShareChart className="mt-3" years={dataset.years} />
      </section>

      <DataNote className="mt-4" />

      <AdSlot slot="sidebar" />
    </Container>
  );
}
