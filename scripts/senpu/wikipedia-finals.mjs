/**
 * Wikipedia「全国高等学校野球選手権◯◯大会」の**歴代代表校の表**を読む。
 *
 * ------------------------------------------------------------------
 * ★ 何に使うか（2026-11-04）
 *
 *   地方大会の勝ち上がり（生成物）は出典が県ごとに違い、
 *   **三重では決勝の勝者が逆に出ていたことがある**（README「三重の決勝が1件まちがっていた」）。
 *   公立旋風の記事は「決勝」や「優勝」を言い切るので、
 *   **別の出典（Wikipedia の表）と突き合わせてから書く。**
 *   表にあるのは 年度・参加校数・優勝校・決勝スコア・準優勝校・全国大会の成績。
 *
 * ★ wikitext は `scripts/fetch-wikipedia-pages.mjs` が `data/wikipedia-cache/pages/` に貯める
 *   （**要約モデルを通さない**。AGENTS.md「甲子園のスコアを WebFetch の要約で取らない」）。
 *   このディレクトリは .gitignore 済み。無ければ次で取る:
 *
 *     node scripts/fetch-wikipedia-pages.mjs "全国高等学校野球選手権神奈川大会" ...
 *
 * ★ 列の並びは記事ごとに少しずつ違う（兵庫は期間・球場の列が挟まる）。
 *   **決勝スコアのセルを目印にして、その左が優勝校・右が準優勝校**と読む。
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib.mjs";

/** 地区の slug → Wikipedia の記事名 */
export const ARTICLE_OF_DISTRICT = {
  kanagawa: "全国高等学校野球選手権神奈川大会",
  "higashi-tokyo": "全国高等学校野球選手権東東京大会",
  "nishi-tokyo": "全国高等学校野球選手権西東京大会",
  osaka: "全国高等学校野球選手権大阪大会",
  aichi: "全国高等学校野球選手権愛知大会",
  chiba: "全国高等学校野球選手権千葉大会",
  saitama: "全国高等学校野球選手権埼玉大会",
  hyogo: "全国高等学校野球選手権兵庫大会",
  fukuoka: "全国高等学校野球選手権福岡大会",
  "minami-hokkaido": "全国高等学校野球選手権南北海道大会",
  "kita-hokkaido": "全国高等学校野球選手権北北海道大会",
  shizuoka: "全国高等学校野球選手権静岡大会",
};

const clean = (s) =>
  s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/<br\s*\/?>/g, " / ")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

const loaded = new Map();

export function loadArticle(title) {
  if (loaded.has(title)) return loaded.get(title);
  const file = path.join(ROOT, "data", "wikipedia-cache", "pages", `${title}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Wikipedia の記事がキャッシュにありません: ${title}\n` +
        `  node scripts/fetch-wikipedia-pages.mjs "${title}"`,
    );
  }
  const wikitext = JSON.parse(fs.readFileSync(file, "utf8")).wikitext;
  loaded.set(title, wikitext);
  return wikitext;
}

/**
 * 歴代代表校の表を行にする。
 * @returns {{year:number, block:string|null, entrants:number|null, champion:string,
 *            championNote:string|null, score:string, runnerUp:string, koshien:string}[]}
 */
export function parseFinals(title) {
  const text = loadArticle(title);
  const start = text.indexOf("歴代代表校");
  const body = text.slice(start >= 0 ? start : 0);
  const rows = [];
  let lastYear = null;
  for (const chunk of body.split(/\n\|-\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.startsWith("|") || l.startsWith("!"));
    if (!lines.length) continue;
    const joined = lines.map((l) => l.replace(/^[|!]/, "")).join("||");
    const cells = joined
      .split("||")
      .map((c) => c.replace(/^\s*(rowspan|colspan)=\d+\s*\|/, "").replace(/^\s*style="[^"]*"\s*\|/, ""));
    const cc = cells.map(clean);
    if (cc.length < 4) continue;
    const ym = cc[0].match(/(\d{4})年/);
    let year = ym ? Number(ym[1]) : null;
    let block = null;
    if (!year) {
      // 記念大会で東西・南北に分かれた2行目（年のセルが無い）
      if (lastYear && /^[東西南北]/.test(cc[0])) {
        year = lastYear;
        block = cc[0];
      } else continue;
    } else lastYear = year;
    const isScore = (s) => /^\d+x?[-－ー]\d+x?$/.test(s.replace(/\s+/g, ""));
    const si = cc.findIndex((c, i) => i >= 1 && isScore(c.split(" / ")[0]));
    // 中止・独自大会などで得点が無い行
    if (si < 1) continue;
    const champion = cc[si - 1];
    const entrantsCell = cc[si - 2] ?? "";
    // 「北99校」のようにブロックの印が入っていることがある
    const blockFromEntrants = entrantsCell.match(/^([東西南北])\d+/)?.[1] ?? null;
    rows.push({
      year,
      block: block ?? (blockFromEntrants ? blockFromEntrants : null),
      entrants: entrantsCell.match(/\d+/)?.[0] ? Number(entrantsCell.match(/\d+/)[0]) : null,
      champion: champion.replace(/（.*?）|\(.*?\)/g, "").trim(),
      championNote: champion.match(/（(.*?)）/)?.[1] ?? null,
      score: cc[si].split(" / ")[0].replace(/\s+/g, ""),
      runnerUp: (cc[si + 1] ?? "").replace(/（.*?）|\(.*?\)/g, "").replace(/\s*\/.*$/, "").trim(),
      koshien: (cc[cc.length - 1] ?? "").trim(),
    });
  }
  return rows;
}

/** 地区・年（・東西南北の印）で1行引く */
export function finalRow(districtSlug, year, blockHint = null) {
  const title = ARTICLE_OF_DISTRICT[districtSlug];
  if (!title) return null;
  const rows = parseFinals(title).filter((r) => r.year === year);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  if (blockHint) {
    const hit = rows.find((r) => r.block === blockHint);
    if (hit) return hit;
  }
  return rows[0];
}
