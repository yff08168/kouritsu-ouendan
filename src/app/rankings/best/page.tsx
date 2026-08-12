import type { Metadata } from "next";
import { Medal } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { AdSlot } from "@/components/ads/AdSlot";
import { SegmentedNav } from "@/components/rankings/SegmentedNav";
import { SchoolChips } from "@/components/rankings/SchoolChips";
import { DataNote } from "@/components/rankings/DataNote";

import {
  APPEARANCE_SCOPES,
  getKoshienDataset,
  groupByBestResult,
  type AppearanceScope,
} from "@/lib/queries/rankings";
import { RESULT_NOTE } from "@/lib/koshien";
import type { KoshienBest, SchoolKoshienStats } from "@/types/app";

export const revalidate = 86400;

/**
 * ここまでは学校名を開いた状態で出す段階。
 * これより下は該当校が100を超えるので、折りたたみにしてページの頭を軽くする。
 */
const OPEN_UNTIL = 4;

type SearchParams = { season?: string };
type Props = { searchParams: Promise<SearchParams> };

function parseScope(value: string | undefined): AppearanceScope {
  return value === "spring" || value === "summer" ? value : "total";
}

function buildHref(scope: AppearanceScope): string {
  return scope === "total" ? "/rankings/best" : `/rankings/best?season=${scope}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const scope = parseScope((await searchParams).season);
  return {
    title: `甲子園の最高成績で見る公立高校（${APPEARANCE_SCOPES[scope].label}）`,
    description:
      "全国の公立高校を、甲子園でどこまで勝ち進んだかで分類した一覧。優勝・準優勝・ベスト4・ベスト8と、到達した段階ごとに学校が分かります。",
    alternates: { canonical: buildHref(scope) },
  };
}

export default async function BestResultPage({ searchParams }: Props) {
  const scope = parseScope((await searchParams).season);
  const dataset = await getKoshienDataset();
  const groups = groupByBestResult(dataset.schools, scope);

  const bestOf = (s: SchoolKoshienStats): KoshienBest | null =>
    scope === "spring" ? s.bestSpring : scope === "summer" ? s.bestSummer : s.best;

  // 段階が確定しない出場しかない学校。初戦敗退と混ぜないので別に数える。
  const unknown = dataset.schools.filter((s) => bestOf(s) === null).length;
  const largest = Math.max(...groups.map((g) => g.schools.length), 1);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "春夏の最高成績" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Medal size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            春夏の最高成績
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          甲子園でどこまで勝ち進んだか、その学校の一番よい成績で分類しました。
          春（選抜）と夏（選手権）は別々にも見られます。
        </p>

        <SegmentedNav
          className="mt-4"
          label="春・夏の切り替え"
          activeKey={scope}
          segments={(Object.keys(APPEARANCE_SCOPES) as AppearanceScope[]).map((key) => ({
            key,
            label: APPEARANCE_SCOPES[key].label,
            href: buildHref(key),
          }))}
        />
      </header>

      {/* 到達段階ごとの学校数。上に行くほど狭き門であることを棒の長さで見せる。 */}
      <section
        aria-labelledby="ladder-heading"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="ladder-heading" className="text-sm font-bold text-navy-800">
          どこまで行った学校が何校あるか
        </h2>
        <ol className="mt-3 space-y-1.5">
          {groups.map((group) => (
            <li key={group.result} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-xs font-bold text-navy-800">
                {group.result}
              </span>
              <span
                aria-hidden="true"
                className="h-4 rounded-r bg-navy-600"
                style={{ width: `${(group.schools.length / largest) * 100}%`, minWidth: "2px" }}
              />
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                {group.schools.length}校
              </span>
            </li>
          ))}
        </ol>
      </section>

      {groups.map((group, index) => (
        <section
          key={group.result}
          aria-labelledby={`group-${index}`}
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 id={`group-${index}`} className="text-base font-bold text-navy-800">
              {group.result}
            </h2>
            {RESULT_NOTE[group.result] && (
              <span className="text-xs text-ink-muted">{RESULT_NOTE[group.result]}</span>
            )}
            <span className="ml-auto text-xs tabular-nums text-ink-muted">
              {group.schools.length}校
            </span>
          </div>

          {index < OPEN_UNTIL ? (
            <SchoolChips
              className="-m-0.5 mt-3"
              schools={group.schools}
              annotate={(s) => {
                const best = bestOf(s);
                return best ? `${best.year}年` : null;
              }}
            />
          ) : (
            <details className="mt-2">
              <summary className="cursor-pointer py-1 text-xs font-bold text-navy-700 hover:underline">
                {group.schools.length}校を表示する
              </summary>
              <SchoolChips
                className="-m-0.5 mt-2"
                schools={group.schools}
                annotate={(s) => {
                  const best = bestOf(s);
                  return best ? `${best.year}年` : null;
                }}
              />
            </details>
          )}
        </section>
      ))}

      <DataNote className="mt-4">
        <li>
          <strong className="text-ink">
            成績が確定しない出場しかない学校（{unknown}校）はどの段階にも入れていません。
          </strong>
          「出場したが記録が足りない」を「初戦敗退」と混ぜないためです。
        </li>
        <li>
          到達段階は、その試合が決勝から何試合前かを勝敗のつながりから逆算して決めています。
          シードや不戦勝の影響を受けません。
        </li>
      </DataNote>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
