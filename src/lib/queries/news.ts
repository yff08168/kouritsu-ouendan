import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import type { NewsRow } from "@/types/database";
import type { NewsSummary } from "@/types/app";

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
