import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { AdSlot } from "@/components/ads/AdSlot";
import { StatTile } from "@/components/rankings/StatTile";
import { PrefectureHeatMap } from "@/components/rankings/PrefectureHeatMap";
import { DataNote } from "@/components/rankings/DataNote";

import { appearanceKey, getKoshienDataset } from "@/lib/queries/rankings";
import { PREFECTURES } from "@/lib/constants";
import { resultRank } from "@/lib/koshien";
import {
  CANCELLED_YEARS,
  TWENTY_FIRST_CENTURY_BERTHS,
  TWENTY_FIRST_CENTURY_SOURCE,
} from "@/lib/data/twenty-first-century";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "21世紀枠の出場校",
  description:
    "2001年に始まった21世紀枠で選抜高校野球に出場した学校の一覧。選ばれた年の順に並べ、甲子園での成績と都道府県ごとの分布も見られます。",
  alternates: { canonical: "/rankings/21seiki-waku" },
};

export default async function TwentyFirstCenturyPage() {
  const dataset = await getKoshienDataset();
  const schoolBySlug = new Map(dataset.schools.map((s) => [s.slug, s]));

  // 新しい年が上。学校ページの出場歴と並び順をそろえる。
  const years = [...new Set(TWENTY_FIRST_CENTURY_BERTHS.map((b) => b.year))].sort(
    (a, b) => b - a,
  );

  // 都道府県別の選出回数。地区（甲子園の大会区分）は照合できた学校からしか取れない。
  const byPrefecture: Record<string, number> = {};
  for (const berth of TWENTY_FIRST_CENTURY_BERTHS) {
    const school = berth.schoolSlug ? schoolBySlug.get(berth.schoolSlug) : undefined;
    if (!school) continue;
    byPrefecture[school.prefecture.slug] = (byPrefecture[school.prefecture.slug] ?? 0) + 1;
  }

  // このサイトが収録している学校のうち、21世紀枠での最高成績
  let best: { result: string; year: number; name: string } | null = null;
  for (const berth of TWENTY_FIRST_CENTURY_BERTHS) {
    if (!berth.schoolSlug) continue;
    const record = dataset.resultsByKey.get(
      appearanceKey(berth.schoolSlug, berth.year, "spring"),
    );
    if (!record?.result) continue;
    if (!best || resultRank(record.result) < resultRank(best.result)) {
      best = { result: record.result, year: berth.year, name: berth.displayName };
    }
  }

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "21世紀枠の出場校" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            21世紀枠の出場校
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          21世紀枠は、2001年（第73回）から選抜高等学校野球大会に設けられている選出枠です。
          秋の大会の成績で決まる一般選考とは別に、各都道府県から推薦された学校の中から選ばれます。
          {years.length > 0 && (
            <>
              　{Math.min(...years)}年から{Math.max(...years)}年までに、延べ
              {TWENTY_FIRST_CENTURY_BERTHS.length}校が選ばれました。
            </>
          )}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="選ばれた学校"
          value={String(TWENTY_FIRST_CENTURY_BERTHS.length)}
          unit="校"
          note={`${years.length}大会ぶん。同じ学校が2度選ばれた例はありません`}
        />
        <StatTile
          label="選出のあった地区"
          value={String(Object.keys(byPrefecture).length)}
          unit="地区"
          note={`甲子園の代表49地区のうち。${PREFECTURES.length - Object.keys(byPrefecture).length}地区はまだありません`}
        />
        <StatTile
          label="このサイトに収録"
          value={String(TWENTY_FIRST_CENTURY_BERTHS.filter((b) => b.schoolSlug).length)}
          unit="校"
          note="公立・国立・高専として照合できた数"
        />
        <StatTile
          label="21世紀枠の最高成績"
          value={best?.result ?? "－"}
          note={best ? `${best.year}年 ${best.name}` : "記録が確定していません"}
        />
      </div>

      <section
        aria-labelledby="berth-map"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="berth-map" className="text-sm font-bold text-navy-800">
          都道府県別の選出回数
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          地区をタップすると、その地区の公立高校の一覧に移動します。
        </p>
        <PrefectureHeatMap
          className="mt-4"
          values={byPrefecture}
          unit="回"
          metricLabel="21世紀枠の選出回数"
        />
      </section>

      <section
        aria-labelledby="berth-timeline"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="berth-timeline" className="text-sm font-bold text-navy-800">
          選出された学校（新しい順）
        </h2>

        <ol className="mt-4 space-y-5">
          {years.map((year) => {
            const berths = TWENTY_FIRST_CENTURY_BERTHS.filter((b) => b.year === year);
            const cancelled = CANCELLED_YEARS.includes(year);

            return (
              <li key={year} className="flex gap-3 sm:gap-4">
                {/* 縦の線で年をつなぐ。年表であることを形で示す。 */}
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="text-sm font-bold tabular-nums text-navy-800">
                    {year}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-1 w-px flex-1 bg-line-strong"
                  />
                </div>

                <ul className="min-w-0 flex-1 space-y-2 pb-1">
                  {berths.map((berth) => {
                    const school = berth.schoolSlug
                      ? schoolBySlug.get(berth.schoolSlug)
                      : undefined;
                    const record = berth.schoolSlug
                      ? dataset.resultsByKey.get(
                          appearanceKey(berth.schoolSlug, berth.year, "spring"),
                        )
                      : undefined;

                    const body = (
                      <>
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                          <span className="text-sm font-bold text-ink">
                            {berth.displayName}
                          </span>
                          {/*
                            収録している学校なら、サイト内で統一している地区名
                            （北北海道・西東京など）を使う。地図の色分けと
                            食い違わないようにするため。
                          */}
                          <span className="text-[0.6875rem] text-ink-muted">
                            {school?.prefecture.name ?? berth.prefectureText}
                          </span>
                          {berth.region && (
                            <Badge variant="outline">{berth.region}</Badge>
                          )}
                          {cancelled ? (
                            <Badge variant="navy">大会中止</Badge>
                          ) : record?.result ? (
                            <Badge
                              variant={
                                resultRank(record.result) <= resultRank("ベスト4")
                                  ? "accent"
                                  : "navy"
                              }
                            >
                              {record.result}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                          {cancelled
                            ? "新型コロナウイルスの影響で大会が中止になった年です"
                            : !record
                              ? "このサイトには成績を収録していません"
                              : [
                                  // 敗戦数は出さない（AGENTS.md「勝敗は勝利数だけを出す」）。
                                  // 成績が取れていない出場を「0勝」と書くと負けたように
                                  // 見えるので、分からないことは分からないと書く。
                                  record.result
                                    ? `${record.wins ?? 0}勝`
                                    : "この大会の成績は確定できていません",
                                  school ? `甲子園通算${school.total}回出場` : null,
                                ]
                                  .filter(Boolean)
                                  .join("　")}
                        </p>
                      </>
                    );

                    return (
                      <li key={`${berth.year}-${berth.article}`}>
                        {berth.schoolSlug ? (
                          <Link
                            href={`/schools/${berth.schoolSlug}`}
                            className="group block rounded-lg border border-line p-2.5 hover:border-navy-300 hover:bg-navy-50/40"
                          >
                            {body}
                          </Link>
                        ) : (
                          // 私立などマスタに無い学校。学校ページが無いのでリンクにしない。
                          <div className="rounded-lg border border-dashed border-line p-2.5">
                            {body}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <DataNote className="mt-4">
        <li>
          21世紀枠の一覧の出典は{" "}
          <a
            href={TWENTY_FIRST_CENTURY_SOURCE.url}
            className="underline underline-offset-2 hover:text-accent-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            ウィキペディア日本語版「{TWENTY_FIRST_CENTURY_SOURCE.title}」
          </a>
          （{TWENTY_FIRST_CENTURY_SOURCE.license}）です。取り込んでいるのは年・地区・校名だけで、
          記事に書かれている選考理由の文章は載せていません。
        </li>
        <li>
          学校名は統廃合後の現在の名前に読み替えています。選出された当時の名前とは違う場合があります。
        </li>
        <li>
          リンクのない学校は、このサイトの収録対象（公立・国立・高専）ではない学校です。
        </li>
      </DataNote>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
