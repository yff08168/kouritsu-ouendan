import { SAMPLE_SCHOOLS } from "@/lib/sample-data";
import type { SchoolSummary } from "@/types/app";

// TODO(Phase 3): 中身を Supabase のクエリに差し替える。

/** トップページの「注目の公立高校」枠 */
export async function getFeaturedSchools(limit = 3): Promise<SchoolSummary[]> {
  return SAMPLE_SCHOOLS.slice(0, limit);
}

/** 都道府県ごとの収録校数（都道府県セレクタのバッジ表示に使う） */
export async function getSchoolCountByPrefecture(): Promise<
  Record<string, number>
> {
  const counts: Record<string, number> = {};
  for (const school of SAMPLE_SCHOOLS) {
    counts[school.prefecture.slug] = (counts[school.prefecture.slug] ?? 0) + 1;
  }
  return counts;
}
