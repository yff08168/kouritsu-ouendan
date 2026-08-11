import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import { SectionHeading } from "@/components/common/SectionHeading";
import { NewsBody } from "@/components/news/NewsBody";
import { FeatureCard } from "@/components/features/FeatureCard";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getAllFeatureSlugs,
  getFeatureBySlug,
  getRelatedFeatures,
} from "@/lib/queries/features";
import { FEATURE_CATEGORIES } from "@/lib/constants";
import { formatDateLong, toDateAttr } from "@/lib/utils";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllFeatureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feature = await getFeatureBySlug(slug);

  if (!feature) return { title: "特集が見つかりません" };

  const title = feature.seoTitle ?? feature.title;
  const description =
    feature.seoDescription ??
    feature.subtitle ??
    `${feature.title}｜公立高校野球をもっと楽しむための特集記事。`;

  return {
    title,
    description,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: { type: "article", title, description },
  };
}

export default async function FeatureDetailPage({ params }: Props) {
  const { slug } = await params;
  const feature = await getFeatureBySlug(slug);

  if (!feature) notFound();

  const related = await getRelatedFeatures(feature.slug, feature.category);

  return (
    <Container size="narrow" className="pb-4">
      <Breadcrumb
        items={[
          { label: "特集", href: "/features" },
          {
            label: FEATURE_CATEGORIES[feature.category],
            href: `/features?category=${feature.category}`,
          },
          { label: feature.title },
        ]}
      />

      <article className="overflow-hidden rounded-xl border border-line bg-white">
        <Thumbnail
          image={feature.image}
          seed={feature.slug}
          className="h-40 w-full sm:h-56"
          sizes="(max-width: 768px) 100vw, 768px"
          showCredit
        />

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{FEATURE_CATEGORIES[feature.category]}</Badge>
            {feature.publishedAt && (
              <time
                dateTime={toDateAttr(feature.publishedAt)}
                className="text-xs text-ink-faint"
              >
                {formatDateLong(feature.publishedAt)}
              </time>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-snug text-navy-800 sm:text-2xl">
            {feature.title}
          </h1>

          {feature.subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {feature.subtitle}
            </p>
          )}

          {feature.body ? (
            <div className="mt-7">
              <NewsBody markdown={feature.body} />
            </div>
          ) : (
            <p className="mt-7 text-sm text-ink-muted">
              この特集は準備中です。
            </p>
          )}
        </div>
      </article>

      <AdSlot slot="news-article-bottom" />

      {related.length > 0 && (
        <section
          aria-labelledby="related-features"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="related-features"
            title={`${FEATURE_CATEGORIES[feature.category]}の他の特集`}
            icon={<BookOpen size={18} />}
            moreHref={`/features?category=${feature.category}`}
          />
          <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {related.map((item) => (
              <li key={item.id}>
                <FeatureCard feature={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
