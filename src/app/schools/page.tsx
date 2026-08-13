import type { Metadata } from "next";
import Link from "next/link";
import { School } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Pagination } from "@/components/common/Pagination";
import { SchoolList } from "@/components/schools/SchoolList";
import { PrefectureMap } from "@/components/schools/PrefectureMap";
import {
  SchoolFilters,
  type SchoolFilterState,
} from "@/components/schools/SchoolFilters";
import { SearchBar } from "@/components/common/SearchBar";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getSchoolCountByPrefecture,
  searchSchools,
  SCHOOL_KOSHIEN_FILTERS,
  SCHOOL_SORTS,
  type SchoolKoshienFilter,
  type SchoolSort,
} from "@/lib/queries/schools";
import {
  getKoshienDataset,
  latestPublicByPrefecture,
} from "@/lib/queries/rankings";
import { normalizeQuery } from "@/lib/queries/shared";
import {
  ESTABLISHMENTS,
  PREFECTURES,
  PREFECTURE_BY_SLUG,
  REGIONS,
  SCHOOL_KINDS,
  TARGET_ESTABLISHMENTS,
  type Establishment,
  type SchoolKind,
} from "@/lib/constants";

export const revalidate = 600;

type SearchParams = {
  q?: string;
  pref?: string;
  establishment?: string;
  kind?: string;
  koshien?: string;
  sort?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

/**
 * 検索条件を保ったままURLを組み立てる。
 * **既定値はURLに出さない**（`?sort=pref` のような無意味なクエリを残さない）。
 */
function buildUrl(params: SearchParams): string {
  const search = new URLSearchParams();
  for (const key of [
    "q",
    "pref",
    "establishment",
    "kind",
    "koshien",
    "sort",
  ] as const) {
    if (params[key]) search.set(key, params[key]);
  }
  if (params.page && params.page !== "1") search.set("page", params.page);
  const query = search.toString();
  return query ? `/schools?${query}` : "/schools";
}

/** 値がその選択肢のどれかであるときだけ通す（不正な値を無視する） */
function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
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
      "全国の公立高校・国立高校・高専を、日本地図・学校名・設置区分・甲子園出場歴から探せます。春夏それぞれで直近に甲子園へ出た公立校も地図上で確認できます。",
    alternates: {
      // 検索結果ページが重複コンテンツ扱いされないよう、正規URLは一覧に寄せる
      canonical: prefecture ? `/schools?pref=${prefecture.slug}` : "/schools",
    },
    robots: keyword ? { index: false, follow: true } : undefined,
  };
}

/**
 * 公立高校を探すためのハブ。
 *
 * **かつて `/schools`（名前で探す）と `/prefectures`（地図で選ぶ）に
 * 分かれていたものを1つにした。** どちらにも地図があり、利用者から見ると
 * 同じページが2つナビに並んでいる状態だった。
 * `/prefectures` はURLを壊さないために残してあるが、ナビからは外し、
 * このページの「地方から探す」から辿れるようにしている。
 */
export default async function SchoolsPage({ searchParams }: Props) {
  const params = await searchParams;
  const keyword = normalizeQuery(params.q);
  const prefectureSlug = PREFECTURE_BY_SLUG.has(params.pref ?? "")
    ? params.pref
    : undefined;
  const prefecture = prefectureSlug
    ? PREFECTURE_BY_SLUG.get(prefectureSlug)
    : undefined;

  const establishment = pick<Establishment>(
    params.establishment,
    TARGET_ESTABLISHMENTS,
  );
  const kind = pick<SchoolKind>(
    params.kind,
    Object.keys(SCHOOL_KINDS) as SchoolKind[],
  );
  const koshien = pick<SchoolKoshienFilter>(
    params.koshien,
    Object.keys(SCHOOL_KOSHIEN_FILTERS) as SchoolKoshienFilter[],
  );
  const sort =
    pick<SchoolSort>(params.sort, Object.keys(SCHOOL_SORTS) as SchoolSort[]) ??
    "pref";

  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const [result, counts, koshienData] = await Promise.all([
    searchSchools({
      q: keyword,
      prefectureSlug,
      establishment,
      kind,
      koshien,
      sort,
      page,
    }),
    getSchoolCountByPrefecture(),
    getKoshienDataset(),
  ]);

  const latestByPrefecture = latestPublicByPrefecture(koshienData.schools);
  const thisYear = koshienData.latestYear;

  /** いまの絞り込み。フィルタのリンクを作るのに使う */
  const state: SchoolFilterState = {
    q: keyword || undefined,
    pref: prefectureSlug,
    establishment,
    kind,
    koshien,
    sort: sort === "pref" ? undefined : sort,
  };

  // 条件を変えたら1ページ目に戻す。3ページ目のまま絞り込むと0件になる
  const hrefFor = (next: SchoolFilterState) => buildUrl({ ...next, page: "1" });

  const activeLabels = [
    prefecture?.name,
    establishment ? ESTABLISHMENTS[establishment] : null,
    kind ? SCHOOL_KINDS[kind] : null,
    koshien ? SCHOOL_KOSHIEN_FILTERS[koshien] : null,
    keyword ? `「${keyword}」` : null,
  ].filter(Boolean);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "公立高校を探す", href: "/schools" },
          ...(prefecture ? [{ label: prefecture.name }] : []),
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <School size={24} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            公立高校を探す
          </h1>
        </div>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          全国の公立高校を掲載しています。国立高校・高等専門学校も応援対象に含みます。
        </p>

        <div className="mt-4 max-w-md">
          <SearchBar
            id="school-search"
            defaultValue={keyword}
            size="lg"
            placeholder="学校名・市区町村で検索"
            action="/schools"
            // 検索しても絞り込みと並び替えが消えないように一緒に送る
            hidden={{
              pref: prefectureSlug,
              establishment,
              kind,
              koshien,
              sort: state.sort,
            }}
          />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <SchoolFilters
            state={state}
            buildHref={hrefFor}
            sortUnavailable={result.sortUnavailable}
          />
        </div>
      </header>

      {/* ------- 日本地図 ------- */}
      <section
        aria-labelledby="prefecture-filter"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="prefecture-filter" className="text-lg font-bold text-navy-800">
          地図から選ぶ
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          マスの中は、春・夏それぞれで
          <strong className="text-ink">その地区から最後に甲子園へ出た公立校</strong>
          です（右肩の数字は掲載している学校数）。
          {prefecture && (
            <>
              　いまは <strong className="text-ink">{prefecture.name}</strong>{" "}
              で絞り込んでいます。もう一度押すと解除できます。
            </>
          )}
        </p>

        <PrefectureMap
          counts={counts}
          latest={latestByPrefecture}
          highlightYear={thisYear}
          activeSlug={prefectureSlug}
          buildHref={(slug) =>
            // 選択中の県をもう一度押したら絞り込みを解除する
            hrefFor({ ...state, pref: slug === prefectureSlug ? undefined : slug })
          }
          className="mt-4"
        />

        {thisYear != null && (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-6 rounded-sm border border-accent-500 bg-accent-50"
            />
            <span>{thisYear}年の春夏そろって公立校が出場した地区</span>
          </p>
        )}

        <p className="mt-3 text-center text-xs text-ink-faint">
          ※ 甲子園の大会区分（49地区）で並べた図です。実際の県の形や面積とは異なります。
          <br />
          校名は<strong className="font-medium">公立・国立・高専のみ</strong>を対象にしています。私立を含む代表校ではありません。
        </p>
      </section>

      {/* ------- 検索結果 ------- */}
      <section aria-labelledby="school-results" className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-white px-5 pt-5">
          <h2 id="school-results" className="text-lg font-bold text-navy-800">
            検索結果
            {activeLabels.length > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {activeLabels.join("・")}
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-muted">
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
          buildHref={(p) => buildUrl({ ...state, page: String(p) })}
        />
      </section>

      {/*
        地方別の一覧。`/prefectures` から移してきた。
        タイル地図は幅と視覚に頼るので、**地図が使いにくい環境のための道**を
        必ず1つ残しておく。
      */}
      <section
        aria-labelledby="prefecture-index"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="prefecture-index" className="text-lg font-bold text-navy-800">
          地方から探す
        </h2>
        <div className="mt-3 space-y-3">
          {REGIONS.map((region) => (
            <div key={region}>
              <h3 className="text-xs font-bold text-ink-muted">{region}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {PREFECTURES.filter((p) => p.region === region).map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={hrefFor({ ...state, pref: p.slug })}
                      className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm text-navy-800 hover:border-navy-600 hover:bg-navy-50"
                    >
                      {p.name}
                      {counts[p.slug] ? (
                        <span className="ml-1 text-xs text-ink-faint">
                          {counts[p.slug]}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-ink-muted">
          各都道府県のページ（応援メッセージ・地域のニュース）は{" "}
          <Link href="/prefectures" className="underline hover:text-navy-800">
            都道府県一覧
          </Link>{" "}
          から。
        </p>
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
