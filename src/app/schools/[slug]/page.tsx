import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  ExternalLink,
  Flame,
  MapPin,
  Newspaper,
  Star,
  Trophy,
} from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { NewsCard } from "@/components/news/NewsCard";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { ChampionshipTable } from "@/components/schools/ChampionshipTable";
import { RecordTable } from "@/components/schools/RecordTable";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";

import {
  getAllSchoolSlugs,
  getRelatedSchools,
  getSchoolBySlug,
  getSchoolChampionships,
  getSchoolRecords,
} from "@/lib/queries/schools";
import { getNewsBySchool } from "@/lib/queries/news";
import { getPhenomenaBySchool } from "@/lib/queries/phenomena";
import { JsonLd } from "@/components/common/JsonLd";
import { schoolJsonLd } from "@/lib/seo";
import { ESTABLISHMENTS, SCHOOL_KINDS, establishmentLabel } from "@/lib/constants";

// 学校情報は頻繁には変わらないので長めに保つ
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllSchoolSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);

  if (!school) {
    return { title: "学校が見つかりません" };
  }

  const koshienTotal =
    school.koshienSpringCount + school.koshienSummerCount;
  const description = [
    `${school.officialName}（${school.prefecture.name}${school.city ? `・${school.city}` : ""}）の野球部情報。`,
    koshienTotal > 0
      ? `甲子園出場${koshienTotal}回。`
      : "甲子園出場記録・最近の戦績を掲載。",
    "関連ニュース、公立旋風、同じ都道府県の公立高校もまとめて確認できます。",
  ].join("");

  return {
    title: `${school.name}（${school.prefecture.name}）`,
    description,
    alternates: { canonical: `/schools/${school.slug}` },
    openGraph: {
      type: "article",
      title: `${school.name}（${school.prefecture.name}）| 公立応援団`,
      description,
    },
  };
}

export default async function SchoolDetailPage({ params }: Props) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);

  if (!school) notFound();

  const [championships, records, news, phenomena, relatedSchools] =
    await Promise.all([
      getSchoolChampionships(school.id),
      getSchoolRecords(school.id),
      getNewsBySchool(school.id),
      getPhenomenaBySchool(school.id),
      getRelatedSchools(school.prefecture.slug, school.id),
    ]);

  const koshienTotal = school.koshienSpringCount + school.koshienSummerCount;

  return (
    <Container className="pb-4">
      <JsonLd data={schoolJsonLd(school)} />
      <Breadcrumb
        items={[
          { label: "公立高校", href: "/schools" },
          {
            label: school.prefecture.name,
            href: `/schools?pref=${school.prefecture.slug}`,
          },
          { label: school.name },
        ]}
      />

      {/* ------- 学校の見出し ------- */}
      <header className="overflow-hidden rounded-xl border border-line bg-white">
        <Thumbnail
          image={school.image}
          seed={school.slug}
          label={school.prefecture.name}
          className="h-36 w-full sm:h-48"
          sizes="(max-width: 768px) 100vw, 1024px"
          showCredit
        />

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {establishmentLabel(school.establishment, school.prefecture.name)}
            </Badge>
            {school.schoolKind !== "high_school" && (
              <Badge variant="outline">
                {SCHOOL_KINDS[school.schoolKind]}
              </Badge>
            )}
            {koshienTotal > 0 && <Badge>甲子園 {koshienTotal}回</Badge>}
            {school.lastKoshienYear && (
              <Badge variant="outline">
                最終出場 {school.lastKoshienYear}年
              </Badge>
            )}
          </div>

          <h1 className="mt-2.5 text-2xl font-bold text-navy-800 sm:text-3xl">
            {school.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{school.officialName}</p>

          {school.catchcopy && (
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">
              {school.catchcopy}
            </p>
          )}

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">所在地</dt>
              <MapPin size={15} aria-hidden="true" className="text-ink-faint" />
              <dd className="text-ink-muted">
                <Link
                  href={`/schools?pref=${school.prefecture.slug}`}
                  className="hover:text-navy-800 hover:underline"
                >
                  {school.prefecture.name}
                </Link>
                {school.city && `　${school.city}`}
              </dd>
            </div>

            <div className="flex items-center gap-1.5">
              <dt className="sr-only">区分</dt>
              <Building2
                size={15}
                aria-hidden="true"
                className="text-ink-faint"
              />
              <dd className="text-ink-muted">
                {ESTABLISHMENTS[school.establishment]}・
                {SCHOOL_KINDS[school.schoolKind]}
                {school.foundedYear && `　${school.foundedYear}年創立`}
              </dd>
            </div>
          </dl>

          {school.nameAliases.length > 0 && (
            <p className="mt-2 text-xs text-ink-faint">
              通称：{school.nameAliases.join("／")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {/*
              将来のコミュニティ機能（学校フォロー）の置き場所。
              ユーザー登録を実装するまでは押せる形にしない。
            */}
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-lg border border-line bg-surface px-5 text-sm font-bold text-ink-faint"
            >
              <Star size={16} aria-hidden="true" />
              この学校を応援する（準備中）
            </span>

            {school.websiteUrl && (
              <a
                href={school.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-navy-800 px-5 text-sm font-bold text-navy-800 hover:bg-navy-50"
              >
                学校公式サイト
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      {school.description && (
        <section
          aria-labelledby="school-about"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="school-about" title="学校紹介" />
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
            {school.description}
          </p>
        </section>
      )}

      {/* ------- 戦績 ------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="koshien"
          className="rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="koshien"
            title="甲子園出場歴"
            icon={<Trophy size={18} />}
            note={koshienTotal > 0 ? `通算${koshienTotal}回` : undefined}
          />
          <div className="mt-3">
            <ChampionshipTable items={championships} />
          </div>
        </section>

        <section
          aria-labelledby="records"
          className="rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="records" title="最近の戦績" />
          <div className="mt-3">
            <RecordTable items={records} />
          </div>
        </section>
      </div>

      <AdSlot slot="school-detail-bottom" />

      {/* ------- 関連する公立旋風 ------- */}
      {phenomena.length > 0 && (
        <section
          aria-labelledby="school-phenomena"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="school-phenomena"
            title="この学校の公立旋風"
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

      {/* ------- 関連ニュース ------- */}
      <section
        aria-labelledby="school-news"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="school-news"
          title={`${school.name}の関連ニュース`}
          icon={<Newspaper size={18} />}
          moreHref="/news"
          moreLabel="ニュース一覧へ"
        />
        {news.length > 0 ? (
          <ul className="mt-1 divide-y divide-line">
            {news.map((item) => (
              <li key={item.id}>
                <NewsCard news={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            この学校に関連づけられたニュースはまだありません。
          </p>
        )}
      </section>

      {/* ------- 同じ都道府県の学校 ------- */}
      {relatedSchools.length > 0 && (
        <section
          aria-labelledby="related-schools"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="related-schools"
            title={`${school.prefecture.name}の他の公立高校`}
            moreHref={`/schools?pref=${school.prefecture.slug}`}
            moreLabel="すべて見る"
          />
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {relatedSchools.map((item) => (
              <li key={item.id} className="border-b border-line last:border-0">
                <SchoolCard school={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
