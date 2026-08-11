import type { Metadata } from "next";
import { School } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Pagination } from "@/components/common/Pagination";
import { SchoolList } from "@/components/schools/SchoolList";
import { PrefectureSelector } from "@/components/schools/PrefectureSelector";
import { SearchBar } from "@/components/common/SearchBar";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getSchoolCountByPrefecture,
  searchSchools,
} from "@/lib/queries/schools";
import { normalizeQuery } from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";

export const revalidate = 600;

type SearchParams = {
  q?: string;
  pref?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

/** 検索条件を保ったままURLを組み立てる */
function buildUrl(params: SearchParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.pref) search.set("pref", params.pref);
  if (params.page && params.page !== "1") search.set("page", params.page);
  const query = search.toString();
  return query ? `/schools?${query}` : "/schools";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { q, pref } = await searchParams;
  const keyword = normalizeQuery(q);
  const prefecture = pref ? PREFECTURE_BY_SLUG.get(pref) : undefined;

  const titleParts = [
    prefecture ? `${prefecture.name}の公立高校` : null,
    keyword ? `「${keyword}」の検索結果` : null,
  ].filter(Boolean);

  const title =
    titleParts.length > 0 ? titleParts.join(" ") : "公立高校を探す";

  return {
    title,
    description:
      "全国の公立高校・国立高校・高専を、都道府県や学校名から探せます。甲子園出場歴や最近の戦績、関連ニュースもまとめて確認できます。",
    alternates: {
      // 検索結果ページが重複コンテンツ扱いされないよう、正規URLは一覧に寄せる
      canonical: prefecture ? `/schools?pref=${prefecture.slug}` : "/schools",
    },
    robots: keyword ? { index: false, follow: true } : undefined,
  };
}

export default async function SchoolsPage({ searchParams }: Props) {
  const params = await searchParams;
  const keyword = normalizeQuery(params.q);
  const prefectureSlug = params.pref;
  const prefecture = prefectureSlug
    ? PREFECTURE_BY_SLUG.get(prefectureSlug)
    : undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const [result, counts] = await Promise.all([
    searchSchools({ q: keyword, prefectureSlug, page }),
    getSchoolCountByPrefecture(),
  ]);

  const heading = prefecture
    ? `${prefecture.name}の公立高校`
    : "公立高校を探す";

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "公立高校", href: "/schools" },
          ...(prefecture ? [{ label: prefecture.name }] : []),
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <School size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            {heading}
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          全国の公立高校を掲載しています。国立高校・高等専門学校も応援対象に含みます。
        </p>

        <div className="mt-4 max-w-md">
          <SearchBar
            id="school-search"
            defaultValue={keyword}
            size="lg"
            placeholder="学校名・市区町村で検索"
            action="/schools"
          />
        </div>
      </header>

      <section
        aria-labelledby="prefecture-filter"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="prefecture-filter" className="text-sm font-bold text-navy-800">
          都道府県で絞り込む
        </h2>
        <PrefectureSelector
          groupByRegion
          counts={counts}
          activeSlug={prefectureSlug}
          buildHref={(slug) =>
            buildUrl({ q: keyword, pref: slug === prefectureSlug ? undefined : slug })
          }
          className="mt-3"
        />
      </section>

      <section aria-labelledby="school-results" className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-white px-5 pt-5">
          <h2 id="school-results" className="text-sm font-bold text-navy-800">
            検索結果
          </h2>
          <p className="text-xs text-ink-muted">
            {result.total > 0 ? (
              <>
                全 <strong className="text-ink">{result.total}</strong> 校
                {result.totalPages > 1 && (
                  <>
                    　（{result.page} / {result.totalPages} ページ）
                  </>
                )}
              </>
            ) : (
              "0 校"
            )}
          </p>
        </div>

        <div className="rounded-b-xl border border-line bg-white px-5 pb-5">
          <SchoolList schools={result.schools} />
        </div>

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          buildHref={(p) =>
            buildUrl({ q: keyword, pref: prefectureSlug, page: String(p) })
          }
        />
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
