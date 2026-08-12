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
import {
  getFeaturedSchools,
  getSchoolCountByPrefecture,
} from "@/lib/queries/schools";
import { getHighlightedPhenomena } from "@/lib/queries/phenomena";
import { getLatestFeatures } from "@/lib/queries/features";

// 一覧系は10分ごとに作り直す。ニュース更新の反映と負荷のバランス。
export const revalidate = 600;

export default async function HomePage() {
  const [phenomena, featuredSchools, prefectureCounts, features] =
    await Promise.all([
      getHighlightedPhenomena(3),
      getFeaturedSchools(3),
      getSchoolCountByPrefecture(),
      getLatestFeatures(4),
    ]);

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

          {/* 注目の公立高校 */}
          <section
            aria-labelledby="featured-heading"
            className="rounded-xl border border-line bg-white p-4 sm:p-5"
          >
            <SectionHeading
              id="featured-heading"
              title="注目の公立高校"
              icon={<Star size={18} />}
              moreHref="/schools"
            />
            <ul className="mt-1 divide-y divide-line">
              {featuredSchools.map((school) => (
                <li key={school.id}>
                  <SchoolCard school={school} />
                </li>
              ))}
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
            icon={<Search size={18} />}
          />
          <p className="mt-3 text-xs font-medium text-ink-muted">
            都道府県から探す（数字は掲載している学校数）
          </p>
          <PrefectureMap counts={prefectureCounts} className="mt-3" />
          <div className="mt-5 flex justify-center">
            <Link
              href="/schools"
              className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-navy-800 px-6 text-sm font-bold text-white hover:bg-navy-700"
            >
              <Search size={16} aria-hidden="true" />
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
              icon={<BookOpen size={18} />}
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
              size={22}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent-500"
            />
            <div>
              <h2 className="text-base font-bold text-navy-800">
                応援したい学校は決まっていますか？
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                地元の公立高校、母校、気になるあの学校。学校ページから戦績や関連ニュースをまとめて追えます。
              </p>
            </div>
          </div>
          <Link
            href="/schools"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-navy-800 px-5 text-sm font-bold text-navy-800 hover:bg-navy-50"
          >
            公立高校を探す
          </Link>
        </section>
      </Container>
    </>
  );
}
