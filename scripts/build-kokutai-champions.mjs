/**
 * 国民スポーツ大会（旧・国民体育大会）高校野球競技・硬式の部の歴代優勝校を
 * Wikipedia から取り込み、src/lib/data/kokutai-champions.ts を生成する。
 *   node scripts/build-kokutai-champions.mjs
 *   node scripts/build-kokutai-champions.mjs --refresh   … キャッシュを無視して取り直す
 *
 * ------------------------------------------------------------------
 * なぜ「優勝校の表」だけなのか（2026-09-21）
 *
 *   国スポの高校野球は、試合ごとの結果を毎年安定して取れる出典が見つかっていない。
 *   日本高野連が出すのは組み合わせと出場校の告知だけで、結果は各年の開催地の
 *   国スポのサイトにあり、年ごとに別サイトで数年で消える。Wikipedia にも
 *   回ごとの記事は無い。**取れるのは親記事の「歴代優勝校一覧」だけ**なので、
 *   まずそれを取り込む（解説ページ `/guide/kokutai` の「歴代優勝校」に使う）。
 *
 * ★ 取り込むのは事実だけ（回・年・優勝校・県・決勝のスコア・準優勝校）。
 *   注記の文章は取り込まず、脚注の名前（rain4 / draw / nocontest）から
 *   自分の言葉で短い注記を付ける（CC BY-SA の継承条件を発動させない。
 *   `build-21st-century.mjs` と同じ線）。
 * ★ 軟式の部は取らない（このサイトは硬式だけ）。
 * ★ 学校マスタとの照合はここではしない。画面で `getSchoolNameIndex("koshien")` を使う
 *   （甲子園の大会ページと同じ規則で公立を判定する。ずらすと食い違う）。
 *
 * ------------------------------------------------------------------
 * 表の形（2026-09-21 に全83行を見て決めた）
 *
 *   通常の行:  | [[第N回…|N]] ||[[YYYY年]]|| 優勝（県） || S-S || 準優勝（県） || 軟式…
 *   雨天で複数校優勝:  硬式のセルが colspan="3" で「A（県）S‐S B（県）<br />C（県）…」
 *   決勝が引き分けで両校優勝:  優勝のセルが「A（県）<br />B（県）」、スコア 10-10、準優勝 -
 *   優勝校なし:  colspan="3" |（優勝校なし<ref name="nocontest"/>）
 *   行が2行に割れている年（2018・2023）:  2行目が `| colspan="3" |A（県）4-3B（県）`
 *   ★ セルの区切りは `||` と行頭の `|` の2種類。★ 得点の「-」は U+2010 のこともある。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const CACHE_FILE = path.join(CACHE_DIR, "kokutai-main.json");
const OUT = path.join(ROOT, "src", "lib", "data", "kokutai-champions.ts");

const ARTICLE = "国民スポーツ大会高等学校野球競技";
const SECTION = "歴代優勝校一覧";

// HTTPヘッダはASCIIしか通らない。ここに日本語を書くと fetch が落ちる。
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";

const REFRESH = process.argv.includes("--refresh");

// ------------------------------------------------------------------
// 取得
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

async function loadArticle() {
  if (!REFRESH && existsSync(CACHE_FILE)) {
    return { ...JSON.parse(readFileSync(CACHE_FILE, "utf8")), cached: true };
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const got = await fetchWikitext(ARTICLE);
  writeFileSync(CACHE_FILE, JSON.stringify(got), "utf8");
  return { ...got, cached: false };
}

// ------------------------------------------------------------------
// wikitext の解析
// ------------------------------------------------------------------

/** 表の行（`|-` で区切られた塊）を、行頭の `|` を `||` に寄せて1本にする */
function tableRows(wikitext) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((l) => l.includes(SECTION));
  if (start < 0) throw new Error(`節「${SECTION}」が見つからない`);
  const rows = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^==/.test(line) || /^\|\}/.test(line)) break;
    if (/^\{\|/.test(line) || /^!/.test(line)) continue;
    if (/^\|-/.test(line)) {
      if (current) rows.push(current);
      current = [];
      continue;
    }
    if (/^\|/.test(line)) {
      if (!current) current = [];
      current.push(line.slice(1));
    }
  }
  if (current && current.length) rows.push(current);
  return rows.map((parts) => parts.join("||"));
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

/** `colspan="3" align="center" |中身` の属性を外す。colspan の値を返す */
function unwrapAttrs(cell) {
  const m = cell.match(/^\s*((?:[a-z]+="[^"]*"\s*)+)\|\s*([\s\S]*)$/);
  if (!m) return { colspan: 1, text: cell };
  const cs = m[1].match(/colspan="(\d+)"/);
  return { colspan: cs ? Number(cs[1]) : 1, text: m[2] };
}

/** 脚注の名前を拾ってから、脚注を落とす */
function refNames(text) {
  return [...text.matchAll(/<ref name="([^"]+)"/g)].map((m) => m[1]);
}
function stripRefs(text) {
  return text.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
}
function plain(text) {
  return stripRefs(text)
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[　]/g, " ")
    .trim();
}

/** 「大阪府」「兵庫県」と書かれた年がある（1984・1999）。他の行と同じく「大阪」「兵庫」に寄せる */
function normalizePref(p) {
  if (p === "東京都") return "東京";
  return p.replace(/[府県]$/, "");
}

/** 「校名（県）」→ { name, prefecture } */
function team(text) {
  const t = plain(text).replace(/\s+/g, " ").trim();
  if (!t || t === "-" || t === "－") return null;
  const m = t.match(/^(.+?)\s*[（(]\s*([^（()）]+?)\s*[）)]\s*$/);
  if (!m) return { name: t, prefecture: null };
  return { name: m[1].trim(), prefecture: normalizePref(m[2].trim()) };
}

/** 「A（県）4‐1 B（県）」→ { champion, score, runnerUp } */
function matchLine(text) {
  const t = plain(text).replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[）)])\s*(\d+)\s*[-‐－−–]\s*(\d+)\s*(.+?[）)])\s*(抽選勝ち)?$/);
  if (!m) return { champion: team(t), score: null, runnerUp: null };
  return { champion: team(m[1]), score: `${m[2]}-${m[3]}`, runnerUp: team(m[4]) };
}

function noteFor(refs, count) {
  if (refs.includes("nocontest")) return "雨天のため打ち切り。優勝校なし";
  if (refs.some((r) => /^rain/.test(r))) return `雨天のため打ち切り。大会規定により${count}校優勝`;
  if (refs.includes("draw")) return "決勝が引き分けで両校優勝";
  if (count > 1) return `${count}校優勝`;
  return null;
}

function parseRow(row) {
  const cells = splitCells(row).map(unwrapAttrs);
  if (cells.length < 3) return null;
  const edition = plain(cells[0].text);
  const yearText = plain(cells[1].text);
  const ym = yearText.match(/(\d{4})/);
  if (!/^\d+$|^特$/.test(edition) || !ym) return null;
  const year = Number(ym[1]);

  const hard = cells[2];
  const refs = refNames(hard.text);
  if (hard.colspan >= 3) {
    // 1つのセルに「A（県）S-S B（県）」が <br /> で並ぶ
    const segs = hard.text.split(/<br\s*\/?>/i).map((s) => stripRefs(s)).filter((s) => plain(s));
    if (segs.length === 1 && /優勝校なし/.test(plain(segs[0]))) {
      return { edition, year, champions: [], score: null, runnerUp: null, note: noteFor(refs, 0) };
    }
    const parsed = segs.map(matchLine);
    if (parsed.length === 1 && parsed[0].score) {
      return { edition, year, champions: [parsed[0].champion], score: parsed[0].score, runnerUp: parsed[0].runnerUp, note: null };
    }
    const champions = parsed.map((p) => p.champion).filter(Boolean);
    return { edition, year, champions, score: null, runnerUp: null, note: noteFor(refs, champions.length) };
  }

  const champCell = cells[2].text;
  const refs2 = refNames(champCell);
  const champions = champCell.split(/<br\s*\/?>/i).map(team).filter(Boolean);
  const scoreText = plain(cells[3]?.text ?? "");
  const sm = scoreText.match(/(\d+)\s*[-‐－−–]\s*(\d+)/);
  const score = sm ? `${sm[1]}-${sm[2]}` : null;
  const runnerUp = team(cells[4]?.text ?? "");
  const note = champions.length > 1 ? noteFor(refs2, champions.length) : null;
  return { edition, year, champions, score, runnerUp: champions.length > 1 ? null : runnerUp, note };
}

// ------------------------------------------------------------------
// main
// ------------------------------------------------------------------

const article = await loadArticle();
console.log(`記事: ${article.title}（${article.cached ? "キャッシュ" : "取得"}）`);

const rows = tableRows(article.wikitext);
const entries = rows.map(parseRow).filter(Boolean);
console.log(`表の行: ${rows.length}／読めた行: ${entries.length}`);

// ---- 自己検証 ----
const problems = [];
for (const e of entries) {
  if (e.champions.length === 0 && !e.note) problems.push(`${e.year}: 優勝校が読めない`);
  if (e.champions.length === 1 && !e.score) problems.push(`${e.year}: 決勝のスコアが読めない`);
  if (e.champions.length === 1 && !e.runnerUp) problems.push(`${e.year}: 準優勝校が読めない`);
  for (const c of e.champions) if (!c.prefecture) problems.push(`${e.year}: ${c.name} の県が読めない`);
  if (e.score && !/^\d+-\d+$/.test(e.score)) problems.push(`${e.year}: スコアの形 ${e.score}`);
}
const years = entries.map((e) => e.year);
const dupYears = years.filter((y, i) => years.indexOf(y) !== i && y !== 1973);
if (dupYears.length) problems.push(`年が重複: ${[...new Set(dupYears)].join(", ")}`);
console.log(`自己検証: ${problems.length} 件`);
if (problems.length) console.log(problems.map((p) => "  " + p).join("\n"));

for (const e of entries) {
  const ch = e.champions.map((c) => `${c.name}（${c.prefecture ?? "?"}）`).join("・") || "（なし）";
  console.log(`  ${e.year} 第${e.edition}回  ${ch}  ${e.score ?? ""}  ${e.runnerUp ? `準優勝 ${e.runnerUp.name}（${e.runnerUp.prefecture ?? "?"}）` : ""}  ${e.note ?? ""}`);
}

// ---- 出力 ----
const q = (v) => (v == null ? "null" : JSON.stringify(v));
const teamTs = (t) => (t ? `{ name: ${q(t.name)}, prefecture: ${q(t.prefecture)} }` : "null");
const lines = entries
  .sort((a, b) => a.year - b.year || a.edition.localeCompare(b.edition))
  .map(
    (e) =>
      `  { edition: ${q(e.edition)}, year: ${e.year}, champions: [${e.champions.map(teamTs).join(", ")}], ` +
      `score: ${q(e.score)}, runnerUp: ${teamTs(e.runnerUp)}, note: ${q(e.note)} },`,
  );

const ts = `/**
 * 国民スポーツ大会（旧・国民体育大会）高校野球競技・硬式の部の歴代優勝校。
 *
 * ★ このファイルは scripts/build-kokutai-champions.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia.org「${article.title}」の「${SECTION}」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（回・年・優勝校・県・決勝のスコア・準優勝校）。
 * 注記は脚注の名前から自分の言葉で付けている（記事の文章は取り込まない）。
 * 軟式の部は取っていない。学校マスタとの照合は画面側（\`getSchoolNameIndex("koshien")\`）。
 *
 * 毎年10月の大会後に \`node scripts/build-kokutai-champions.mjs --refresh\` で更新する。
 */

export type KokutaiTeam = {
  /** 記事内での表記（「浪華商」など） */
  name: string;
  /** 表に書かれている都道府県名 */
  prefecture: string | null;
};

export type KokutaiChampion = {
  /** 第N回。特別国体は「特」 */
  edition: string;
  year: number;
  /** 優勝校。雨天打ち切りや決勝の引き分けで複数のことがある。優勝校なしは空 */
  champions: KokutaiTeam[];
  /** 決勝のスコア（優勝校が1校のときだけ） */
  score: string | null;
  /** 準優勝校（優勝校が1校のときだけ） */
  runnerUp: KokutaiTeam | null;
  /** 「雨天のため打ち切り。大会規定により4校優勝」など */
  note: string | null;
};

/** 出典表示。ページに必ず出す。 */
export const KOKUTAI_SOURCE = {
  title: ${q(article.title)},
  url: "https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}#${encodeURIComponent(SECTION)}",
  license: "CC BY-SA 4.0",
  fetchedAt: ${q(article.fetchedAt ?? null)},
} as const;

export const KOKUTAI_CHAMPIONS: readonly KokutaiChampion[] = [
${lines.join("\n")}
];
`;

writeFileSync(OUT, ts, "utf8");
console.log(`書き出し: ${path.relative(ROOT, OUT)}（${entries.length}件）`);
