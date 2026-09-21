/**
 * 甲子園（春の選抜・夏の選手権）の**歴代優勝校・準優勝校・決勝のスコア**を
 * ja.wikipedia の2記事から作る → `src/lib/data/koshien-champions.ts`
 *
 *   node scripts/build-koshien-champions.mjs [--refresh]
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-09-21。運営者の「甲子園の歴代優勝校一覧」）
 *
 *   優勝校・準優勝校・決勝のスコアは `koshien-games.json`（大会記事から読んだ全試合）に
 *   すでにあるが、**都道府県が取れない大会がある**（古い大会の代表校の表は「東海」「四国」
 *   のような地区名。実測で優勝校8大会・準優勝校6大会）。「都道府県別の優勝回数」を出すには
 *   **全部の大会で都道府県が要る。**
 *
 *   ★**歴代優勝校の記事は全大会に都道府県が付いている**（外地は「満州」「台湾」）。
 *   ★★**しかも出典がまるごと別**（大会ごとの記事 vs 一覧の記事）なので、
 *   **優勝校・準優勝校・スコアの突き合わせ**が、大会記事の読み違いを外から止める検算になる。
 *
 * ★ 取り込むのは**事実だけ**（回・年・校数・優勝校・県・決勝のスコア・準優勝校・県・決勝の日付）。
 *   備考の文章（「◯◯勢初優勝」「優勝投手は…」）は取らない（21世紀枠・国スポと同じ線）。
 *   ★記事は「バーチャル高校野球『甲子園の戦績』を基に作成」と書いているが、
 *   **取っているのは ja.wikipedia の記事**で、しかも事実（誰が勝ったか・点数）だけ。
 *   画面に出す校名とスコアは大会記事から読んだ試合（`finalists`）を使い、
 *   **こちらは都道府県の補いと検算に使う**（下の `--` の説明）。
 *
 * ★★ 検算は3つ
 *   ① 記事の中だけで閉じるもの: 回が1から最後まで欠けない（中止の行も数える）／
 *      各行に優勝校・県・スコア・準優勝校・県がそろう／年が重複しない
 *   ② `koshien-games.json` の決勝と**優勝校・準優勝校・スコアが一致する**（202大会）。
 *      ★**1件でも食い違ったら書き出さない**（どちらが誤りかは人が見る）。
 *      校名は記事ごとに略し方が違う（早稲田実／早実）ので、正規化して部分列なら同じとみなす。
 *   ③ 記事の「都道府県別優勝回数一覧」の回数と、この表から数えた回数を突き合わせる
 *      （あちらは更新が遅れることがあるので ℹ️ に留める）。
 *
 * ★ 引き分け再試合の年（1969年夏・2006年夏）はスコアの欄に2つ並ぶ（`0 - 0<br />4 - 2`）。
 *   **最後のものが決着したスコア。** 前のものは `replay` に持つ。
 * ★ 中止の行（1918年・1941年・2020年）は `colspan` のセルになっている。回の欠けの検算にだけ使う。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-champions.ts");
const GAMES = path.join(ROOT, "src", "lib", "data", "koshien-games.json");
const SUPPLEMENTS = path.join(ROOT, "src", "lib", "data", "koshien-supplements.json");
const REFRESH = process.argv.includes("--refresh");
// HTTPヘッダはASCIIしか通らない。ここに日本語を書くと fetch が落ちる。
const UA = "kouritsu-ouendan/1.0 (site data build; https://github.com/yff08168/kouritsu-ouendan)";

const ARTICLES = [
  { season: "summer", title: "全国高等学校野球選手権大会歴代優勝校", cache: "koshien-champions-summer.json" },
  { season: "spring", title: "選抜高等学校野球大会歴代優勝校", cache: "koshien-champions-spring.json" },
];
const SECTION = "=== 歴代優勝校一覧 ===";
const PREF_SECTION = "=== 都道府県別優勝回数一覧 ===";
// ★都道府県別の表の「地区」の列。**東京は地区の欄にも「東京」と書かれている**
const REGIONS = new Set(["北海道", "東北", "関東", "東京", "北信越", "東海", "近畿", "中国", "四国", "九州", "九州・沖縄"]);

// ------------------------------------------------------------------
// 取得（キャッシュあり）
// ------------------------------------------------------------------

async function fetchWikitext(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
    "&prop=wikitext&redirects=1&page=" +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${title}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia: ${json.error.info}`);
  return { title: json.parse.title, wikitext: json.parse.wikitext, fetchedAt: new Date().toISOString() };
}

async function loadArticle(a) {
  const file = path.join(CACHE_DIR, a.cache);
  if (!REFRESH && existsSync(file)) {
    return { ...JSON.parse(readFileSync(file, "utf8")), cached: true };
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const got = await fetchWikitext(a.title);
  writeFileSync(file, JSON.stringify(got), "utf8");
  return { ...got, cached: false };
}

// ------------------------------------------------------------------
// wikitext の解析
// ------------------------------------------------------------------

/** 節の中の行だけ（次の見出しまで） */
function sectionLines(wikitext, heading) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`節「${heading}」が見つからない`);
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^==/.test(line)) break;
    out.push(line);
  }
  return out;
}

/**
 * 表の行（`|-` で区切られた塊）を1本にする。
 * ★節の中に表が2つある記事もある（`|}` で止めない。`{|` `|}` `|+` `!` の行は飛ばす）。
 */
function tableRows(lines) {
  const rows = [];
  let current = null;
  for (const line of lines) {
    if (/^\{\|/.test(line) || /^\|\}/.test(line) || /^\|\+/.test(line) || /^!/.test(line)) continue;
    if (/^\|-/.test(line)) {
      if (current && current.length) rows.push(current);
      current = [];
      continue;
    }
    if (/^\|/.test(line)) {
      if (!current) current = [];
      current.push(line.slice(1));
    } else if (current && current.length && line.trim()) {
      // セルの中身が次の行に続いている（`|` で始まらない行）
      current[current.length - 1] += line;
    }
  }
  if (current && current.length) rows.push(current);
  return rows.map((parts) => parts.join("||"));
}

/** 脚注・注釈テンプレート・コメントを落とす。`{{By2|1915}}` は年に戻す */
function cleanRow(row) {
  let s = row
    .replace(/<!--[\s\S]*?-->/g, "")
    // `{{By2|1915}}年` がふつう。**2020年の中止の行だけ `{{By|2020年}}`**
    .replace(/\{\{By2?\|(\d{4})年?\}\}/g, "$1")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  // 内側から順に {{…}} を消す（refnest・efn などの注釈）
  for (let i = 0; i < 20 && /\{\{/.test(s); i++) s = s.replace(/\{\{[^{}]*\}\}/g, "");
  return s;
}

/** `||` で割る。`[[ ]]` の中の `|` は区切りではない */
function splitCells(row) {
  const cells = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < row.length; i++) {
    if (row.startsWith("[[", i)) { depth++; cur += "[["; i++; continue; }
    if (row.startsWith("]]", i)) { depth = Math.max(0, depth - 1); cur += "]]"; i++; continue; }
    if (depth === 0 && row.startsWith("||", i)) { cells.push(cur); cur = ""; i++; continue; }
    cur += row[i];
  }
  cells.push(cur);
  return cells;
}

/** `colspan="4"|中身` `nowrap="nowrap" |中身` の属性を外す */
function unwrapAttrs(cell) {
  const m = cell.match(/^\s*((?:[a-z]+="[^"]*"\s*)+)\|\s*([\s\S]*)$/);
  if (!m) return { colspan: 1, text: cell };
  const cs = m[1].match(/colspan="(\d+)"/);
  return { colspan: cs ? Number(cs[1]) : 1, text: m[2] };
}

function plain(text) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 「大阪府」「東京都」と書かれていても「大阪」「東京」に寄せる。北北海道・西東京はそのまま */
function normalizePref(p) {
  if (p === "東京都") return "東京";
  if (/^(北|南)北海道$|^(東|西)東京$/.test(p)) return p;
  return p.replace(/[府県]$/, "");
}

/** 「校名（県）」→ { name, prefecture } */
function team(text) {
  const t = plain(text);
  if (!t) return null;
  const m = t.match(/^(.+?)\s*[（(]\s*([^（()）]+?)\s*[）)]\s*$/);
  if (!m) return { name: t, prefecture: null };
  return { name: m[1].trim(), prefecture: normalizePref(m[2].trim()) };
}

/** スコアの欄。引き分け再試合は2つ並ぶ。**最後のものが決着したスコア** */
function scores(text) {
  const t = plain(text.replace(/<br\s*\/?>/gi, " / "));
  const out = [];
  for (const m of t.matchAll(/(\d+)(x?)\s*[-‐－−–]\s*(\d+)(x?)/gi)) {
    out.push({ a: Number(m[1]), b: Number(m[3]), walkOff: Boolean(m[2] || m[4]) });
  }
  return out;
}

function parseRow(row, season) {
  const cells = splitCells(cleanRow(row)).map(unwrapAttrs);
  if (cells.length < 4) return null;
  const edition = plain(cells[0].text);
  if (!/^\d+$/.test(edition)) return null;
  const no = Number(edition);
  const dateText = plain(cells[1].text);
  const ym = dateText.match(/(\d{4})/);
  if (!ym) return null;
  const year = Number(ym[1]);
  const md = [...dateText.matchAll(/(\d{1,2})月(\d{1,2})日/g)];
  const last = md.at(-1);
  const finalDate = last
    ? `${year}-${String(last[1]).padStart(2, "0")}-${String(last[2]).padStart(2, "0")}`
    : null;
  const countText = plain(cells[2].text);
  const schoolCount = /^\d+$/.test(countText) ? Number(countText) : null;

  if (cells[3].colspan >= 2) {
    return { season, no, year, cancelled: true, reason: plain(cells[3].text).slice(0, 40) };
  }
  const champion = team(cells[3].text);
  const sc = scores(cells[4]?.text ?? "");
  const runnerUp = team(cells[5]?.text ?? "");
  const decided = sc.at(-1) ?? null;
  return {
    season,
    no,
    year,
    schoolCount,
    champion,
    score: decided ? `${decided.a}-${decided.b}` : null,
    walkOff: decided ? decided.walkOff : false,
    replay: sc.slice(0, -1).map((s) => `${s.a}-${s.b}`),
    runnerUp,
    finalDate,
  };
}

/** 記事の「都道府県別優勝回数一覧」→ Map<県, 回数> */
function parsePrefTable(lines) {
  const out = new Map();
  for (const row of tableRows(lines)) {
    // ★回数の欄は `※6`（注記つき）や `'''14'''`（太字）で書かれることがある。数字だけ見る
    const cells = splitCells(cleanRow(row)).map((c) => plain(unwrapAttrs(c).text));
    if (cells.length < 3) continue;
    const num = (c) => (/^\D?\d+$/.test(c) ? Number(c.replace(/\D/g, "")) : null);
    let pref, count;
    if (num(cells[1]) !== null) {
      [pref, count] = [cells[0], num(cells[1])];
    } else if (REGIONS.has(cells[0]) && num(cells[2]) !== null) {
      [pref, count] = [cells[1], num(cells[2])];
    } else {
      continue;
    }
    out.set(normalizePref(pref), count);
  }
  return out;
}

// ------------------------------------------------------------------
// 検算②のための正規化（`normalizeKoshienName` と同じ規則＋新旧字体を少し広く）
// ------------------------------------------------------------------

const OLD_KANJI = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵", 辯: "弁", 瀧: "滝", 龍: "竜", 櫻: "桜",
};
function norm(s) {
  return s
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/[ヶケ]/g, "ケ")
    .replace(/\s+/g, "")
    .replace(/高等学校$|高校$|高$/, "")
    .replace(/./g, (c) => OLD_KANJI[c] ?? c)
    .replace(/商業$/, "商")
    .replace(/工業$/, "工")
    .replace(/農業$/, "農")
    .replace(/附/g, "付")
    .trim();
}
function sameName(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = short === x ? y : x;
  return short.length >= 2 && long.includes(short);
}
/** `prefectureKey`（koshien-games.ts）と同じ規則。記念大会の「北大阪」「東神奈川」も県に寄せる */
const prefKey = (p) =>
  (p ?? "")
    .replace(/^(北|南)北海道$/, "北海道")
    .replace(/^(東|西)東京$/, "東京")
    .replace(/^[東西南北](神奈川|大阪|愛知|埼玉|千葉|福岡|兵庫)$/, "$1");

// ------------------------------------------------------------------
// main
// ------------------------------------------------------------------

const rowsAll = [];
const prefTables = {};
const sources = {};
for (const a of ARTICLES) {
  const article = await loadArticle(a);
  console.log(`記事: ${article.title}（${article.cached ? "キャッシュ" : "取得"}）`);
  sources[a.season] = {
    name: `ja.wikipedia「${article.title}」`,
    url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
  };
  const rows = tableRows(sectionLines(article.wikitext, SECTION));
  const parsed = rows.map((r) => parseRow(r, a.season)).filter(Boolean);
  console.log(`  表の行: ${rows.length}／読めた行: ${parsed.length}（中止 ${parsed.filter((p) => p.cancelled).length}）`);
  rowsAll.push(...parsed);
  prefTables[a.season] = parsePrefTable(sectionLines(article.wikitext, PREF_SECTION));
}

// ---- 検算① 記事の中だけで閉じるもの ----
const problems = [];
for (const season of ["summer", "spring"]) {
  const rows = rowsAll.filter((r) => r.season === season);
  const nos = new Set(rows.map((r) => r.no));
  const max = Math.max(...nos);
  for (let i = 1; i <= max; i++) if (!nos.has(i)) problems.push(`${season}: 第${i}回が表に無い`);
  const years = rows.filter((r) => !r.cancelled).map((r) => r.year);
  const dup = years.filter((y, i) => years.indexOf(y) !== i);
  if (dup.length) problems.push(`${season}: 年が重複 ${[...new Set(dup)].join(", ")}`);
  for (const r of rows) {
    if (r.cancelled) continue;
    const at = `${r.year}${season === "spring" ? "春" : "夏"}`;
    if (!r.champion?.name) problems.push(`${at}: 優勝校が読めない`);
    if (!r.champion?.prefecture) problems.push(`${at}: 優勝校の県が読めない（${r.champion?.name}）`);
    if (!r.runnerUp?.name) problems.push(`${at}: 準優勝校が読めない`);
    if (!r.runnerUp?.prefecture) problems.push(`${at}: 準優勝校の県が読めない（${r.runnerUp?.name}）`);
    if (!r.score) problems.push(`${at}: スコアが読めない`);
    if (r.score) {
      const [x, y] = r.score.split("-").map(Number);
      if (!(x > y)) problems.push(`${at}: 優勝校の得点が準優勝校より多くない（${r.score}）`);
    }
    for (const d of r.replay) {
      const [x, y] = d.split("-").map(Number);
      if (x !== y) problems.push(`${at}: 再試合の前のスコアが引き分けでない（${d}）`);
    }
  }
}
console.log(`検算①（記事の中）: ${problems.length} 件`);
if (problems.length) console.log(problems.map((p) => "  ⚠️ " + p).join("\n"));

// ---- 検算② koshien-games.json の決勝と突き合わせる ----
const games = [
  ...JSON.parse(readFileSync(GAMES, "utf8")),
  ...(existsSync(SUPPLEMENTS) ? JSON.parse(readFileSync(SUPPLEMENTS, "utf8")) : []),
];
const finalsByKey = new Map();
for (const g of games) {
  if (g.round !== "決勝") continue;
  const key = `${g.year}-${g.season}`;
  const list = finalsByKey.get(key) ?? [];
  list.push(g);
  finalsByKey.set(key, list);
}
const mismatches = [];
const prefNotes = [];
let compared = 0;
for (const r of rowsAll) {
  if (r.cancelled) continue;
  const key = `${r.year}-${r.season}`;
  const finals = finalsByKey.get(key);
  if (!finals) continue;
  const decided = finals.find((g) => g.teams.some((t) => t.won));
  if (!decided) {
    mismatches.push(`${key}: 大会記事のほうに決着した決勝が無い`);
    continue;
  }
  compared++;
  const w = decided.teams.find((t) => t.won);
  const l = decided.teams.find((t) => !t.won);
  const at = `${r.year}${r.season === "spring" ? "春" : "夏"}`;
  if (!sameName(w.display, r.champion.name)) mismatches.push(`${at}: 優勝校 記事「${r.champion.name}」／大会記事「${w.display}」`);
  if (!sameName(l.display, r.runnerUp.name)) mismatches.push(`${at}: 準優勝校 記事「${r.runnerUp.name}」／大会記事「${l.display}」`);
  const gs = `${w.score}-${l.score}`;
  if (gs !== r.score) mismatches.push(`${at}: スコア 記事「${r.score}」／大会記事「${gs}」`);
  if (finals.length - 1 !== r.replay.length) mismatches.push(`${at}: 決勝の試合数 記事 ${r.replay.length + 1}／大会記事 ${finals.length}`);
  if (w.pref && prefKey(w.pref) !== prefKey(r.champion.prefecture)) prefNotes.push(`${at}: 優勝校 ${w.display} の県 記事「${r.champion.prefecture}」／大会記事「${w.pref}」`);
  if (l.pref && prefKey(l.pref) !== prefKey(r.runnerUp.prefecture)) prefNotes.push(`${at}: 準優勝校 ${l.display} の県 記事「${r.runnerUp.prefecture}」／大会記事「${l.pref}」`);
}
console.log(`検算②（大会記事の決勝と突き合わせ）: ${compared} 大会を比べて食い違い ${mismatches.length} 件、県の食い違い ${prefNotes.length} 件`);
if (mismatches.length) console.log(mismatches.map((p) => "  ⚠️ " + p).join("\n"));
if (prefNotes.length) console.log(prefNotes.map((p) => "  ⚠️ " + p).join("\n"));
const notInGames = rowsAll.filter((r) => !r.cancelled && !finalsByKey.has(`${r.year}-${r.season}`));
if (notInGames.length) {
  console.log(`  ℹ️ 大会記事のほうに無い大会 ${notInGames.length} 件: ${notInGames.map((r) => `${r.year}${r.season === "spring" ? "春" : "夏"}`).join(" ")}`);
}

// ---- 検算③ 都道府県別優勝回数一覧と突き合わせる ----
for (const season of ["summer", "spring"]) {
  const counted = new Map();
  for (const r of rowsAll) {
    if (r.cancelled || r.season !== season) continue;
    const k = prefKey(r.champion.prefecture);
    counted.set(k, (counted.get(k) ?? 0) + 1);
  }
  const table = prefTables[season];
  const diffs = [];
  for (const [pref, n] of table) {
    const mine = counted.get(pref) ?? 0;
    if (mine !== n) diffs.push(`${pref} 表 ${n}／数えた ${mine}`);
  }
  for (const [pref, n] of counted) if (!table.has(pref)) diffs.push(`${pref} は表に無い（数えた ${n}）`);
  console.log(`検算③（${season} 都道府県別の表 ${table.size} 県）: 食い違い ${diffs.length} 件${diffs.length ? " ℹ️ " + diffs.join("、") : ""}`);
}

// ---- 一覧 ----
for (const r of [...rowsAll].sort((a, b) => a.year - b.year || (a.season === "spring" ? -1 : 1))) {
  const at = `${r.year}${r.season === "spring" ? "春" : "夏"} 第${r.no}回`;
  if (r.cancelled) { console.log(`  ${at}  中止（${r.reason}）`); continue; }
  console.log(
    `  ${at}  ${r.champion.name}（${r.champion.prefecture}） ${r.score}${r.walkOff ? "x" : ""}${r.replay.length ? ` [再試合 ${r.replay.join(",")}]` : ""} ${r.runnerUp.name}（${r.runnerUp.prefecture}）  ${r.finalDate ?? ""}`,
  );
}

if (problems.length || mismatches.length) {
  console.error(`\n⚠️ 検算に落ちたので書き出さない（記事の中 ${problems.length} 件・大会記事との食い違い ${mismatches.length} 件）`);
  process.exit(1);
}

// ---- 出力 ----
const q = (v) => (v == null ? "null" : JSON.stringify(v));
const entries = rowsAll
  .filter((r) => !r.cancelled)
  .sort((a, b) => a.year - b.year || (a.season === "spring" ? -1 : 1));
const lines = entries.map(
  (r) =>
    `  { season: ${q(r.season)}, no: ${r.no}, year: ${r.year}, schoolCount: ${q(r.schoolCount)}, ` +
    `champion: { name: ${q(r.champion.name)}, prefecture: ${q(r.champion.prefecture)} }, ` +
    `score: ${q(r.score)}, walkOff: ${r.walkOff}, replay: ${JSON.stringify(r.replay)}, ` +
    `runnerUp: { name: ${q(r.runnerUp.name)}, prefecture: ${q(r.runnerUp.prefecture)} }, finalDate: ${q(r.finalDate)} },`,
);

const ts = `/**
 * 甲子園（春の選抜・夏の選手権）の歴代優勝校・準優勝校・決勝のスコア。
 *
 * ★ このファイルは scripts/build-koshien-champions.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia「${ARTICLES[0].title}」「${ARTICLES[1].title}」の「歴代優勝校一覧」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（回・年・校数・優勝校・県・決勝のスコア・準優勝校・県・決勝の日付）。
 * 備考の文章は取り込んでいない。
 * ★★**画面に出す校名とスコアは大会記事から読んだ試合（\`finalists\`）を使う。**
 *   こちらは**都道府県**（大会記事の代表校の表からは取れない古い大会がある）と、
 *   **出典の違う2つの表を突き合わせる検算**のためのもの（生成時に ${compared} 大会すべてで
 *   優勝校・準優勝校・スコアが一致することを確かめてある）。
 * ★ 引き分け再試合の年（1969年夏・2006年夏）は \`replay\` に引き分けのスコアを持つ。
 * ★ 県は「北北海道」「西東京」のように大会の区分で書かれている年がある。
 *   都道府県で数えるときは \`prefectureKey\`（koshien-games.ts）で寄せること。
 *   外地（満州・台湾・朝鮮）の代表校は準優勝にだけある。
 */

export type KoshienChampionTeam = {
  /** 記事の表記（「中京商」「早稲田実」） */
  name: string;
  /** 「愛知」「西東京」「満州」 */
  prefecture: string;
};

export type KoshienChampion = {
  season: "spring" | "summer";
  /** 第N回 */
  no: number;
  year: number;
  /** 出場校数。記事に無ければ null */
  schoolCount: number | null;
  champion: KoshienChampionTeam;
  /** 「4-3」（優勝校の得点が先） */
  score: string;
  /** サヨナラ */
  walkOff: boolean;
  /** 引き分け再試合になった年は、引き分けのスコア（「0-0」）。ふつうは空 */
  replay: string[];
  runnerUp: KoshienChampionTeam;
  /** 決勝（再試合ならその日）の日付。記事に無ければ null */
  finalDate: string | null;
};

export const KOSHIEN_CHAMPIONS_SOURCE = {
  summer: ${JSON.stringify(sources.summer)},
  spring: ${JSON.stringify(sources.spring)},
} as const;

export const KOSHIEN_CHAMPIONS: readonly KoshienChampion[] = [
${lines.join("\n")}
];
`;
writeFileSync(OUT, ts, "utf8");
console.log(`\n書き出した: ${path.relative(ROOT, OUT)}（${entries.length} 大会。夏 ${entries.filter((e) => e.season === "summer").length}・春 ${entries.filter((e) => e.season === "spring").length}）`);
