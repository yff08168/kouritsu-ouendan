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
import { KOSHIEN_GAMES, prefectureKey, samePrefecture } from "@/lib/koshien-games";

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
  pref?: string,
): JinguGame[] {
  const want = new Set(names.map(normalizeJinguName).filter(Boolean));
  if (!want.size) return [];
  return games.filter((g) =>
    g.teams.some(
      (t) =>
        want.has(normalizeJinguName(t.display)) &&
        samePrefecture(jinguPrefectureOf(t.display), pref),
    ),
  );
}

/**
 * 神宮の出場校の都道府県を、**甲子園の生成物から借りる**（2026-08-26）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ借りるのか
 *
 *   神宮の出典（日本学生野球協会の日程表）は**都道府県を書いていない。**
 *   そのままだと**別の県の同名校に当たる** —— 実際に
 *   **2000年・2010年の「金沢」（石川・私立）が、学校マスタの「金沢高校」＝
 *   横浜市立金沢（神奈川）の戦績として画面に出ていた。**
 *
 *   ★**神宮に出るのは秋の地区大会の代表**なので、**そのほとんどが甲子園にも出ている。**
 *   甲子園の生成物には代表校の表から取った県が入っているので、そこから引く。
 *
 * ★★**県が1つに決まる校名だけ使う。** 同じ校名で複数の県に当たるものは
 * **借りずに「分からない」とする**（分からなければ照合は今までどおり）。
 * ★**これは推測ではあるので、照合を「厳しくする」方向にだけ使う。**
 */
// ★同じ理由で、読み込み時ではなく最初に呼ばれたときに作る
let cachedJinguPrefecture: Map<string, string> | null = null;
const jinguPrefecture = () => (cachedJinguPrefecture ??= buildJinguPrefecture());

const buildJinguPrefecture = () => {
  const found = new Map<string, Set<string>>();
  for (const g of KOSHIEN_GAMES) {
    for (const t of g.teams) {
      if (!t.pref) continue;
      const key = normalizeJinguName(t.display);
      const set = found.get(key) ?? new Set<string>();
      set.add(prefectureKey(t.pref));
      found.set(key, set);
    }
  }
  const out = new Map<string, string>();
  for (const [key, set] of found) if (set.size === 1) out.set(key, [...set][0]);
  return out;
};

export function jinguPrefectureOf(display: string): string | undefined {
  return jinguPrefecture().get(normalizeJinguName(display));
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
