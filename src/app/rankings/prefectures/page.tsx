import type { Metadata } from "next";
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { AdSlot } from "@/components/ads/AdSlot";
import { SegmentedNav } from "@/components/rankings/SegmentedNav";
import { PrefectureHeatMap } from "@/components/rankings/PrefectureHeatMap";
import { DataNote } from "@/components/rankings/DataNote";

import { aggregateByPrefecture, getKoshienDataset } from "@/lib/queries/rankings";
import { getSchoolCountByPrefecture } from "@/lib/queries/schools";
import type { PrefectureKoshienStats } from "@/types/app";

export const revalidate = 86400;

/** 地図に出す指標。URLに残すのでキーは変えない。 */
const METRICS = {
  appearances: {
    label: "出場回数",
    unit: "回",
    of: (s: PrefectureKoshienStats) => s.appearances,
    description: "その地区の公立高校が甲子園に出場した延べ回数",
  },
  wins: {
    label: "勝利数",
    unit: "勝",
    of: (s: PrefectureKoshienStats) => s.wins,
    description: "その地区の公立高校が甲子園で挙げた通算勝利数",
  },
  schools: {
    label: "出場校数",
    unit: "校",
    of: (s: PrefectureKoshienStats) => s.schools,
    description: "甲子園に出たことのある公立高校の数",
  },
} as const;

type Metric = keyof typeof METRICS;

type SearchParams = { metric?: string };
type Props = { searchParams: Promise<SearchParams> };

function parseMetric(value: string | undefined): Metric {
  return value === "wins" || value === "schools" ? value : "appearances";
}

function buildHref(metric: Metric): string {
  return metric === "appearances"
    ? "/rankings/prefectures"
    : `/rankings/prefectures?metric=${metric}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const metric = parseMetric((await searchParams).metric);
  return {
    title: `都道府県別の甲子園記録（${METRICS[metric].label}）`,
    description:
      "公立高校の甲子園記録を都道府県別に集計しました。出場回数・勝利数・出場校数を日本地図の形に色分けして比べられます。",
    alternates: { canonical: buildHref(metric) },
  };
}

export default async function PrefectureRankingPage({ searchParams }: Props) {
  const metric = parseMetric((await searchParams).metric);
  const [dataset, registered] = await Promise.all([
    getKoshienDataset(),
    getSchoolCountByPrefecture(),
  ]);

  const stats = aggregateByPrefecture(dataset.schools);
  const selected = METRICS[metric];

  const values: Record<string, number> = {};
  for (const row of stats) values[row.slug] = selected.of(row);

  const sorted = [...stats].sort(
    (a, b) => selected.of(b) - selected.of(a) || b.appearances - a.appearances,
  );

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "都道府県別の甲子園記録" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <MapIcon size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            都道府県別の甲子園記録
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          公立勢がどの地域で甲子園に出ているかを、地図の形に色分けしました。
          北海道は北・南、東京は東・西に分かれています（甲子園の代表校の区分に合わせています）。
        </p>

        <SegmentedNav
          className="mt-4"
          label="地図に出す指標"
          activeKey={metric}
          segments={(Object.keys(METRICS) as Metric[]).map((key) => ({
            key,
            label: METRICS[key].label,
            href: buildHref(key),
          }))}
        />
      </header>

      <section
        aria-labelledby="map-heading"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="map-heading" className="text-sm font-bold text-navy-800">
          {selected.label}の分布
        </h2>
        <p className="mt-1 text-xs text-ink-muted">{selected.description}</p>
        <PrefectureHeatMap
          className="mt-4"
          values={values}
          unit={selected.unit}
          metricLabel={selected.label}
        />
      </section>

      <section
        aria-labelledby="table-heading"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="table-heading" className="text-sm font-bold text-navy-800">
          地区ごとの記録
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">
              甲子園の大会区分49地区ごとの、公立高校の出場回数・勝利数・出場校数・最高成績
            </caption>
            <thead>
              <tr className="border-b border-line-strong text-xs text-ink-muted">
                <th scope="col" className="py-2 pr-2 text-left font-bold">
                  地区
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  出場
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  勝利
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  出場校
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  収録校
                </th>
                <th scope="col" className="px-2 py-2 text-left font-bold">
                  最高成績
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.slug} className="border-b border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-bold">
                    <Link
                      href={`/prefectures/${row.slug}`}
                      className="text-navy-800 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="ml-1 text-[0.6875rem] font-normal text-ink-faint">
                      {row.region}
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.appearances}
                    <span className="text-[0.6875rem] text-ink-faint">
                      （春{row.spring}/夏{row.summer}）
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.wins}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.schools}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                    {registered[row.slug] ?? 0}
                  </td>
                  <td className="px-2 py-2 text-left text-xs">
                    {row.best ? (
                      <>
                        {row.best.result}
                        <span className="ml-1 text-ink-faint">（{row.best.year}年）</span>
                      </>
                    ) : (
                      <span className="text-ink-faint">－</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DataNote className="mt-4">
        <li>
          「収録校」はその地区の公立高校の総数です。出場校数と比べると、
          その地区で何校に1校が甲子園を経験しているかが分かります。
        </li>
        <li>
          学校の所在地ではなく<strong className="text-ink">甲子園の代表地区</strong>
          で分けています。北海道と東京は2地区に分かれます。
        </li>
      </DataNote>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
