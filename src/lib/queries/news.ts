import { SAMPLE_NEWS } from "@/lib/sample-data";
import type { NewsSummary } from "@/types/app";

// TODO(Phase 3): 中身を Supabase のクエリに差し替える。
// 呼び出し側（ページ・コンポーネント）は変更不要にする。

/** 最新ニュースを公開日の新しい順に取得する */
export async function getLatestNews(limit = 6): Promise<NewsSummary[]> {
  return [...SAMPLE_NEWS]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}
