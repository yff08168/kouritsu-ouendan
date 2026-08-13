import Link from "next/link";
import { BookOpen, School, Search, Star } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Hero } from "@/components/layout/Hero";
import { SectionHeading } from "@/components/common/SectionHeading";
import { XFollowCard } from "@/components/common/XFollowCard";
import { AdSlot } from "@/components/ads/AdSlot";
import { LiveResultsCard } from "@/components/results/LiveResultsCard";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { PrefectureMap } from "@/components/schools/PrefectureMap";
import { PhenomenonRanking } from "@/components/phenomenon/PhenomenonRanking";
import { FeatureCard } from "@/components/features/FeatureCard";

import { LIVE_RESULTS } from "@/lib/data/live-results";
import { statusBySlug } from "@/lib/live-results";
import {
  getSchoolsBySlugs,
  getSchoolCountByPrefecture,
} from "@/lib/queries/schools";
import { getHighlightedPhenomena } from "@/lib/queries/phenomena";
import { getLatestFeatures } from "@/lib/queries/features";
import {
  getKoshienDataset,
  latestPublicByPrefecture,
} from "@/lib/queries/rankings";

// 一覧系は10分ごとに作り直す。ニュース更新の反映と負荷のバランス。
export const revalidate = 600;

export default async function HomePage() {
  const [phenomena, prefectureCounts, features, koshien] = await Promise.all([
    getHighlightedPhenomena(3),
    getSchoolCountByPrefecture(),
    getLatestFeatures(4),
    getKoshienDataset(),
  ]);

  /*
    「今夏の甲子園に出場している公立校」。
    大会が終わって次の春が入るまではその夏の出場校を出し続ける。

    **出場歴（DB）から作る。** 結果速報（Wikipedia由来の生成物）だけだと、
    初戦がまだの学校が落ちる。並びは「勝ち残り→勝ち数の多い順」にして、
    いま追いかける価値のある学校を上に置く。
  */
  const liveStatus = statusBySlug(LIVE_RESULTS);
  const summerSchools = koshien.schools
    .filter(
      (s) => koshien.latestYear != null && s.lastSummerYear === koshien.latestYear,
    )
    .sort((a, b) => {
      const sa = liveStatus.get(a.slug);
      const sb = liveStatus.get(b.slug);
      return (
        Number(sb?.alive ?? false) - Number(sa?.alive ?? false) ||
        (sb?.wins ?? 0) - (sa?.wins ?? 0) ||
        a.name.localeCompare(b.name, "ja")
      );
    });
  const summerCards = await getSchoolsBySlugs(summerSchools.map((s) => s.slug));

  const latestByPrefecture = latestPublicByPrefecture(koshien.schools);
  /*
    「今年」は今日の日付ではなく、**出場歴が入っている最も新しい年**で決める。
    1月〜3月は今年の大会がまだ1つも無いので、日付で判定すると
    どの地区も色が付かず、色分けの説明だけが浮いてしまう。
  */
  const thisYear = koshien.latestYear;
  const bothSeasons = Object.values(latestByPrefecture).filter(
    (entry) =>
      thisYear != null &&
      entry.spring?.year === thisYear &&
      entry.summer?.year === thisYear,
  ).length;

  return (
    <>
      {/*
        PCでは「ヒーロー」と「公立旋風」を横並びにする。
        スマホでは要件9の順序どおり、ヒーロー → 公立旋風 → 最新ニュース … と縦に並ぶ。
      */}
      <Container className="pt-5 sm:pt-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <Hero />
          <PhenomenonRanking phenomena={phenomena} />
        </div>
      </Container>

      <Container className="mt-4 sm:mt-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/*
            結果速報。
            DBのニュースではなく、Wikipediaから自動生成した試合結果を出す。
            公立校が絡む試合だけに絞ってあるのがこのサイトの切り口。
          */}
          <LiveResultsCard results={LIVE_RESULTS} />

          {/*
            今夏の甲子園に出場している公立校。
            以前は「甲子園出場回数の多い順」の3校を出していたが、
            **大会期間中に見たいのは殿堂ではなく「いま出ている学校」。**
          */}
          <section
            aria-labelledby="featured-heading"
            className="rounded-xl border border-line bg-white p-4 sm:p-5"
          >
            <SectionHeading
              id="featured-heading"
              title={
                koshien.latestYear
                  ? `${koshien.latestYear}年夏の出場校`
                  : "注目の公立高校"
              }
              icon={<Star size={22} />}
              moreHref="/schools?koshien=yes&sort=recent"
            />
            <p className="mt-1 text-sm text-ink-muted">
              甲子園に出場している公立校
              {summerCards.length > 0 && `　${summerCards.length}校`}
            </p>
            <ul className="mt-1 divide-y divide-line">
              {summerCards.map((school) => {
                const status = liveStatus.get(school.slug);
                return (
                  <li key={school.id}>
                    <SchoolCard
                      school={school}
                      compact
                      note={
                        status ? (
                          status.alive ? (
                            <span className="font-bold text-accent-800">
                              {status.wins > 0
                                ? `${status.wins}勝で勝ち残り`
                                : "勝ち残り"}
                            </span>
                          ) : (
                            <>
                              {status.wins > 0 && `${status.wins}勝　`}
                              {status.lostAt ?? "－"}で敗退
                            </>
                          )
                        ) : null
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </Container>

      {/*
        都道府県から探す導線は横幅いっぱいで置く。
        狭いカラムに入れるとタイル地図が潰れて県名が読めなくなるため。
      */}
      <Container className="mt-4 sm:mt-5">
        <section
          aria-labelledby="search-heading"
          className="rounded-xl border border-line bg-white p-4 sm:p-5"
        >
          <SectionHeading
            id="search-heading"
            title="公立高校を探す"
            icon={<Search size={20} />}
          />
          <p className="mt-3 text-sm font-medium text-ink">
            都道府県から探す
            <span className="ml-2 text-xs font-normal text-ink-muted">
              春・夏それぞれで、その地区から最後に甲子園へ出た公立校を出しています（右肩の数字は掲載校数）
            </span>
          </p>
          <PrefectureMap
            counts={prefectureCounts}
            latest={latestByPrefecture}
            highlightYear={thisYear}
            className="mt-3"
          />

          {/* 色分けは色だけで意味を持たせない。必ず文字で書く。 */}
          {thisYear != null && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-block h-3.5 w-6 rounded-sm border border-accent-500 bg-accent-50"
              />
              <span>
                {thisYear}年の春夏そろって公立校が出場した地区
                {bothSeasons > 0 ? `（${bothSeasons}地区）` : "（まだありません）"}
              </span>
            </p>
          )}

          <div className="mt-5 flex justify-center">
            <Link
              href="/schools"
              className="inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-navy-800 px-6 text-base font-bold text-white hover:bg-navy-700"
            >
              <Search size={18} aria-hidden="true" />
              学校名から探す
            </Link>
          </div>
        </section>
      </Container>

      <AdSlot slot="home-mid" />

      <Container className="mt-4 sm:mt-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* 特集 */}
          <section
            aria-labelledby="features-heading"
            className="rounded-xl border border-line bg-white p-4 sm:p-5"
          >
            <SectionHeading
              id="features-heading"
              title="公立高校野球特集"
              icon={<BookOpen size={22} />}
              moreHref="/features"
            />
            <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {features.map((feature) => (
                <li key={feature.id}>
                  <FeatureCard feature={feature} />
                </li>
              ))}
            </ul>
          </section>

          <XFollowCard />
        </div>
      </Container>

      {/* 学校ページへの導線を最後にもう一度置き、回遊を切らさない（要件23） */}
      <Container className="mt-4 sm:mt-5">
        <section className="flex flex-col items-start gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <School
              size={26}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent-500"
            />
            <div>
              <h2 className="text-lg font-bold text-navy-800 sm:text-xl">
                応援したい学校は決まっていますか？
              </h2>
              <p className="mt-1 text-base text-ink-muted">
                地元の公立高校、母校、気になるあの学校。学校ページから戦績や関連ニュースをまとめて追えます。
              </p>
            </div>
          </div>
          <Link
            href="/schools"
            className="inline-flex min-h-12 shrink-0 items-center rounded-lg border border-navy-800 px-5 text-base font-bold text-navy-800 hover:bg-navy-50"
          >
            公立高校を探す
          </Link>
        </section>
      </Container>
    </>
  );
}
