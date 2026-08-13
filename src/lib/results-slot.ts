import { latestGameDate, type LiveResults } from "@/lib/live-results";
import type { RegionalPickups } from "@/lib/regional-results";

/**
 * トップの「結果速報」の枠に、甲子園と地方大会のどちらを出すか。
 *
 * ------------------------------------------------------------------
 * ★**今日の日付で判定しない。**
 *
 *   日付で「8月は甲子園」のように切ると、大会の谷間に何も出ない期間ができる。
 *   雨天順延で日程がずれることもある。このプロジェクトは同じ理由で、
 *   色分けに使う「今年」も今日の日付ではなく出場歴の最新年から決めている
 *   （`src/app/page.tsx` の `thisYear`）。
 *
 *   **判定はデータそのものから。「最後の試合が新しいほうを出す」。**
 *
 *     夏の甲子園の期間中   甲子園(8月) > 地方大会(7月)      → 甲子園
 *     甲子園が終わって秋季へ 地方大会(8月末〜) > 甲子園(8/22) → 地方大会
 *     冬（大会の無い時期）   地方大会(10月) > 甲子園(8月)     → 地方大会（秋季の結果を出し続ける）
 *     春の選抜             甲子園(3月) > 地方大会(前年10月)  → 甲子園
 *
 *   大会が終わった瞬間ではなく、**次の大会の1試合目が入った時点**で
 *   切り替わる。空の枠を出さずに済む。
 *
 * ------------------------------------------------------------------
 * 片方しかデータが無ければ、あるほうを出す。
 */
export type ResultsSlot = "koshien" | "regional";

/**
 * 甲子園の生成物が持つ日付は「8月12日」で年が入っていない。
 * 比較のために年を足して ISO にそろえる。
 */
function koshienLatestIso(results: LiveResults): string | null {
  const label = latestGameDate(results.games);
  if (!label) return null;
  const m = label.match(/(\d+)月(\d+)日/);
  if (!m) return null;
  return `${results.year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function pickResultsSlot(
  koshien: LiveResults,
  regional: RegionalPickups,
): ResultsSlot {
  const koshienDate = koshienLatestIso(koshien);
  const regionalDate = regional.latestDate;

  if (!regionalDate) return "koshien";
  if (!koshienDate) return "regional";
  /*
    **同じ日なら甲子園を優先する。** 甲子園の初日と地方大会の最終日が
    重なることがあり、そのときに見たいのは甲子園のほう。
  */
  return regionalDate > koshienDate ? "regional" : "koshien";
}
