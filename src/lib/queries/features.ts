import { SAMPLE_FEATURES } from "@/lib/sample-data";
import type { FeatureSummary } from "@/types/app";

// TODO(Phase 3): 中身を Supabase のクエリに差し替える。

/** トップページの特集枠 */
export async function getLatestFeatures(limit = 4): Promise<FeatureSummary[]> {
  return SAMPLE_FEATURES.slice(0, limit);
}
