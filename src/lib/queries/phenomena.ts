import { SAMPLE_PHENOMENA } from "@/lib/sample-data";
import type { PhenomenonSummary } from "@/types/app";

// TODO(Phase 3): 中身を Supabase のクエリに差し替える。

/** トップページの「公立旋風」注目枠。highlight_rank 順に取得する想定 */
export async function getHighlightedPhenomena(
  limit = 3,
): Promise<PhenomenonSummary[]> {
  return SAMPLE_PHENOMENA.slice(0, limit);
}
