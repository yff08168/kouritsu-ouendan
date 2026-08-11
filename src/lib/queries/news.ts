import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  escapeLikePattern,
  throwIfError,
  toImageRef,
  toPrefectureRef,
} from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG, type NewsCategory } from "@/lib/constants";
import type { NewsDetailRow, NewsRow } from "@/types/database";
import type { NewsDetail, NewsSummary } from "@/types/app";

/**
 * 一覧で使う列。
 * status で絞っていないのは、RLS が公開済みの行しか返さないため。
 * アプリ側の条件に頼らずDBで塞ぐ、という方針（0002_rls.sql）。
 */
const NEWS_SUMMARY_SELECT = `
  id, slug, title, summary, category, published_at, source_name,
  image_url, image_credit, image_source_url,
  prefecture:prefectures ( name, slug )
`;

function toNewsSummary(row: NewsRow): NewsSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    // published_at が null の行はこの関数に渡さない（呼び出し側で除外済み）
    publishedAt: row.published_at as string,
    prefecture: toPrefectureRef(row.prefecture),
    image: toImageRef(row, row.title),
    sourceName: row.source_name,
  };
}

/** 最新ニュースを公開日の新しい順に取得する */
export async function getLatestNews(limit = 6): Promise<NewsSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("news")
    .select(NEWS_SUMMARY_SELECT)
    .order("published_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "ニュースの取得");

  const rows = (data ?? []) as unknown as NewsRow[];
  return rows.filter((row) => row.published_at !== null).map(toNewsSummary);
}

const NEWS_DETAIL_SELECT = `
  ${NEWS_SUMMARY_SELECT},
  body, source_url, seo_title, seo_description
`;

export type NewsListParams = {
  category?: NewsCategory;
  prefectureSlug?: string;
  page?: number;
  perPage?: number;
};

export type NewsListResult = {
  news: NewsSummary[];
  total: number;
  page: number;
  totalPages: number;
};

/** ニュース一覧。カテゴリ・都道府県で絞り込める。 */
export async function getNewsList({
  category,
  prefectureSlug,
  page = 1,
  perPage = 20,
}: NewsListParams): Promise<NewsListResult> {
  const supabase = createSupabaseServerClient();
  const currentPage = Math.max(1, Math.floor(page));
  const from = (currentPage - 1) * perPage;

  let query = supabase
    .from("news")
    .select(NEWS_SUMMARY_SELECT, { count: "exact" });

  if (category) {
    query = query.eq("category", category);
  }
  if (prefectureSlug) {
    const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
    query = query.eq("prefecture_id", prefecture?.id ?? -1);
  }

  const { data, error, count } = await query
    .order("published_at", { ascending: false })
    .range(from, from + perPage - 1);

  throwIfError(error, "ニュース一覧の取得");

  const rows = (data ?? []) as unknown as NewsRow[];
  const total = count ?? 0;

  return {
    news: rows.filter((row) => row.published_at !== null).map(toNewsSummary),
    total,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** slug から1件。見つからなければ null。 */
export async function getNewsBySlug(slug: string): Promise<NewsDetail | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("news")
    .select(NEWS_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "ニュースの取得");
  if (!data) return null;

  const row = data as unknown as NewsDetailRow;
  if (row.published_at === null) return null;

  return {
    ...toNewsSummary(row),
    body: row.body,
    sourceUrl: row.source_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

/** generateStaticParams 用 */
export async function getAllNewsSlugs(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("news").select("slug");
  throwIfError(error, "ニュースslugの取得");
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
}

/** 記事下の「他のニュース」。同じカテゴリを優先して出す。 */
export async function getRelatedNews(
  currentSlug: string,
  category: NewsCategory,
  limit = 4,
): Promise<NewsSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("news")
    .select(NEWS_SUMMARY_SELECT)
    .eq("category", category)
    .neq("slug", currentSlug)
    .order("published_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "関連ニュースの取得");

  const rows = (data ?? []) as unknown as NewsRow[];
  return rows.filter((row) => row.published_at !== null).map(toNewsSummary);
}

/**
 * ある学校に関連づけられたニュース。
 *
 * !inner を付けて中間テーブルを内部結合し、その学校に紐づく記事だけに絞る。
 * 中間テーブルのRLSは「親のニュースと学校が両方公開済み」を要求するので、
 * 下書き記事がここから漏れることはない。
 */
export async function getNewsBySchool(
  schoolId: string,
  limit = 6,
): Promise<NewsSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("news")
    .select(`${NEWS_SUMMARY_SELECT}, news_schools!inner ( school_id )`)
    .eq("news_schools.school_id", schoolId)
    .order("published_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "関連ニュースの取得");

  const rows = (data ?? []) as unknown as NewsRow[];
  return rows.filter((row) => row.published_at !== null).map(toNewsSummary);
}

/**
 * 見出しと要約からニュースを探す。
 *
 * 本文（body）は対象にしていない。件数が増えたときに重くなるのと、
 * 本文の断片だけが一致しても利用者の求める記事とは限らないため。
 */
export async function searchNews(
  q: string,
  limit = 10,
): Promise<NewsSummary[]> {
  if (!q) return [];

  const supabase = createSupabaseServerClient();

  // .or() は条件をカンマ区切りで解釈するため、検索語にカンマが入ると
  // フィルタ自体が壊れる。値を二重引用符で包んで1つの値として扱わせる。
  const pattern = `"%${escapeLikePattern(q).replace(/"/g, '\\"')}%"`;

  const { data, error } = await supabase
    .from("news")
    .select(NEWS_SUMMARY_SELECT)
    .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
    .order("published_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "ニュースの検索");

  const rows = (data ?? []) as unknown as NewsRow[];
  return rows.filter((row) => row.published_at !== null).map(toNewsSummary);
}
