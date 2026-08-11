import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, School } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { NewsBody } from "@/components/news/NewsBody";
import { NewsCard } from "@/components/news/NewsCard";
import { SourceNote } from "@/components/news/SourceNote";
import { SchoolCard } from "@/components/schools/SchoolCard";

import {
  getAllNewsSlugs,
  getNewsBySlug,
  getRelatedNews,
} from "@/lib/queries/news";
import { getSchoolsByNews } from "@/lib/queries/schools";
import { NEWS_CATEGORIES } from "@/lib/constants";
import { formatDateLong, toDateAttr } from "@/lib/utils";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllNewsSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const news = await getNewsBySlug(slug);

  if (!news) return { title: "記事が見つかりません" };

  const title = news.seoTitle ?? news.title;
  const description = news.seoDescription ?? news.summary;

  return {
    title,
    description,
    alternates: { canonical: `/news/${news.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: news.publishedAt,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const news = await getNewsBySlug(slug);

  if (!news) notFound();

  const [schools, relatedNews] = await Promise.all([
    getSchoolsByNews(news.id),
    getRelatedNews(news.slug, news.category),
  ]);

  return (
    <Container size="narrow" className="pb-4">
      <Breadcrumb
        items={[
          { label: "ニュース", href: "/news" },
          { label: NEWS_CATEGORIES[news.category], href: `/news?category=${news.category}` },
          { label: news.title },
        ]}
      />

      <article className="overflow-hidden rounded-xl border border-line bg-white">
        {news.image && (
          <Thumbnail
            image={news.image}
            seed={news.slug}
            className="h-48 w-full sm:h-64"
            sizes="(max-width: 768px) 100vw, 768px"
            showCredit
          />
        )}

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{NEWS_CATEGORIES[news.category]}</Badge>
            {news.prefecture && (
              <Link
                href={`/news?pref=${news.prefecture.slug}`}
                className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-navy-800 hover:underline"
              >
                <MapPin size={13} aria-hidden="true" />
                {news.prefecture.name}
              </Link>
            )}
            <time
              dateTime={toDateAttr(news.publishedAt)}
              className="text-xs text-ink-faint"
            >
              {formatDateLong(news.publishedAt)}
            </time>
          </div>

          <h1 className="mt-3 text-xl font-bold leading-snug text-navy-800 sm:text-2xl">
            {news.title}
          </h1>

          {/* 要約は本文の前に置く。一覧・OGP・検索結果と同じ文章を使う。 */}
          <p className="mt-4 rounded-lg bg-navy-50 p-4 text-sm leading-relaxed text-ink">
            {news.summary}
          </p>

          {news.body && (
            <div className="mt-7">
              <NewsBody markdown={news.body} />
            </div>
          )}

          <SourceNote sourceName={news.sourceName} sourceUrl={news.sourceUrl} />
        </div>
      </article>

      <AdSlot slot="news-article-bottom" />

      {/* 記事 → 学校ページへの回遊（要件34の中心） */}
      {schools.length > 0 && (
        <section
          aria-labelledby="news-schools"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="news-schools"
            title="この記事に登場する学校"
            icon={<School size={18} />}
          />
          <ul className="mt-1 divide-y divide-line">
            {schools.map((school) => (
              <li key={school.id}>
                <SchoolCard school={school} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {relatedNews.length > 0 && (
        <section
          aria-labelledby="related-news"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="related-news"
            title={`${NEWS_CATEGORIES[news.category]}の他の記事`}
            moreHref={`/news?category=${news.category}`}
            moreLabel="もっと見る"
          />
          <ul className="mt-1 divide-y divide-line">
            {relatedNews.map((item) => (
              <li key={item.id}>
                <NewsCard news={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
