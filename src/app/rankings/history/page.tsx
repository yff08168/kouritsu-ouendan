import type { Metadata } from "next";
import { LineChart } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { AdSlot } from "@/components/ads/AdSlot";
import { PublicShareChart } from "@/components/rankings/PublicShareChart";
import { RankingList } from "@/components/rankings/RankingList";
import { DataNote } from "@/components/rankings/DataNote";

import {
  aggregateByDecade,
  getKoshienDataset,
  longAbsence,
  recentAppearances,
} from "@/lib/queries/rankings";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "公立の甲子園、100年の移り変わり",
  description:
    "甲子園の出場校に公立高校が占める割合は、100年でどう変わったのか。大会ごとの推移と年代別の平均、久しく甲子園から遠ざかっている名門校まで。",
  alternates: { canonical: "/rankings/history" },
};

export default async function HistoryPage() {
  const dataset = await getKoshienDataset();
  const decades = aggregateByDecade(dataset.years);
  const recent = recentAppearances(dataset.schools, 10);
  const absent = longAbsence(dataset.schools, { minAppearances: 5, limit: 10 });

  const first = decades[0];
  const last = decades[decades.length - 1];
  const shareOf = (d: (typeof decades)[number]) => d.publicSchools / d.totalSchools;
  const maxShare = Math.max(...decades.map(shareOf), 0.01);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "公立の甲子園、100年の移り変わり" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <LineChart size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            公立の甲子園、100年の移り変わり
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          甲子園に出場する学校のうち、公立高校はどれくらいを占めてきたのか。
          第1回大会から現在までの推移を並べました。
          {first && last && (
            <>
              　{first.decade}年代には出場校の
              {Math.round(shareOf(first) * 100)}%が公立でしたが、
              {last.decade}年代は{Math.round(shareOf(last) * 100)}%です。
            </>
          )}
        </p>
      </header>

      <section
        aria-labelledby="chart-heading"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="chart-heading" className="text-sm font-bold text-navy-800">
          大会ごとの推移
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          縦軸は、その大会の出場校のうち公立が占めた割合です。
        </p>
        <PublicShareChart className="mt-4" years={dataset.years} />
      </section>

      <section
        aria-labelledby="decade-heading"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="decade-heading" className="text-sm font-bold text-navy-800">
          年代ごとの平均
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          1大会ごとの数字は代表校の入れ替わりで上下します。10年ぶんをまとめると傾向が見えます。
        </p>

        <ol className="mt-4 space-y-1.5">
          {decades.map((decade) => {
            const share = shareOf(decade);
            return (
              <li key={decade.decade} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-navy-800">
                  {decade.decade}年代
                </span>
                <span
                  aria-hidden="true"
                  className="h-4 rounded-r bg-navy-600"
                  style={{ width: `${(share / maxShare) * 100}%`, minWidth: "2px" }}
                />
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                  {Math.round(share * 100)}%
                  <span className="ml-1 text-ink-faint">
                    （{decade.publicSchools}／{decade.totalSchools}校）
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="recent-heading"
          className="rounded-xl border border-line bg-white p-5"
        >
          <h2 id="recent-heading" className="text-sm font-bold text-navy-800">
            最近甲子園に出た公立高校
          </h2>
          <p className="mt-1 text-xs text-ink-muted">出場が新しい順</p>
          <RankingList
            className="mt-2"
            rows={recent.map((stats, index) => ({ rank: index + 1, stats }))}
            valueOf={(s) => s.total}
            formatValue={(s) => `${s.lastYear}年`}
            formatNote={(s) => `通算${s.total}回出場　${s.wins}勝`}
          />
        </section>

        <section
          aria-labelledby="absent-heading"
          className="rounded-xl border border-line bg-white p-5"
        >
          <h2 id="absent-heading" className="text-sm font-bold text-navy-800">
            長く甲子園から遠ざかっている学校
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            5回以上出場した学校のうち、最後の出場が古い順
          </p>
          <RankingList
            className="mt-2"
            rows={absent.map((stats, index) => ({ rank: index + 1, stats }))}
            valueOf={(s) => s.total}
            formatValue={(s) => `${s.lastYear}年`}
            formatNote={(s) =>
              `通算${s.total}回出場　最高 ${s.best ? s.best.result : "不明"}`
            }
          />
        </section>
      </div>

      <DataNote className="mt-4">
        <li>
          分母（全出場校数）も分子（公立の出場校数）も同じ出典から数えています。
          分子は取りこぼしのぶんだけ少なめに出るため、割合も実際よりやや低く出ます。
        </li>
        <li>
          中止になった大会（1918年・1941年・2020年）は、1試合も行われていないため含めていません。
        </li>
        <li>
          <strong className="text-ink">
            「公立」は、その学校が現在も公立であるかどうかで判定しています。
          </strong>
          戦前の旧制中学校のうち、のちに私立になった学校は数えていません。
          1910〜20年代は大会数も出場校数も少ないため、割合が大きく振れます。
        </li>
      </DataNote>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
