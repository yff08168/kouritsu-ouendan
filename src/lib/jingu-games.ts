/**
 * 明治神宮野球大会（**高校の部**）の試合結果。
 *
 * データ本体は `scripts/build-jingu-games.mjs` が作る**生成物**
 * （`src/lib/data/jingu-games.ts`）。
 * 出典は公益財団法人 日本学生野球協会（大会の主催者）。
 *
 * ★★**大学の部は入っていない。** 同じ日程表に並ぶが、このサイトは高校野球なので
 * 取っていない（混ぜると「立命館大」「青山学院大」が高校の戦績に出る）。
 *
 * ★**私立も入っている。** 明治神宮大会は秋の地区大会の優勝校が集まる大会で、
 * 出場校はほとんどが私立になる。**全試合を引用して、着目するところを公立にする**
 * という方針（地方大会・甲子園と同じ）。
 */

import raw from "@/lib/data/jingu-games.json";

/** ★生成物は JSON。型はここで1回だけ与える（甲子園と同じ理由） */
export const JINGU_GAMES = raw as unknown as readonly JinguGame[];

export type JinguGameTeam = {
  /** 出典の表記から「高」を落としたもの（`英明高` → `英明`） */
  display: string;
  score: number;
  won: boolean;
};

export type JinguGame = {
  year: number;
  /** 「2025年 明治神宮野球大会 高校の部」 */
  tournament: string;
  /** 「1回戦」「準決勝」「決勝」 */
  round: string | null;
  /** 「2025-11-19」 */
  date: string | null;
  teams: JinguGameTeam[];
};

/**
 * その学校の明治神宮大会の試合を拾う。
 *
 * ★★**校名は「完全一致」でしか結び付けない**（甲子園と同じ）。
 * 出典の表記は略称なので、**部分一致で拾うと別の学校に当たる。**
 * ★**当たらなければ出さない。**
 */
export function jinguGamesOf(
  games: readonly JinguGame[],
  names: readonly string[],
): JinguGame[] {
  const want = new Set(names.map(normalizeJinguName).filter(Boolean));
  if (!want.size) return [];
  return games.filter((g) => g.teams.some((t) => want.has(normalizeJinguName(t.display))));
}

/** 照合用にそろえる。**画面に出す表記は変えない。** */
export function normalizeJinguName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/[ヶケ]/g, "ケ")
    .replace(/\s+/g, "")
    .replace(/高等学校$|高校$|高$/, "")
    .trim();
}
