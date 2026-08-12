import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { AdSlot } from "@/components/ads/AdSlot";
import { RankingList } from "@/components/rankings/RankingList";
import { SegmentedNav } from "@/components/rankings/SegmentedNav";
import { DataNote } from "@/components/rankings/DataNote";

import {
  APPEARANCE_SCOPES,
  countOf,
  getKoshienDataset,
  rankByAppearances,
  rankByWinRate,
  rankByWins,
  type AppearanceScope,
} from "@/lib/queries/rankings";
import type { SchoolKoshienStats } from "@/types/app";

export const revalidate = 86400;

/** 何で並べるか。URLに残すのでキーは変えない。 */
const METRICS = {
  appearances: { label: "出場回数", heading: "甲子園出場回数ランキング" },
  wins: { label: "勝利数", heading: "甲子園通算勝利数ランキング" },
  rate: { label: "勝率", heading: "甲子園通算勝率ランキング" },
} as const;

type Metric = keyof typeof METRICS;

/** 勝率ランキングの試合数の下限。1回出て1勝0敗の学校が首位に来ないようにする。 */
const MIN_GAMES = 10;

/** 一覧に出す件数。全部（700校）出すと縦に長くなりすぎる。 */
const LIMIT = 100;

type SearchParams = { season?: string; metric?: string };
type Props = { searchParams: Promise<SearchParams> };

function parseScope(value: string | undefined): AppearanceScope {
  return value === "spring" || value === "summer" ? value : "total";
}

function parseMetric(value: string | undefined): Metric {
  return value === "wins" || value === "rate" ? value : "appearances";
}

function buildHref(scope: AppearanceScope, metric: Metric): string {
  const params = new URLSearchParams();
  if (scope !== "total") params.set("season", scope);
  if (metric !== "appearances") params.set("metric", metric);
  const query = params.toString();
  return query ? `/rankings/koshien?${query}` : "/rankings/koshien";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const scope = parseScope(params.season);
  const metric = parseMetric(params.metric);
  const scopeLabel = APPEARANCE_SCOPES[scope].label;

  return {
    title:
      metric === "appearances"
        ? `${METRICS[metric].heading}（${scopeLabel}）`
        : METRICS[metric].heading,
    description:
      "全国の公立高校の甲子園出場回数ランキング。春の選抜・夏の選手権・通算のそれぞれで並べ替えられます。通算勝利数と勝率のランキングもあります。",
    alternates: { canonical: buildHref(scope, metric) },
  };
}

export default async function KoshienRankingPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = parseScope(params.season);
  const metric = parseMetric(params.metric);
  const dataset = await getKoshienDataset();

  // 勝利数・勝率は春夏を分けない。試合数が減って順位が偶然に左右されるため。
  const rows =
    metric === "wins"
      ? rankByWins(dataset.schools)
      : metric === "rate"
        ? rankByWinRate(dataset.schools, MIN_GAMES)
        : rankByAppearances(dataset.schools, scope);

  const visible = rows.slice(0, LIMIT);

  const valueOf = (stats: SchoolKoshienStats) =>
    metric === "wins" ? stats.wins : metric === "rate" ? (stats.winRate ?? 0) : countOf(stats, scope);

  const formatValue = (stats: SchoolKoshienStats) =>
    metric === "wins"
      ? `${stats.wins}勝`
      : metric === "rate"
        ? `.${String(Math.round((stats.winRate ?? 0) * 1000)).padStart(3, "0")}`
        : `${countOf(stats, scope)}回`;

  const formatNote = (stats: SchoolKoshienStats) => {
    /*
     * 春だけで並べているときに通算の最高成績を出すと、
     * 「春29回・最高 準優勝（夏の記録）」のようにちぐはぐになる。
     * 見ている季の最高成績を出す。
     */
    const best =
      metric !== "appearances" || scope === "total"
        ? stats.best
        : scope === "spring"
          ? stats.bestSpring
          : stats.bestSummer;
    const seasonLabel =
      metric !== "appearances" || scope === "total"
        ? "最高"
        : scope === "spring"
          ? "春の最高"
          : "夏の最高";

    const parts = [
      metric === "appearances" && scope === "total"
        ? `春${stats.spring}回・夏${stats.summer}回`
        : `通算${stats.total}回`,
      // 敗戦数は出さない（AGENTS.md「勝敗は勝利数だけを出す」）
      `${stats.wins}勝`,
      best ? `${seasonLabel} ${best.result}（${best.year}年）` : `${seasonLabel}成績は不明`,
      stats.lastYear ? `最後の出場 ${stats.lastYear}年` : null,
    ];
    return parts.filter(Boolean).join("　");
  };

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: METRICS[metric].heading },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Trophy size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            {METRICS[metric].heading}
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          全国の公立高校を、甲子園の出場回数が多い順に並べています。
          春（選抜）・夏（選手権）・通算と、通算勝利数・勝率でも見られます。
        </p>

        <SegmentedNav
          className="mt-4"
          label="並べ替える指標"
          activeKey={metric}
          segments={(Object.keys(METRICS) as Metric[]).map((key) => ({
            key,
            label: METRICS[key].label,
            href: buildHref(scope, key),
          }))}
        />

        {metric === "appearances" && (
          <SegmentedNav
            className="mt-2"
            label="春・夏の切り替え"
            activeKey={scope}
            segments={(Object.keys(APPEARANCE_SCOPES) as AppearanceScope[]).map((key) => ({
              key,
              label: APPEARANCE_SCOPES[key].label,
              href: buildHref(key, metric),
            }))}
          />
        )}
      </header>

      <section aria-labelledby="ranking-body" className="mt-4 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ranking-body" className="text-sm font-bold text-navy-800">
            {metric === "appearances"
              ? `${APPEARANCE_SCOPES[scope].label}の出場回数`
              : metric === "wins"
                ? "甲子園通算勝利数"
                : "甲子園通算勝率"}
          </h2>
          <p className="text-xs text-ink-muted">
            {rows.length > LIMIT ? (
              <>
                上位 <strong className="text-ink">{LIMIT}</strong> 校（該当{" "}
                {rows.length.toLocaleString("ja-JP")} 校）
              </>
            ) : (
              <>該当 {rows.length.toLocaleString("ja-JP")} 校</>
            )}
          </p>
        </div>

        {metric === "rate" && (
          <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-muted">
            出場が少ない学校が上位に並ばないよう、
            <strong className="text-ink">通算{MIN_GAMES}試合以上</strong>
            の学校だけを対象にしています。勝率は「勝利数 ÷ 試合数」で、
            成績が不明な出場は分母にも分子にも入れていません。
          </p>
        )}

        <RankingList
          className="mt-2"
          rows={visible}
          valueOf={valueOf}
          formatValue={formatValue}
          formatNote={formatNote}
        />
      </section>

      <DataNote className="mt-4">
        <li>
          同じ回数（勝利数）の学校は同じ順位にしています。3位が2校いれば次は5位です。
        </li>
      </DataNote>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
