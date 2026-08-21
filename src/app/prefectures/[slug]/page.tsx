import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  Flame,
  MapPin,
  MessageSquareHeart,
  Newspaper,
  School,
  Vote,
} from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { SchoolList } from "@/components/schools/SchoolList";
import { NewsCard } from "@/components/news/NewsCard";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";
import { AdSlot } from "@/components/ads/AdSlot";
import { PollCard } from "@/components/community/PollCard";
import { RegionalDistrictCard } from "@/components/results/RegionalDistrictCard";
import { CheerMessageList } from "@/components/community/CheerMessageList";

import { getPrefectureBySlug } from "@/lib/queries/prefectures";
import { searchSchools } from "@/lib/queries/schools";
import { getNewsList } from "@/lib/queries/news";
import { getPhenomenaByPrefecture } from "@/lib/queries/phenomena";
import { getActivePolls, getCheerMessages } from "@/lib/queries/community";
import { PREFECTURES } from "@/lib/constants";
import { getRegionalDistrict, latestSeasonGames } from "@/lib/regional-results";

/**
 * その県の地方大会の結果を何試合まで出すか。
 *
 * 神奈川の選手権予選は公立が絡む試合だけで100件を超える。全部出すと
 * ページが長くなりすぎるうえ、**下の応援メッセージや投票まで遠くなる。**
 * 出していない試合があることは画面に明記する（`RegionalDistrictCard`）。
 */
const REGIONAL_GAMES_LIMIT = 24;

/**
 * 投票数と応援メッセージは動きが速いので、他のページより短く見直す。
 * 投票した本人には即座に結果が見えるので（PollCard が手元で数を足す）、
 * ここは「他の人が見たときにいつ反映されるか」の設定。
 */
export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return PREFECTURES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const prefecture = await getPrefectureBySlug(slug);

  if (!prefecture) return { title: "都道府県が見つかりません" };

  return {
    title: `${prefecture.fullName}の公立高校野球`,
    description: `${prefecture.fullName}の公立高校・国立高校・高専の一覧、地方大会のニュース、公立旋風をまとめています。地元の公立高校を応援しよう。`,
    alternates: { canonical: `/prefectures/${prefecture.slug}` },
  };
}

export default async function PrefectureDetailPage({ params }: Props) {
  const { slug } = await params;
  const prefecture = await getPrefectureBySlug(slug);

  if (!prefecture) notFound();

  const [schoolResult, newsResult, phenomena, polls, messages, regional] =
    await Promise.all([
      searchSchools({ prefectureSlug: slug, perPage: 12 }),
      getNewsList({ prefectureSlug: slug, perPage: 6 }),
      getPhenomenaByPrefecture(slug),
      getActivePolls(slug),
      /*
        この県の学校あての応援メッセージ（0008）。
        **投稿欄は学校ページにしか無い**ので、ここは集約表示に徹する。
      */
      getCheerMessages({ prefectureSlug: slug, limit: 10 }),
      /*
        地方大会の結果。**DBではなくリポジトリ内の生成物**から読む
        （`src/lib/data/regional/<県>.ts`。出典が県ごとに違うため）。
        **対応していない県は null**（2026-08-13 時点で6県だけ）。
      */
      getRegionalDistrict(slug),
    ]);

  const regionalGames = regional ? latestSeasonGames(regional, REGIONAL_GAMES_LIMIT) : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "都道府県", href: "/prefectures" },
          { label: prefecture.name },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        {/* 読み仮名は見出しの外に置く。h1の中に入れると「…野球しまね」と読み上げられるため */}
        <p className="flex flex-wrap items-baseline gap-2 text-xs font-bold text-accent-800">
          {prefecture.region}
          <span className="font-normal text-ink-faint">
            {prefecture.nameKana}
          </span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          {prefecture.fullName}の公立高校野球
        </h1>

        {prefecture.description && (
          <p className="mt-3 text-sm leading-relaxed text-ink">
            {prefecture.description}
          </p>
        )}

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">掲載校数</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {schoolResult.total}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">校</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">関連ニュース</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {newsResult.total}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">件</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">公立旋風</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {phenomena.length}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">件</span>
            </dd>
          </div>
        </dl>

        <Link
          href="/prefectures"
          className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-navy-800 hover:underline"
        >
          <MapPin size={13} aria-hidden="true" />
          他の都道府県を見る
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </header>

      {/* ------- 学校 ------- */}
      <section
        aria-labelledby="pref-schools"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-schools"
          title={`${prefecture.name}の公立高校`}
          icon={<School size={18} />}
          moreHref={`/schools?pref=${prefecture.slug}`}
          moreLabel="一覧・検索へ"
        />
        <div className="mt-2">
          <SchoolList schools={schoolResult.schools} />
        </div>
      </section>

      {/* ------- 地方大会の結果（対応している県だけ） ------- */}
      {regional && regionalGames && (
        <RegionalDistrictCard
          district={regional}
          season={regionalGames.season}
          games={regionalGames.games}
          total={regionalGames.total}
          tournaments={regionalGames.tournaments}
        />
      )}

      <AdSlot slot="sidebar" />

      {/* ------- 公立旋風 ------- */}
      {phenomena.length > 0 && (
        <section
          aria-labelledby="pref-phenomena"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pref-phenomena"
            title={`${prefecture.name}の公立旋風`}
            icon={<Flame size={18} />}
            moreHref="/phenomenon"
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {phenomena.map((item) => (
              <li key={item.id}>
                <PhenomenonCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------- 投票 ------- */}
      {polls.length > 0 && (
        <section
          aria-labelledby="pref-polls"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pref-polls"
            title={`${prefecture.name}のみんなの投票`}
            icon={<Vote size={18} />}
          />
          <div className="mt-3 space-y-3">
            {polls.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}

      {/* ------- 応援メッセージ（集約表示。投稿欄は学校ページ） ------- */}
      <section
        aria-labelledby="pref-cheers"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-cheers"
          title={`${prefecture.name}の学校に届いた応援`}
          icon={<MessageSquareHeart size={18} />}
          moreHref={`/schools?pref=${prefecture.slug}`}
          moreLabel="学校を探す"
        />
        <div className="mt-3">
          <CheerMessageList
            items={messages}
            showSchool
            emptyText={`${prefecture.name}の学校にはまだ応援メッセージが届いていません。各校のページから投稿できます。`}
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          応援メッセージは各学校のページから投稿できます。
        </p>
      </section>

      {/* ------- ニュース ------- */}
      <section
        aria-labelledby="pref-news"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-news"
          title={`${prefecture.name}のニュース`}
          icon={<Newspaper size={18} />}
          moreHref={`/news?pref=${prefecture.slug}`}
          moreLabel="もっと見る"
        />
        {newsResult.news.length > 0 ? (
          <ul className="mt-1 divide-y divide-line">
            {newsResult.news.map((item) => (
              <li key={item.id}>
                <NewsCard news={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            {prefecture.name}に関連づけられたニュースはまだありません。
          </p>
        )}
      </section>
    </Container>
  );
}
