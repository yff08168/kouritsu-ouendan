import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, MapPin, School } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import { SectionHeading } from "@/components/common/SectionHeading";
import { NewsBody } from "@/components/news/NewsBody";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getAllPhenomenonSlugs,
  getPhenomenaList,
  getPhenomenonBySlug,
} from "@/lib/queries/phenomena";
import { getSchoolsByPhenomenon } from "@/lib/queries/schools";
import { PHENOMENON, PHENOMENON_LEVELS, SEASONS } from "@/lib/constants";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllPhenomenonSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getPhenomenonBySlug(slug);

  if (!item) return { title: "記録が見つかりません" };

  const description =
    item.summary ??
    `${item.year}年${SEASONS[item.season]}、${item.schoolName ?? "公立高校"}が起こした${PHENOMENON.label}の記録。`;

  return {
    title: item.title,
    description,
    alternates: { canonical: `/phenomenon/${item.slug}` },
    openGraph: { type: "article", title: item.title, description },
  };
}

export default async function PhenomenonDetailPage({ params }: Props) {
  const { slug } = await params;
  const item = await getPhenomenonBySlug(slug);

  if (!item) notFound();

  const [schools, sameYear] = await Promise.all([
    getSchoolsByPhenomenon(item.id),
    getPhenomenaList({ year: item.year, perPage: 5 }),
  ]);

  const others = sameYear.phenomena.filter((p) => p.slug !== item.slug);

  return (
    <Container size="narrow" className="pb-4">
      <Breadcrumb
        items={[
          { label: PHENOMENON.label, href: "/phenomenon" },
          { label: `${item.year}年`, href: `/phenomenon?year=${item.year}` },
          { label: item.title },
        ]}
      />

      <article className="overflow-hidden rounded-xl border border-line bg-white">
        <Thumbnail
          image={item.image}
          seed={item.slug}
          label={item.prefecture?.name}
          className="h-40 w-full sm:h-56"
          sizes="(max-width: 768px) 100vw, 768px"
          showCredit
        />

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-600">
              <Flame size={13} aria-hidden="true" className="text-accent-500" />
              {PHENOMENON.label}
            </span>
            <Badge>
              {item.year}年{SEASONS[item.season]}
            </Badge>
            <Badge variant="outline">{PHENOMENON_LEVELS[item.level]}</Badge>
            {item.badge && <Badge variant="accent">{item.badge}</Badge>}
            {item.prefecture && (
              <Link
                href={`/prefectures/${item.prefecture.slug}`}
                className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-navy-800 hover:underline"
              >
                <MapPin size={13} aria-hidden="true" />
                {item.prefecture.name}
              </Link>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-snug text-navy-800 sm:text-2xl">
            {item.title}
          </h1>

          {item.summary && (
            <p className="mt-4 rounded-lg bg-navy-50 p-4 text-sm leading-relaxed text-ink">
              {item.summary}
            </p>
          )}

          {item.body && (
            <div className="mt-7">
              <NewsBody markdown={item.body} />
            </div>
          )}
        </div>
      </article>

      <AdSlot slot="news-article-bottom" />

      {/* 旋風 → 学校ページへの回遊 */}
      {schools.length > 0 && (
        <section
          aria-labelledby="phenomenon-schools"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="phenomenon-schools"
            title="この記録に登場する学校"
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

      {others.length > 0 && (
        <section
          aria-labelledby="same-year"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="same-year"
            title={`${item.year}年の他の記録`}
            icon={<Flame size={18} />}
            moreHref={`/phenomenon?year=${item.year}`}
            moreLabel="この年をすべて見る"
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {others.map((other) => (
              <li key={other.id}>
                <PhenomenonCard item={other} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
