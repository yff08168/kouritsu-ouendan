import type { Metadata } from "next";
import { Newspaper } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { NewsCard } from "@/components/news/NewsCard";
import { CategoryTabs } from "@/components/news/CategoryTabs";
import { AdSlot } from "@/components/ads/AdSlot";

import { getNewsList } from "@/lib/queries/news";
import {
  NEWS_CATEGORIES,
  PREFECTURE_BY_SLUG,
  type NewsCategory,
} from "@/lib/constants";

export const revalidate = 300;

type SearchParams = {
  category?: string;
  pref?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

function parseCategory(value: string | undefined): NewsCategory | undefined {
  if (value && value in NEWS_CATEGORIES) return value as NewsCategory;
  return undefined;
}

function buildUrl(params: SearchParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.pref) search.set("pref", params.pref);
  if (params.page && params.page !== "1") search.set("page", params.page);
  const query = search.toString();
  return query ? `/news?${query}` : "/news";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { category, pref } = await searchParams;
  const activeCategory = parseCategory(category);
  const prefecture = pref ? PREFECTURE_BY_SLUG.get(pref) : undefined;

  const parts = [
    prefecture ? `${prefecture.name}の` : "",
    activeCategory ? NEWS_CATEGORIES[activeCategory] : "公立高校野球ニュース",
  ];

  return {
    title: parts.join(""),
    description:
      "公立高校野球の最新ニュース。地方大会の結果、注目校の話題、コラムまで。公立高校を応援する人のための情報をまとめています。",
    alternates: {
      canonical: activeCategory ? `/news?category=${activeCategory}` : "/news",
    },
  };
}

export default async function NewsListPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeCategory = parseCategory(params.category);
  const prefecture = params.pref
    ? PREFECTURE_BY_SLUG.get(params.pref)
    : undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const result = await getNewsList({
    category: activeCategory,
    prefectureSlug: params.pref,
    page,
  });

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "ニュース", href: "/news" },
          ...(activeCategory
            ? [{ label: NEWS_CATEGORIES[activeCategory] }]
            : []),
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Newspaper size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            {prefecture ? `${prefecture.name}のニュース` : "公立高校野球ニュース"}
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          地方大会の結果、注目校の話題、コラムまで。公立高校野球の“今”をお届けします。
        </p>

        <div className="mt-4">
          <CategoryTabs
            activeCategory={activeCategory}
            buildHref={(category) =>
              buildUrl({ category, pref: params.pref })
            }
          />
        </div>
      </header>

      <section aria-labelledby="news-list" className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-white px-5 pt-5">
          <h2 id="news-list" className="text-sm font-bold text-navy-800">
            記事一覧
          </h2>
          <p className="text-xs text-ink-muted">
            全 <strong className="text-ink">{result.total}</strong> 件
            {result.totalPages > 1 && (
              <>
                　（{result.page} / {result.totalPages} ページ）
              </>
            )}
          </p>
        </div>

        <div className="rounded-b-xl border border-line bg-white px-5 pb-5">
          {result.news.length > 0 ? (
            <ul className="divide-y divide-line">
              {result.news.map((item) => (
                <li key={item.id}>
                  <NewsCard news={item} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-4">
              <EmptyState
                title="該当する記事が見つかりませんでした"
                description="カテゴリを変えるか、すべての記事から探してみてください。"
                actionHref="/news"
                actionLabel="すべての記事を見る"
              />
            </div>
          )}
        </div>

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          buildHref={(p) =>
            buildUrl({
              category: params.category,
              pref: params.pref,
              page: String(p),
            })
          }
        />
      </section>

      <AdSlot slot="news-list-mid" />
    </Container>
  );
}
