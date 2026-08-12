/**
 * 大会ごとの出場校数・試合数を src/lib/data/koshien-tournaments.ts に書き出す。
 *
 *   node scripts/build-koshien-summary.mjs
 *
 * 何に使うか:
 *   「甲子園に出た学校のうち公立は何校か」を年ごとに出すための**分母**。
 *   分子（公立の出場校数）はDBの school_championships から数えるが、
 *   分母は私立を含む全出場校なのでDBには無い（このサイトは公立しか収録しない）。
 *
 * 出典は data/koshien-appearances.json、つまり Wikipedia の大会別記事。
 * 分子と分母が同じ出典から来るので、比率としての整合が取れる。
 *
 * ★ 分子は「学校マスタと照合できた公立校」なので、統廃合や表記ゆれで
 *   取りこぼした分だけ**少なめに出る**（README「残っている取りこぼし」）。
 *   画面には概数である旨を添えること。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IN = path.join(ROOT, "data", "koshien-appearances.json");
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-tournaments.ts");

if (!existsSync(IN)) {
  console.error(`${path.relative(ROOT, IN)} が無い。先に build-koshien-seed.mjs を実行すること。`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(IN, "utf8"));

const tournaments = (data.tournaments ?? [])
  .filter((t) => t.year && (t.season === "spring" || t.season === "summer"))
  .map((t) => ({
    year: t.year,
    season: t.season,
    no: t.no,
    schoolCount: t.schoolCount ?? (t.schools?.length ?? 0),
    gameCount: t.gameCount ?? 0,
  }))
  .sort((a, b) => a.year - b.year || a.season.localeCompare(b.season));

// 同じ年・同じ季に2件あったら取り込みが二重になっている（README の検証1参照）
const seen = new Set();
const duplicated = [];
for (const t of tournaments) {
  const key = `${t.year}:${t.season}`;
  if (seen.has(key)) duplicated.push(key);
  seen.add(key);
}

const years = tournaments.map((t) => t.year);
console.log(`大会数: ${tournaments.length}（${Math.min(...years)}〜${Math.max(...years)}）`);
console.log(`  春: ${tournaments.filter((t) => t.season === "spring").length}`);
console.log(`  夏: ${tournaments.filter((t) => t.season === "summer").length}`);
console.log(`自己検証（同じ年・同じ季の重複）: ${duplicated.length} 件 ${duplicated.join(" ")}`);

const lines = tournaments.map(
  (t) =>
    `  { year: ${t.year}, season: "${t.season}", no: ${t.no}, ` +
    `schoolCount: ${t.schoolCount}, gameCount: ${t.gameCount} },`,
);

const ts = `/**
 * 甲子園（春の選抜・夏の選手権）の大会ごとの出場校数・試合数。
 *
 * ★ このファイルは scripts/build-koshien-summary.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia.org の大会別記事（CC BY-SA 4.0）。事実データのみ。
 *
 * 「出場校のうち公立は何校か」を出すときの**分母**として使う。
 * 分子はDBの school_championships（このサイトが収録している公立校）から数える。
 * 中止になった大会（1918・1941・2020）は1試合も行われていないため含まれていない。
 */

export type KoshienTournament = {
  year: number;
  season: "spring" | "summer";
  /** 第N回 */
  no: number;
  /** 出場校数（私立を含む） */
  schoolCount: number;
  gameCount: number;
};

export const KOSHIEN_TOURNAMENTS: readonly KoshienTournament[] = [
${lines.join("\n")}
];

/** 年 + 季 で引くための索引 */
export const TOURNAMENT_BY_KEY = new Map(
  KOSHIEN_TOURNAMENTS.map((t) => [\`\${t.year}:\${t.season}\`, t]),
);
`;

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, ts, "utf8");
console.log(`書き出し: ${path.relative(ROOT, OUT)}（${tournaments.length} 件）`);
