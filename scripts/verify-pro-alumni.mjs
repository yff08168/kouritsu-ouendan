/**
 * 公立高校出身のプロ野球選手の一覧（src/lib/data/pro-alumni/）を、別の記事と突き合わせて検算する。
 *
 *   node scripts/verify-pro-alumni.mjs            … 検算して報告（食い違いが多ければ終了コード 1）
 *   node scripts/verify-pro-alumni.mjs --list     … 食い違いを全部出す
 *
 * ------------------------------------------------------------------
 * ★★ 何と何を突き合わせるか
 *
 *   取り込み（build-pro-alumni.mjs）は**選手の記事の Infobox の「経歴」**だけを読む。
 *   検算は、**ドラフト会議の記事（年ごとの別の記事）の表の「所属」**と突き合わせる。
 *   2つは**編集している場所も人も別**なので、どちらかの読み違い・書き違いを止められる。
 *
 *   ① **プロに入る直前の所属**: 経歴の「最初のNPB球団の1つ前」（高校から直接入った選手なら高校、
 *      大学・社会人を経たならその大学・チーム）と、ドラフトの表の所属を比べる。
 *   ② **高校から直接入った選手**は、①がそのまま「高校名が正しいか」の検算になる。
 *      **大学・社会人を経た選手の高校名は、この検算では確かめられない**（ドラフトの表は直前の所属しか
 *      持たない）。**ここは経歴欄1か所だけが根拠**で、報告にその人数を出す。
 *
 * ★ 比べ方は「記事名が同じ」か「校名・チーム名の中身（高校・大学・野球部を落とした形）が一方に含まれる」。
 *   **厳しくしすぎると表記ゆれで大量に落ち、緩めすぎると検算にならない**ので、食い違いは全部出して目で見る。
 * ★ **わざと誤りを入れて止まることを確かめてある**（2026-11-25。報告の末尾）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { classify, sameAffiliation } from "./lib/pro-careers.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLAYERS = path.join(ROOT, "data", "wikipedia-cache", "pro-players.json");
const DRAFT = path.join(ROOT, "data", "wikipedia-cache", "pro-draft.json");
const OUT_DIR = path.join(ROOT, "src", "lib", "data", "pro-alumni");
const LIST = process.argv.includes("--list");

if (!existsSync(DRAFT)) {
  console.error("data/wikipedia-cache/pro-draft.json が無い。node scripts/fetch-pro-draft-wikipedia.mjs を先に");
  process.exit(2);
}

const players = JSON.parse(readFileSync(PLAYERS, "utf8")).players;
const draft = JSON.parse(readFileSync(DRAFT, "utf8")).years;

/** 経歴の「プロに入る直前の所属」 */
function lastBeforePro(p) {
  const items = p.careers.map((it) => ({ ...it, kind: classify(it) }));
  const npbAt = items.findIndex((it) => it.kind === "npb");
  if (npbAt <= 0) return null;
  return items.slice(0, npbAt).filter((it) => it.kind !== "junior").at(-1) ?? null;
}

const rowsByTitle = new Map(); // `${年}|${記事名}` → 行
for (const [y, v] of Object.entries(draft)) {
  for (const r of v.picks ?? []) if (r.player.title) rowsByTitle.set(`${y}|${r.player.title}`, r);
}

let noRow = 0;
let comparable = 0;
let ok = 0;
const bad = [];
let directOk = 0;
let directBad = 0;
for (const [title, p] of Object.entries(players)) {
  if (!p?.draftYear || !p.careers?.length) continue;
  const row = rowsByTitle.get(`${p.draftYear}|${title}`);
  if (!row) { noRow++; continue; }
  const pre = lastBeforePro(p);
  if (!pre) continue;
  comparable++;
  const direct = classify(pre) === "hs";
  if (sameAffiliation(pre, row)) {
    ok++;
    if (direct) directOk++;
  } else {
    if (direct) directBad++;
    bad.push(`${p.draftYear} ${title}｜経歴: ${pre.link ?? pre.label}｜ドラフトの表: ${row.affil.link ?? row.affil.label}（${row.team} ${row.rank}）`);
  }
}

console.log("— ① プロ入り直前の所属（選手記事の経歴 ↔ ドラフト記事の表）—");
console.log(`ドラフトの表に行が見つからず比べられなかった ${noRow}（ドラフト外・育成前・記事名のずれ）`);
console.log(`比べた ${comparable} 人 → 一致 ${ok}（${((ok / comparable) * 100).toFixed(1)}%）／ 食い違い ${bad.length}`);
console.log(`  うち高校から直接入った選手: 一致 ${directOk} ／ 食い違い ${directBad}`);
for (const b of (LIST ? bad : bad.slice(0, 25))) console.log("  ✗ " + b);
if (!LIST && bad.length > 25) console.log(`  …ほか ${bad.length - 25} 件（--list で全部）`);

// ② 出力の整合
console.log("\n— ② 出力（src/lib/data/pro-alumni/）の整合 —");
let outPlayers = 0;
let indirect = 0;
let problems = 0;
const seen = new Set();
for (const f of readdirSync(OUT_DIR)) {
  if (!f.endsWith(".json") || ["index.json", "draft.json"].includes(f)) continue;
  const file = JSON.parse(readFileSync(path.join(OUT_DIR, f), "utf8"));
  for (const s of file.schools) {
    for (const pl of s.players) {
      outPlayers++;
      if (pl.route.length > 0) indirect++;
      const key = `${s.slug ?? s.officialName}|${pl.name}|${pl.draft?.year ?? pl.entryYear}`;
      if (seen.has(key)) { problems++; console.log("  ✗ 重複: " + key); }
      seen.add(key);
      if (pl.teams.length === 0) { problems++; console.log("  ✗ 球団が空: " + pl.name); }
    }
  }
}
const index = JSON.parse(readFileSync(path.join(OUT_DIR, "index.json"), "utf8"));
if (index.total !== outPlayers) { problems++; console.log(`  ✗ index の人数 ${index.total} とファイルの人数 ${outPlayers} が違う`); }
console.log(`出力 ${outPlayers} 人（うち大学・社会人などを経た ${indirect} 人）／ 問題 ${problems}`);
console.log(
  `★ 高校名の根拠が**経歴欄1か所だけ**の選手（直前の所属がドラフトの表で確かめられない）: 大学・社会人を経た ${indirect} 人`,
);

// 食い違いが多ければ止める。実測（2026-11-25）は 0.8%（37/4,677）。上限はその約2.5倍
const MAX_BAD_RATE = 0.02;
const rate = bad.length / Math.max(comparable, 1);
if (problems > 0 || rate > MAX_BAD_RATE) {
  console.log(`\nNG: 食い違い率 ${(rate * 100).toFixed(1)}%（上限 ${MAX_BAD_RATE * 100}%）／ 整合の問題 ${problems}`);
  process.exit(1);
}
console.log(`\nOK: 食い違い率 ${(rate * 100).toFixed(1)}%（上限 ${MAX_BAD_RATE * 100}%）`);
