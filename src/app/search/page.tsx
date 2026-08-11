import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Newspaper, School, Search } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SearchBar } from "@/components/common/SearchBar";
import { EmptyState } from "@/components/common/EmptyState";
import { SchoolList } from "@/components/schools/SchoolList";
import { NewsCard } from "@/components/news/NewsCard";

import { searchSchools } from "@/lib/queries/schools";
import { searchNews } from "@/lib/queries/news";
import { normalizeQuery } from "@/lib/queries/shared";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const keyword = normalizeQuery((await searchParams).q);
  return {
    title: keyword ? `「${keyword}」の検索結果` : "検索",
    description:
      "公立高校・国立高校・高専と、公立高校野球のニュースをまとめて検索できます。",
    // 検索結果ページは検索エンジンに載せない（無限に組み合わせが増えるため）
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const keyword = normalizeQuery((await searchParams).q);

  // 学校を主役にする（要件17）。ニュースは補助的に出す。
  const [schoolResult, news] = keyword
    ? await Promise.all([
        searchSchools({ q: keyword, perPage: 8 }),
        searchNews(keyword, 5),
      ])
    : [null, []];

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "検索" }]} />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Search size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            {keyword ? `「${keyword}」の検索結果` : "検索"}
          </h1>
        </div>
        <div className="mt-4 max-w-md">
          <SearchBar
            id="page-search"
            defaultValue={keyword}
            size="lg"
            placeholder="学校名・地域・キーワード"
          />
        </div>
      </header>

      {!keyword && (
        <div className="mt-4">
          <EmptyState
            title="検索したい言葉を入力してください"
            description="学校名や市区町村名で公立高校を探せます。ニュースの見出しも同時に検索します。"
            actionHref="/schools"
            actionLabel="都道府県から公立高校を探す"
          />
        </div>
      )}

      {keyword && schoolResult && (
        <>
          <section
            aria-labelledby="search-schools"
            className="mt-4 rounded-xl border border-line bg-white p-5"
          >
            <div className="flex items-center gap-2">
              <School size={18} aria-hidden="true" className="text-accent-500" />
              <h2 id="search-schools" className="text-base font-bold text-navy-800">
                公立高校
              </h2>
              <span className="text-xs text-ink-muted">
                {schoolResult.total} 件
              </span>
              {schoolResult.total > schoolResult.schools.length && (
                <Link
                  href={`/schools?q=${encodeURIComponent(keyword)}`}
                  className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-ink-muted hover:text-navy-800 hover:underline"
                >
                  すべて見る
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="mt-2">
              <SchoolList schools={schoolResult.schools} />
            </div>
          </section>

          <section
            aria-labelledby="search-news"
            className="mt-4 rounded-xl border border-line bg-white p-5"
          >
            <div className="flex items-center gap-2">
              <Newspaper
                size={18}
                aria-hidden="true"
                className="text-accent-500"
              />
              <h2 id="search-news" className="text-base font-bold text-navy-800">
                ニュース
              </h2>
              <span className="text-xs text-ink-muted">{news.length} 件</span>
            </div>

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
                見出しに「{keyword}」を含むニュースは見つかりませんでした。
              </p>
            )}
          </section>
        </>
      )}
    </Container>
  );
}
