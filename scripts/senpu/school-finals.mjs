/**
 * 地方大会（夏）の**決勝に進んだ回数**を、Wikipedia「全国高等学校野球選手権◯◯大会」の
 * 歴代代表校の表から学校ごとに出す。**文章は書かない。**
 *
 *   node scripts/senpu/school-finals.mjs <地区slug> <校名> [<校名> ...]
 *   例) node scripts/senpu/school-finals.mjs fukuoka 東筑 久留米商
 *
 * ★ 表は記事ごとに列の並びが違う。**決勝スコアのセルを目印**にしている（wikipedia-finals.mjs）。
 * ★ 「甲子園の成績」の列は、表のものと、サイトの甲子園データ（koshien-games.json）の
 *   出場校の表を並べて出す。**食い違いは目で確かめる。**
 * ★ 校名は表の書き方のまま完全一致（改称・統合した学校は別の校名で出る。同じ学校でも数えない）。
 */
import { parseFinals, ARTICLE_OF_DISTRICT } from "./wikipedia-finals.mjs";
import { koshienAppearances, normalizeName, prefectureKey } from "./lib.mjs";

const [, , district, ...names] = process.argv;
if (!district || !names.length || !ARTICLE_OF_DISTRICT[district]) {
  console.error("使い方: node scripts/senpu/school-finals.mjs <地区slug> <校名> ...");
  console.error("地区:", Object.keys(ARTICLE_OF_DISTRICT).join(" "));
  process.exit(1);
}

const PREF = {
  kanagawa: "神奈川", "higashi-tokyo": "東東京", "nishi-tokyo": "西東京", osaka: "大阪", aichi: "愛知",
  chiba: "千葉", saitama: "埼玉", hyogo: "兵庫", fukuoka: "福岡",
};
const rows = parseFinals(ARTICLE_OF_DISTRICT[district]);
console.log(`${ARTICLE_OF_DISTRICT[district]}: 表の行 ${rows.length}（${rows[0]?.year}〜${rows.at(-1)?.year}）`);

const koshien = koshienAppearances();
function koshienResult(name, year) {
  const t = koshien.find((x) => x.year === year && x.season === "summer");
  const hit = t?.schools.find(
    (s) => normalizeName(s.short) === normalizeName(name) && (s.prefs ?? []).some((p) => prefectureKey(p) === prefectureKey(PREF[district] ?? "")),
  );
  return hit ? `${hit.appearanceText}／${hit.wins}勝${hit.losses}敗／${hit.result}` : "（甲子園の表に当たらず）";
}

for (const name of names) {
  const champ = rows.filter((r) => r.champion === name);
  const runner = rows.filter((r) => r.runnerUp === name);
  console.log(`\n■ ${name}  優勝${champ.length}回・準優勝${runner.length}回（決勝${champ.length + runner.length}回）`);
  const all = [...champ.map((r) => ({ r, kind: "優勝" })), ...runner.map((r) => ({ r, kind: "準優勝" }))].sort((a, b) => a.r.year - b.r.year);
  for (const { r, kind } of all) {
    const opp = kind === "優勝" ? r.runnerUp : r.champion;
    console.log(
      `  ${r.year}${r.block ? `(${r.block})` : ""} ${kind} ${r.score}${kind === "優勝" ? " ○" : " ●"} ${opp}` +
        `  参加${r.entrants ?? "?"}校 表の全国:${r.koshien.slice(0, 16)}` +
        (kind === "優勝" ? `  甲子園データ:${koshienResult(name, r.year)}` : "") +
        (r.championNote && kind === "優勝" ? `  注:${r.championNote}` : ""),
    );
  }
}
