/**
 * 明治神宮野球大会（**高校の部**）の**歴代の優勝校・準優勝校・決勝のスコア・出場校数**を
 * ja.wikipedia「明治神宮野球大会」の「歴代結果（高校の部）」から作る → `src/lib/data/jingu-champions.ts`
 *
 *   node scripts/build-jingu-champions.mjs [--refresh] [--dry]
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-11-20。運営者の「神宮大会の歴代の結果ページを新たに作成する」）
 *
 *   `jingu-games.json`（全試合）は**1999〜2025年の24大会**（2003・2004年と2020年は無い）しか持っておらず、
 *   **高校の部が始まった第4回（1973年）からの優勝校一覧を作れない。**
 *   ★**記事の表は第4回（1973年）から全大会に「優勝校（地区・県）」が付いている**ので、
 *   地区別・都道府県別の優勝回数もここから数えられる（`/jingu/champions`）。
 *   ★**高校の部は第4回から**（記事が「高校の部は第4回大会から」と書いている）。第1〜3回は高校の部が無い。
 *
 * ★ 取り込むのは**事実だけ**（回・年・校数・優勝校・地区・県・決勝のスコア・準優勝校・地区・県）。
 *   備考の文章（「延長11回」）は取らない（甲子園の歴代優勝校・21世紀枠・国スポと同じ線）。
 *   ★**中止の年（1988年・2020年）は回と年だけ**。理由の文章は取らない。
 *   取得は `data/wikipedia-cache/jingu-champions.json` に控える（`.gitignore` の対象。`--refresh` で取り直し）。
 *
 * ★★ 地区は**出典の表記のまま**持つ（`北海道` `東北` `関東` `東京` `北信越` `東海` `近畿` `中国` `四国` `九州`、
 *   ほかに**古い年は `中部`**）。★**「東京」「北海道」は地区の欄が無く、括弧の中が1語だけ**
 *   （`早稲田実（東京）` `札幌大谷（北海道）`）。地区も県も同じ語を入れる。
 *
 * ★★ 検算は3つ（①②のどれか1つでも合わなければ**書き出さない**）
 *   ① 記事の中だけで閉じるもの: 回が欠けない（中止の行も数える）／年 − 回 が全行で一定／年が重複しない／
 *      各行に優勝校・地区・県・スコア・準優勝校・地区・県・校数がそろう／優勝校の得点が準優勝校より多い／
 *      県が47都道府県のどれか。
 *   ② `jingu-games.json` の決勝と**優勝校・準優勝校・スコア・出場校数が一致する**（1999〜2025年の24大会）。
 *      ★**校名は出典ごとに略し方が違う**（`九州国際大付`／`九州国際大高`）ので、
 *      `build-jingu-games.mjs` の検算C（`sameSchool`）と**同じ規則**（旧字体を寄せ、「高」を落とし、
 *      一方がもう一方を含めば同じ）で比べる。**緩いのは校名の比べ方だけ。**
 *      ★**独立性の限界を隠さない**: `jingu-games.json` の1999〜2012年は同じ ja.wikipedia の**各回の記事**から、
 *      2013〜2025年は**主催者（日本学生野球協会）**から読んだもの。**1973〜1998年と2003・2004年（27大会）は
 *      突き合わせる試合データが無い**ので、②は24大会ぶんしか効かない。
 *   ③ 記事の「都道府県別優勝回数（高校の部）」「学校別優勝回数（高校の部）」と、この表から数えた回数を突き合わせる
 *      （**同じ記事の別の表**。更新が遅れることがあるので ℹ️ に留める）。
 *      ★都道府県別の合計が開催した大会数と合うこと、学校別の準優勝回数（括弧）が合うことは、
 *      **27大会ぶんの優勝校の県・準優勝校を外から確かめる唯一の手がかり**になる。
 *      ★**③b は毎回1件 ℹ️ が出る**（明徳義塾 表2／数えた1）。1981年の優勝校が表で `明徳` と書かれているため
 *      （記事の学校別の表は同じ学校として数える）。**学校ごとの優勝回数を画面に出さない理由そのもの**。
 *      これ以外の食い違いが出たら、記事か読み取りが変わったということなので見ること。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const CACHE_FILE = path.join(CACHE_DIR, "jingu-champions.json");
const OUT = path.join(ROOT, "src", "lib", "data", "jingu-champions.ts");
const GAMES = path.join(ROOT, "src", "lib", "data", "jingu-games.json");
const REFRESH = process.argv.includes("--refresh");
const DRY = process.argv.includes("--dry");
// HTTPヘッダはASCIIしか通らない。ここに日本語を書くと fetch が落ちる。
const UA = "kouritsu-ouendan/1.0 (site data build; https://github.com/yff08168/kouritsu-ouendan)";

const TITLE = "明治神宮野球大会";
const SECTION = /^=+\s*歴代結果（高校の部）\s*=+$/;
const PREF_SECTION = /^=+\s*都道府県別優勝回数（高校の部）\s*=+$/;
const SCHOOL_SECTION = /^=+\s*学校別優勝回数（高校の部）\s*=+$/;

/** 出典が地区の欄に書く語。**古い年は「中部」**。東京・北海道は地区の欄を持たない */
const REGIONS = new Set(["北海道", "東北", "関東", "東京", "北信越", "東海", "近畿", "中国", "四国", "九州", "中部"]);
/** 地区の欄が無く、括弧の中が1語だけで書かれるもの */
const SINGLE_TOKEN = new Set(["北海道", "東京"]);
const PREFECTURES = [
  "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫",
  "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎",
  "熊本", "大分", "宮崎", "鹿児島", "沖縄",
];

// ------------------------------------------------------------------
// 取得（キャッシュあり）
// ------------------------------------------------------------------

async function loadArticle() {
  if (!REFRESH && existsSync(CACHE_FILE)) {
    return { ...JSON.parse(readFileSync(CACHE_FILE, "utf8")), cached: true };
  }
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
    "&prop=wikitext&redirects=1&page=" +
    encodeURIComponent(TITLE);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${TITLE}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia: ${json.error.info}`);
  const got = { title: json.parse.title, wikitext: json.parse.wikitext, fetchedAt: new Date().toISOString() };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(got), "utf8");
  return { ...got, cached: false };
}

// ------------------------------------------------------------------
// wikitext の解析（`build-koshien-champions.mjs` と同じ作り）
// ------------------------------------------------------------------

/** 節の中の行だけ（次の見出しまで）。**見出しの `=` の前後の空白は揺れる**（`==== 都道府県別…（高校の部）====`） */
function sectionLines(wikitext, headingPattern) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((l) => headingPattern.test(l.trim()));
  if (start < 0) throw new Error(`節 ${headingPattern} が見つからない`);
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^==/.test(line)) break;
    out.push(line);
  }
  return out;
}

/**
 * 表の行（`|-` で区切られた塊）を1本にする。
 * ★`{|` `|}` `|+` `!` の行は飛ばす。`{{Col-break}}` のように表の外にある行は `|` で始まらないので落ちる。
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
      current[current.length - 1] += line;
    }
  }
  if (current && current.length) rows.push(current);
  return rows.map((parts) => parts.join("||"));
}

/** 脚注・注釈テンプレート・コメントを落とす。`{{By|1973年}}` は年に戻す */
function cleanRow(row) {
  let s = row
    .replace(/<!--[\s\S]*?-->/g, "")
    // 神宮の表は `{{By|1973年}}`（甲子園の `{{By2|1915}}` とは形が違う）。どちらも年に戻す
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

/** `colspan="5"|中身` の属性を外す */
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

/** 「大阪府」「東京都」と書かれていても「大阪」「東京」に寄せる */
function normalizePref(p) {
  if (p === "東京都") return "東京";
  if (p === "北海道") return p;
  return p.replace(/[府県]$/, "");
}

/**
 * 「校名（地区・県）」→ { name, region, prefecture }。
 * ★**東京と北海道は括弧の中が1語だけ**（`早稲田実（東京）`）。地区も県も同じ語を入れる。
 * ★**読めなければ地区・県は null**（検算①で落とす。当て推量で埋めない）。
 */
function team(text) {
  const t = plain(text);
  if (!t) return null;
  const m = t.match(/^(.+?)\s*[（(]\s*([^（()）]+?)\s*[）)]\s*$/);
  if (!m) return { name: t, region: null, prefecture: null };
  const parts = m[2].split(/[・･]/).map((s) => s.trim());
  const name = m[1].trim();
  if (parts.length === 1) {
    const only = normalizePref(parts[0]);
    return SINGLE_TOKEN.has(only) ? { name, region: only, prefecture: only } : { name, region: null, prefecture: only };
  }
  if (parts.length === 2) return { name, region: parts[0], prefecture: normalizePref(parts[1]) };
  return { name, region: null, prefecture: null };
}

/** スコアの欄。サヨナラは `3x - 2`（x が付くほうが勝ち）。**引き分け再試合は神宮には無い**ので2つ見つかったら検算で落とす */
function scores(text) {
  const t = plain(text);
  const out = [];
  for (const m of t.matchAll(/(\d+)(x?)\s*[-‐－−–]\s*(\d+)(x?)/gi)) {
    out.push({ a: Number(m[1]), b: Number(m[3]), walkOff: Boolean(m[2] || m[4]) });
  }
  return out;
}

function parseRow(row) {
  const cells = splitCells(cleanRow(row)).map(unwrapAttrs);
  if (cells.length < 3) return null;
  const yearText = plain(cells[0].text);
  const ym = yearText.match(/^(\d{4})$/);
  if (!ym) return null;
  const year = Number(ym[1]);
  const noText = plain(cells[1].text);
  if (!/^\d+$/.test(noText)) return null;
  const no = Number(noText);

  // ★中止の行は `colspan="5"|…のため開催中止`（回と年だけ持つ。理由の文章は取らない）
  if (cells[2].colspan >= 2) return { no, year, cancelled: true };

  const countText = plain(cells[2].text);
  const sc = scores(cells[4]?.text ?? "");
  return {
    no,
    year,
    cancelled: false,
    schoolCount: /^\d+$/.test(countText) ? Number(countText) : null,
    champion: team(cells[3]?.text ?? ""),
    scoreCount: sc.length,
    score: sc[0] ? `${sc[0].a}-${sc[0].b}` : null,
    walkOff: sc[0] ? sc[0].walkOff : false,
    runnerUp: team(cells[5]?.text ?? ""),
  };
}

/**
 * 記事の「都道府県別優勝回数（高校の部）」→ Map<県, 回数>。
 * ★**rowspan が絡む表**（地区・県・回数が複数行にまたがる）なので、行では読まず、
 *   「県名 `||` （rowspan 付きでもよい）数字 `|`」の並びを県ごとに探す。
 * ★北海道・東京は地区の欄にも同じ語があるが、そちらは後ろが数字でないので当たらない。
 */
function parsePrefTable(lines) {
  const text = lines.join("\n");
  const out = new Map();
  for (const pref of PREFECTURES) {
    const m = text.match(new RegExp(`\\|(?:rowspan="\\d+"\\|)?${pref}\\|\\|(?:rowspan="\\d+"\\|)?(\\d+)\\|`));
    if (m) out.set(pref, Number(m[1]));
  }
  return out;
}

/**
 * 記事の「学校別優勝回数（高校の部）」→ [{ name, region, prefecture, titles, runnerUps }]。
 * `* 3回 星稜（北信越・石川）：(2)、…` ── 括弧の中が準優勝回数。**優勝2回以上についてのみ**載っている。
 */
function parseSchoolTable(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\*\s*(\d+)回\s+(.*)$/);
    if (!m) continue;
    for (const part of m[2].split("、")) {
      const e = part.match(/^(.+?)[（(]([^）)]+)[）)]\s*[：:]\s*[（(](\d+)[）)]\s*$/);
      if (!e) continue;
      const t = team(`${e[1]}（${e[2]}）`);
      if (t) out.push({ ...t, titles: Number(m[1]), runnerUps: Number(e[3]) });
    }
  }
  return out;
}

// ------------------------------------------------------------------
// 検算②のための照合。**`scripts/build-jingu-games.mjs` の検算C（`sameSchool`）と同じ規則**
// （あちらは import すると全体が走るので、ここに写してある。**変えるときは両方直すこと**）
// ------------------------------------------------------------------

const cleanName = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/\s+/g, "")
    .trim();
const OLD_KANJI = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵",
};
const matchName = (s) =>
  cleanName(s)
    .replace(/[應廣濱澤齋邊穗舘國學榮德淸眞靑藝圓惠]/g, (c) => OLD_KANJI[c] ?? c)
    .replace(/高等学校$|高校$|高$/, "");
const sameSchool = (a, b) => {
  const x = matchName(a);
  const y = matchName(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
};

// ------------------------------------------------------------------
// main
// ------------------------------------------------------------------

const article = await loadArticle();
console.log(`記事: ${article.title}（${article.cached ? "キャッシュ" : "取得"}）`);
const source = {
  name: `ja.wikipedia「${article.title}」`,
  url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
};

const tableLines = sectionLines(article.wikitext, SECTION);
const rawRows = tableRows(tableLines);
const parsed = rawRows.map(parseRow).filter(Boolean);
const held = parsed.filter((r) => !r.cancelled);
const cancelled = parsed.filter((r) => r.cancelled);
console.log(`表の行: ${rawRows.length}／読めた行: ${parsed.length}（中止 ${cancelled.length}）`);

// ---- 検算① 記事の中だけで閉じるもの ----
const problems = [];
if (parsed.length !== rawRows.length) problems.push(`読めなかった行がある（${rawRows.length - parsed.length} 行）`);
const nos = parsed.map((r) => r.no);
const minNo = Math.min(...nos);
const maxNo = Math.max(...nos);
for (let i = minNo; i <= maxNo; i++) if (!nos.includes(i)) problems.push(`第${i}回が表に無い`);
const dupNo = nos.filter((n, i) => nos.indexOf(n) !== i);
if (dupNo.length) problems.push(`回が重複 ${[...new Set(dupNo)].join(", ")}`);
const years = parsed.map((r) => r.year);
const dupYear = years.filter((y, i) => years.indexOf(y) !== i);
if (dupYear.length) problems.push(`年が重複 ${[...new Set(dupYear)].join(", ")}`);
// ★年 − 回 は全行で一定（第4回＝1973年 → 1969）。**回と年は別のセル**なので、どちらかの読み違えを止められる
const offset = parsed[0].year - parsed[0].no;
for (const r of parsed) if (r.year - r.no !== offset) problems.push(`第${r.no}回の年が ${r.year} 年（回 + ${offset} と合わない）`);

for (const r of held) {
  const at = `${r.year}年`;
  const check = (label, t) => {
    if (!t?.name) { problems.push(`${at}: ${label}が読めない`); return; }
    if (!t.region || !REGIONS.has(t.region)) problems.push(`${at}: ${label}の地区が読めない（${t.name} → ${t.region}）`);
    if (!t.prefecture || !PREFECTURES.includes(t.prefecture)) problems.push(`${at}: ${label}の県が読めない（${t.name} → ${t.prefecture}）`);
  };
  check("優勝校", r.champion);
  check("準優勝校", r.runnerUp);
  if (r.schoolCount === null) problems.push(`${at}: 出場校数が読めない`);
  if (r.scoreCount !== 1) problems.push(`${at}: スコアが ${r.scoreCount} 個ある（1個のはず）`);
  if (r.score) {
    const [x, y] = r.score.split("-").map(Number);
    if (!(x > y)) problems.push(`${at}: 優勝校の得点が準優勝校より多くない（${r.score}）`);
  }
}
console.log(`検算①（記事の中）: ${problems.length} 件（第${minNo}回〜第${maxNo}回・年 = 回 + ${offset}）`);
if (problems.length) console.log(problems.map((p) => "  ⚠️ " + p).join("\n"));

// ---- 検算② jingu-games.json の決勝と突き合わせる ----
const games = JSON.parse(readFileSync(GAMES, "utf8"));
const byYear = new Map();
for (const g of games) {
  const list = byYear.get(g.year) ?? [];
  list.push(g);
  byYear.set(g.year, list);
}
const mismatches = [];
let compared = 0;
const notCompared = [];
for (const r of held) {
  const ys = byYear.get(r.year);
  if (!ys) { notCompared.push(r.year); continue; }
  const finals = ys.filter((g) => g.round === "決勝");
  const decided = finals.find((g) => g.teams.some((t) => t.won));
  if (!decided) { mismatches.push(`${r.year}年: 大会のほうに決着した決勝が無い`); continue; }
  compared++;
  const w = decided.teams.find((t) => t.won);
  const l = decided.teams.find((t) => !t.won);
  if (!sameSchool(w.display, r.champion.name)) mismatches.push(`${r.year}年: 優勝校 記事「${r.champion.name}」／大会「${w.display}」`);
  if (!sameSchool(l.display, r.runnerUp.name)) mismatches.push(`${r.year}年: 準優勝校 記事「${r.runnerUp.name}」／大会「${l.display}」`);
  const gs = `${w.score}-${l.score}`;
  if (gs !== r.score) mismatches.push(`${r.year}年: スコア 記事「${r.score}」／大会「${gs}」`);
  const teamCount = new Set(ys.flatMap((g) => g.teams.map((t) => t.display))).size;
  if (r.schoolCount !== teamCount) mismatches.push(`${r.year}年: 出場校数 記事 ${r.schoolCount}／大会 ${teamCount}`);
}
console.log(`検算②（jingu-games.json の決勝と突き合わせ）: ${compared} 大会を比べて食い違い ${mismatches.length} 件`);
if (mismatches.length) console.log(mismatches.map((p) => "  ⚠️ " + p).join("\n"));
if (notCompared.length) {
  console.log(`  ℹ️ 試合データが無く突き合わせていない大会 ${notCompared.length} 件: ${notCompared.sort((a, b) => a - b).join(" ")}`);
}

// ---- 検算③ 記事の都道府県別・学校別の表と突き合わせる（ℹ️） ----
const prefTable = parsePrefTable(sectionLines(article.wikitext, PREF_SECTION));
const counted = new Map();
for (const r of held) counted.set(r.champion.prefecture, (counted.get(r.champion.prefecture) ?? 0) + 1);
const prefDiffs = [];
for (const pref of PREFECTURES) {
  const table = prefTable.get(pref);
  const mine = counted.get(pref) ?? 0;
  if (table === undefined) prefDiffs.push(`${pref} は表から読めない（数えた ${mine}）`);
  else if (table !== mine) prefDiffs.push(`${pref} 表 ${table}／数えた ${mine}`);
}
const tableTotal = [...prefTable.values()].reduce((a, b) => a + b, 0);
console.log(
  `検算③a（都道府県別優勝回数の表 ${prefTable.size} 県・合計 ${tableTotal} 回／開催 ${held.length} 大会）: 食い違い ${prefDiffs.length} 件${prefDiffs.length ? " ℹ️ " + prefDiffs.join("、") : ""}`,
);

const schoolTable = parseSchoolTable(sectionLines(article.wikitext, SCHOOL_SECTION));
const schoolDiffs = [];
for (const s of schoolTable) {
  const wins = held.filter((r) => r.champion.name === s.name && r.champion.prefecture === s.prefecture).length;
  const runs = held.filter((r) => r.runnerUp.name === s.name && r.runnerUp.prefecture === s.prefecture).length;
  if (wins !== s.titles) schoolDiffs.push(`${s.name}（${s.prefecture}）優勝 表 ${s.titles}／数えた ${wins}`);
  if (runs !== s.runnerUps) schoolDiffs.push(`${s.name}（${s.prefecture}）準優勝 表 ${s.runnerUps}／数えた ${runs}`);
}
// ★表に載っているのは「優勝2回以上」だけ。**こちらの数えで2回以上の学校が表に無いのも食い違い**
const inTable = new Set(schoolTable.map((s) => `${s.name}\t${s.prefecture}`));
const winsBySchool = new Map();
for (const r of held) {
  const k = `${r.champion.name}\t${r.champion.prefecture}`;
  winsBySchool.set(k, (winsBySchool.get(k) ?? 0) + 1);
}
for (const [k, n] of winsBySchool) if (n >= 2 && !inTable.has(k)) schoolDiffs.push(`${k.replace("\t", "（")}）は ${n} 回優勝なのに表に無い`);
console.log(
  `検算③b（学校別優勝回数の表 ${schoolTable.length} 校・優勝／準優勝）: 食い違い ${schoolDiffs.length} 件${schoolDiffs.length ? " ℹ️ " + schoolDiffs.join("、") : ""}`,
);

// ---- 一覧 ----
for (const r of [...parsed].sort((a, b) => a.year - b.year)) {
  const at = `${r.year}年 第${r.no}回`;
  if (r.cancelled) { console.log(`  ${at}  中止`); continue; }
  console.log(
    `  ${at}  ${r.schoolCount}校  ${r.champion.name}（${r.champion.region}・${r.champion.prefecture}） ${r.score}${r.walkOff ? "x" : ""} ${r.runnerUp.name}（${r.runnerUp.region}・${r.runnerUp.prefecture}）`,
  );
}

if (problems.length || mismatches.length) {
  console.error(`\n⚠️ 検算に落ちたので書き出さない（記事の中 ${problems.length} 件・大会データとの食い違い ${mismatches.length} 件）`);
  process.exit(1);
}
if (DRY) {
  console.log("\n--dry なので書き出さない");
  process.exit(0);
}

// ---- 出力 ----
const q = (v) => (v == null ? "null" : JSON.stringify(v));
const entries = [...held].sort((a, b) => a.year - b.year);
const teamLit = (t) => `{ name: ${q(t.name)}, region: ${q(t.region)}, prefecture: ${q(t.prefecture)} }`;
const lines = entries.map(
  (r) =>
    `  { no: ${r.no}, year: ${r.year}, schoolCount: ${q(r.schoolCount)}, ` +
    `champion: ${teamLit(r.champion)}, score: ${q(r.score)}, walkOff: ${r.walkOff}, runnerUp: ${teamLit(r.runnerUp)} },`,
);
const cancelledLines = [...cancelled].sort((a, b) => a.year - b.year).map((r) => `  { no: ${r.no}, year: ${r.year} },`);

const ts = `/**
 * 明治神宮野球大会（高校の部）の歴代の優勝校・準優勝校・決勝のスコア・出場校数。
 *
 * ★ このファイルは scripts/build-jingu-champions.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia「${article.title}」の「歴代結果（高校の部）」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（回・年・校数・優勝校・地区・県・決勝のスコア・準優勝校・地区・県）。
 * 備考の文章は取り込んでいない。中止の年は回と年だけ（\`JINGU_CHAMPIONS_CANCELLED\`）。
 * ★高校の部は第${minNo}回（${entries[0].year}年）から。
 * ★生成時に、記事の中の整合（回の欠け・年の重複・各行の欠け）と、
 *   \`jingu-games.json\` の決勝との一致（${compared} 大会。優勝校・準優勝校・スコア・出場校数）を確かめてある。
 * ★地区は**出典の表記のまま**（古い年は「中部」）。東京・北海道は地区も県も同じ語。
 *   都道府県で数えるときは \`prefectureKey\`（koshien-games.ts）で寄せること（出典は「北海道」「東京」と書く）。
 * ★校名は記事の略称（高松商・九州国際大付）。**画面で学校マスタに引くときは甲子園と同じ規則（\`getSchoolNameIndex("koshien")\`）。**
 */

export type JinguChampionTeam = {
  /** 記事の表記（「高松商」「九州国際大付」） */
  name: string;
  /** 「北信越」「東京」「中部」。出典の表記のまま */
  region: string;
  /** 「福井」「東京」「北海道」 */
  prefecture: string;
};

export type JinguChampion = {
  /** 第N回 */
  no: number;
  year: number;
  /** 出場校数 */
  schoolCount: number;
  champion: JinguChampionTeam;
  /** 「3-2」（優勝校の得点が先） */
  score: string;
  /** サヨナラ */
  walkOff: boolean;
  runnerUp: JinguChampionTeam;
};

/** 開催が中止された年（高校の部の回数は数えている） */
export const JINGU_CHAMPIONS_CANCELLED: readonly { no: number; year: number }[] = [
${cancelledLines.join("\n")}
];

export const JINGU_CHAMPIONS_SOURCE = ${JSON.stringify(source)} as const;

export const JINGU_CHAMPIONS: readonly JinguChampion[] = [
${lines.join("\n")}
];
`;
writeFileSync(OUT, ts, "utf8");
console.log(
  `\n書き出した: ${path.relative(ROOT, OUT)}（${entries.length} 大会・${entries[0].year}〜${entries.at(-1).year}年・中止 ${cancelled.length} 件）`,
);
