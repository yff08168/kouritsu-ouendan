import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { EmptyState } from "@/components/common/EmptyState";
import { FeatureCard } from "@/components/features/FeatureCard";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getFeatureCountByCategory,
  getFeaturesList,
} from "@/lib/queries/features";
import { FEATURE_CATEGORIES } from "@/lib/constants";
import type { FeatureCategory } from "@/types/app";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

type Props = {
  searchParams: Promise<{ category?: string }>;
};

function parseCategory(value: string | undefined): FeatureCategory | undefined {
  if (value && value in FEATURE_CATEGORIES) return value as FeatureCategory;
  return undefined;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const category = parseCategory((await searchParams).category);

  return {
    title: category ? `${FEATURE_CATEGORIES[category]}の特集` : "特集",
    description:
      "地方大会の観戦ガイド、公立高校野球の歴史、チーム紹介、観戦グッズまで。公立高校野球をもっと楽しむための読みものをまとめています。",
    alternates: { canonical: "/features" },
  };
}

export default async function FeaturesPage({ searchParams }: Props) {
  const category = parseCategory((await searchParams).category);

  const [features, counts] = await Promise.all([
    getFeaturesList(category),
    getFeatureCountByCategory(),
  ]);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "特集", href: "/features" },
          ...(category ? [{ label: FEATURE_CATEGORIES[category] }] : []),
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <BookOpen size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            公立高校野球特集
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          観戦ガイド、公立高校野球の歴史、チーム紹介、球場情報、観戦グッズまで。
          試合を見るだけでは分からない楽しみ方をまとめています。
        </p>

        <nav aria-label="特集のカテゴリ" className="mt-4">
          <ul className="flex flex-wrap gap-1.5">
            <li>
              <CategoryChip
                label="すべて"
                href="/features"
                isActive={!category}
              />
            </li>
            {(Object.keys(FEATURE_CATEGORIES) as FeatureCategory[]).map(
              (key) => (
                <li key={key}>
                  <CategoryChip
                    label={FEATURE_CATEGORIES[key]}
                    count={counts[key]}
                    href={`/features?category=${key}`}
                    isActive={category === key}
                  />
                </li>
              ),
            )}
          </ul>
        </nav>
      </header>

      <section aria-labelledby="feature-list" className="mt-4">
        <h2 id="feature-list" className="sr-only">
          特集一覧
        </h2>

        {features.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {features.map((feature) => (
              <li key={feature.id}>
                <FeatureCard feature={feature} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="このカテゴリの特集はまだありません"
            description="他のカテゴリもご覧ください。順次追加していきます。"
            actionHref="/features"
            actionLabel="すべての特集を見る"
          />
        )}
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}

function CategoryChip({
  label,
  href,
  count,
  isActive,
}: {
  label: string;
  href: string;
  count?: number;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      aria-label={count !== undefined ? `${label}（${count}件）` : label}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
        isActive
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50",
      )}
    >
      <span aria-hidden="true">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "text-[0.625rem] tabular-nums",
            isActive ? "text-navy-100" : "text-ink-faint",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
