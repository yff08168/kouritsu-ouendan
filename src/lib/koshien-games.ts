/**
 * 甲子園（春の選抜・夏の選手権）の**試合単位の結果**。
 *
 * データ本体は `scripts/build-koshien-games.mjs` が作る**生成物**
 * （`src/lib/data/koshien-games.ts`）。出典は ja.wikipedia の大会記事の wikitext。
 *
 * ------------------------------------------------------------------
 * ★**`school_championships`（DB）とは別物。**
 *
 *   あちらは「どの学校が何年に出て、どこまで勝ち上がったか」の**学校ごとの記録**。
 *   こちらは**試合そのもの**（対戦相手・スコア・日付）。
 *
 * ★**私立も入っている。** 甲子園は全試合が揃って初めて大会の記録になる
 * （地方大会で私立の戦績も引用しているのと同じ考え方）。
 */

export type KoshienGameTeam = {
  /** 大会記事の表記（「県岐阜商」「日大三」） */
  display: string;
  score: number;
  won: boolean;
  /** サヨナラ（wikitext の `6x`） */
  walkOff?: boolean;
};

export type KoshienGame = {
  year: number;
  season: "spring" | "summer";
  /** 第N回 */
  no: number;
  /** 「第107回全国高等学校野球選手権大会」 */
  tournament: string;
  /** 「1回戦」「準々決勝」「決勝」。記事に回戦名が無い段は null */
  round: string | null;
  /** 「2025-08-23」。記事に日付が無ければ null */
  date: string | null;
  /** 「延長10回 TB」など、記事が添えている注記 */
  note: string | null;
  teams: KoshienGameTeam[];
};

/**
 * その学校の甲子園の試合を拾う。
 *
 * ★★**校名は「完全一致」でしか結び付けない。**
 * 大会記事の表記は略称（「県岐阜商」「日大三」）で、**部分一致で拾うと
 * 別の学校に当たる**（「横浜」と「横浜清陵」、「市和歌山」と「和歌山」）。
 * ★**当たらなければ出さない。** 取りこぼすほうが、誤って別の学校の
 * 戦績を出すよりましである。
 *
 * @param names その学校として認めてよい表記（学校マスタの校名・一覧用の短い校名など）
 */
export function koshienGamesOf(
  games: readonly KoshienGame[],
  names: readonly string[],
): KoshienGame[] {
  const want = new Set(names.map(normalizeKoshienName).filter(Boolean));
  if (!want.size) return [];
  return games.filter((g) => g.teams.some((t) => want.has(normalizeKoshienName(t.display))));
}

/**
 * 照合用にそろえる。**画面に出す表記は変えない。**
 *
 * ★**カタカナの「ニ」が漢数字として使われている**記事がある
 * （第97回選抜の「ニ松学舎大付」）。生成側でも直しているが、
 * **学校マスタ側から来る名前にも同じ掃除をかける。**
 */
export function normalizeKoshienName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/[ヶケ]/g, "ケ")
    .replace(/\s+/g, "")
    .replace(/高等学校$|高校$/, "")
    .trim();
}
