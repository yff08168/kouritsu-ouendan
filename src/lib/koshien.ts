import type { Championship } from "@/types/app";

/**
 * 甲子園の到達段階を良い順に並べたもの。
 *
 * 値は `scripts/build-koshien-seed.mjs` が入れるものと対応している。
 * 勝ち抜き戦の勝敗グラフから決勝までの距離を数えて決めているので、
 * ここに無い文字列は基本的に入らない。将来ベスト128まで増えても
 * 困らないよう、見つからないものは最下位として扱う。
 */
export const RESULT_ORDER = [
  "優勝",
  "準優勝",
  "ベスト4",
  "ベスト8",
  "ベスト16",
  "ベスト32",
  "ベスト64",
  "初戦敗退",
] as const;

export type KoshienResult = (typeof RESULT_ORDER)[number];

/**
 * 良いほど小さい数を返す。未知の値と null は最下位。
 *
 * null（成績不明）を最下位にしているのは並べ替えの都合であって、
 * 「初戦敗退より下」という意味ではない。**表示では必ず区別すること。**
 */
export function resultRank(result: string | null): number {
  if (!result) return Number.MAX_SAFE_INTEGER;
  const i = RESULT_ORDER.indexOf(result as KoshienResult);
  return i < 0 ? Number.MAX_SAFE_INTEGER - 1 : i;
}

/**
 * 到達段階に添える説明。
 * 「ベスト16」だけでは何回戦で負けたのか伝わらないため、
 * 決勝からの距離で決めているという実際の意味を書く。
 */
export const RESULT_NOTE: Record<string, string> = {
  優勝: "全国制覇",
  準優勝: "決勝で敗退",
  ベスト4: "準決勝で敗退",
  ベスト8: "準々決勝で敗退",
};

const rank = resultRank;

/**
 * 春・夏それぞれの最高成績。バッジの表示に使う。
 *
 * 成績が不明（`result` が null）の出場しかない季は null を返す。
 * **「出場したが成績が分からない」を「初戦敗退」と混同しない。**
 */
export function bestResultBySeason(
  championships: Championship[],
): Record<"spring" | "summer", { result: string; year: number } | null> {
  const best: Record<"spring" | "summer", { result: string; year: number } | null> = {
    spring: null,
    summer: null,
  };

  for (const c of championships) {
    if (c.season !== "spring" && c.season !== "summer") continue;
    if (!c.result) continue;
    const current = best[c.season];
    if (current === null || rank(c.result) < rank(current.result)) {
      best[c.season] = { result: c.result, year: c.year };
    }
  }

  return best;
}
