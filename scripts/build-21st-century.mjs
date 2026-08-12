/**
 * 21世紀枠の出場校一覧を Wikipedia から取り込み、
 * src/lib/data/twenty-first-century.ts を生成する。
 *
 *   node scripts/build-21st-century.mjs
 *   node scripts/build-21st-century.mjs --refresh   … キャッシュを無視して取り直す
 *
 * ------------------------------------------------------------------
 * なぜ大会別記事ではなく「選抜高等学校野球大会」の記事なのか
 *
 *   大会別記事（data/wikipedia-cache/spring-*.json）にも21世紀枠は載っているが、
 *   独立した「=== 21世紀枠 ===」節を持つのは26大会中11大会だけで、
 *   残りは選出校の表に紛れていたり注釈で触れているだけだったりする。
 *   一方、親記事の「21世紀枠出場校一覧」は2001年から現在まで**1つの表**に
 *   まとまっていて書式も一貫している。1記事の取得で全期間が揃う。
 *
 * なぜDBに入れないのか
 *
 *   年に1〜3件・年1回しか増えない、全部で60件ほどの表なので、
 *   テーブルを1つ増やしてマイグレーションを人手で適用する手間に見合わない。
 *   生成物をリポジトリに置き、ビルド時に取り込む。
 *
 * ★ 選考理由の文章は取り込まない ★
 *   Wikipedia は CC BY-SA。**事実データの抽出では継承条件は発動しない**が、
 *   記事の文章そのものを持ってくると発動する（README「甲子園出場歴」参照）。
 *   選考理由の欄は執筆者が書いた文章なので、年・地区・学校名だけを取る。
 *
 * 成績も取り込まない。DBの school_championships に同じ大会の成績があり、
 * そちらは勝敗表から到達段階を計算したもので、サイト全体で表記が揃っている。
 * この表の「2回戦敗退」と混ぜると同じ出場が2つの表記を持つことになる。
 */
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const CACHE_FILE = path.join(CACHE_DIR, "senbatsu-main.json");
const APPEARANCES = path.join(ROOT, "data", "koshien-appearances.json");
const SUCCESSOR = path.join(ROOT, "data", "school-successor.json");
const OUT = path.join(ROOT, "src", "lib", "data", "twenty-first-century.ts");

/** 親記事。「21世紀枠」で引くとここへリダイレクトされる。 */
const ARTICLE = "選抜高等学校野球大会";

// HTTPヘッダはASCIIしか通らない。ここに日本語を書くと fetch が落ちる。
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";

const REFRESH = process.argv.includes("--refresh");

/**
 * 大会が中止になった年。選出はされたが甲子園では1試合も行われていない。
 * 出場歴（school_championships）にもこの年は入っていない。
 */
const CANCELLED = [2020];

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
  return { title: json.parse.title, wikitext: json.parse.wikitext };
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
//
// セルの区切りは `||` と行頭の `|` の2種類が混在する（2026年の行だけ
// 後者で書かれている）。どちらも扱えるようにする。
// `|` はリンク `[[記事名|表示名]]` の中にも出るため、単純な split はできない。
// ------------------------------------------------------------------

/** `<ref>…</ref>` と `<ref … />` を取り除く。中に `|` を含む出典テンプレートが入る。 */
function stripRefs(text) {
  return text
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
}

/** `{{…}}` を入れ子ごと取り除く。注釈（Efn2）の中に `|` が入るため先に消す。 */
function stripTemplates(text) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth++;
      i++;
      continue;
    }
    if (text[i] === "}" && text[i + 1] === "}" && depth > 0) {
      depth--;
      i++;
      continue;
    }
    if (depth === 0) out += text[i];
  }
  return out;
}

/**
 * 表の1行をセルに割る。
 * `[[ ]]` の中にいる間は区切り文字とみなさない。
 */
function splitCells(row) {
  const cells = [];
  let current = "";
  let linkDepth = 0;
  let atLineStart = true;

  for (let i = 0; i < row.length; i++) {
    const c = row[i];

    if (c === "[" && row[i + 1] === "[") {
      linkDepth++;
      current += "[[";
      i++;
      atLineStart = false;
      continue;
    }
    if (c === "]" && row[i + 1] === "]" && linkDepth > 0) {
      linkDepth--;
      current += "]]";
      i++;
      atLineStart = false;
      continue;
    }

    if (linkDepth === 0 && c === "|" && row[i + 1] === "|") {
      cells.push(current);
      current = "";
      i++;
      atLineStart = false;
      continue;
    }
    if (linkDepth === 0 && c === "|" && atLineStart) {
      // 行頭の `|` はセルの開始。1つ目のセルの前では空セルを作らない。
      if (cells.length > 0 || current.trim() !== "") cells.push(current);
      current = "";
      atLineStart = false;
      continue;
    }

    if (c === "\n") {
      atLineStart = true;
      current += "\n";
      continue;
    }

    atLineStart = false;
    current += c;
  }
  cells.push(current);

  return cells.map(stripCellAttributes).map((s) => s.trim());
}

/**
 * `rowspan=2 style="white-space:nowrap"|中身` の属性部分を落とす。
 * 属性は `=` を含みリンクを含まないので、その形のときだけ落とす。
 */
function stripCellAttributes(cell) {
  const pipe = cell.indexOf("|");
  if (pipe < 0) return cell;
  const head = cell.slice(0, pipe);
  if (head.includes("[[") || head.includes("\n")) return cell;
  if (!/=/.test(head) && !/^(?:colspan|rowspan)/.test(head.trim())) return cell;
  return cell.slice(pipe + 1);
}

/** `[[記事名|表示名]]` / `[[記事名]]` を取り出す。太字とタグは落とす。 */
function parseSchoolCell(cell) {
  const link = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!link) return null;
  const article = link[1].trim();
  const display = (link[2] ?? link[1]).replace(/'''/g, "").trim();

  // 「（沖縄）」。<br> をはさむ書き方があるので先にタグを落とす
  const plain = cell.replace(/<br\s*\/?>/g, "").replace(/'''/g, "");
  const pref = plain.match(/[（(]([^）)]+)[）)]\s*$/);

  return {
    article,
    displayName: display,
    prefectureText: pref ? pref[1].trim() : null,
  };
}

/** 「21世紀枠出場校一覧」の表を取り出す */
function extractBerthTable(wikitext) {
  const heading = wikitext.indexOf("==== 21世紀枠出場校一覧 ====");
  if (heading < 0) {
    throw new Error(
      "「21世紀枠出場校一覧」の節が見つからない。記事の構成が変わった可能性がある。",
    );
  }
  const start = wikitext.indexOf("{|", heading);
  const end = wikitext.indexOf("\n|}", start);
  if (start < 0 || end < 0) throw new Error("表の範囲を特定できない。");
  return wikitext.slice(start, end);
}

function parseBerths(wikitext) {
  const table = stripTemplates(stripRefs(extractBerthTable(wikitext)));
  // 先頭のヘッダ行（!年!!地区!!…）は取り除く
  const rows = table.split(/\n\|-\s*\n?/).slice(1);

  const berths = [];
  let currentYear = null;
  const problems = [];

  for (const row of rows) {
    if (!row.trim()) continue;
    const cells = splitCells(row).filter((c) => c !== "");
    if (cells.length < 3) continue;

    let rest = cells;
    const yearMatch = cells[0].match(/(\d{4})年/);
    if (yearMatch && /第\d+回/.test(cells[0])) {
      currentYear = Number(yearMatch[1]);
      rest = cells.slice(1);
    }
    if (currentYear === null) {
      problems.push(`年が決まらない行: ${row.slice(0, 60)}`);
      continue;
    }

    const region = rest[0]
      ?.replace(/<br\s*\/?>/g, "")
      .replace(/\s+/g, "")
      .trim();
    const school = parseSchoolCell(rest[1] ?? "");
    if (!school) {
      problems.push(`${currentYear}年: 学校のリンクが読めない → ${(rest[1] ?? "").slice(0, 60)}`);
      continue;
    }

    berths.push({
      year: currentYear,
      region: region || null,
      ...school,
    });
  }

  return { berths, problems };
}

// ------------------------------------------------------------------
// 学校マスタとの照合
//
// scripts/match-koshien.mjs と同じ考え方。記事名（正式名称）で突き合わせ、
// 一致しないときに補うのは中高一貫・設置者名の揺れなど機械的なものだけ。
// **推測で結び付けない。**
// ------------------------------------------------------------------

function loadSchools() {
  const rows = [];
  for (const f of readdirSync(SUPABASE_DIR)) {
    if (!f.startsWith("schools_") || !f.endsWith(".sql")) continue;
    const text = readFileSync(path.join(SUPABASE_DIR, f), "utf8");
    const re =
      /^\s*\('([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*\(select id from public\.prefectures where slug = '([^']+)'\)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      rows.push({
        slug: m[1],
        name: m[2].replace(/''/g, "'"),
        officialName: m[3].replace(/''/g, "'"),
        prefSlug: m[4],
      });
    }
  }
  return rows;
}

/**
 * 同じ年の選抜大会の出場校表（data/koshien-appearances.json）から、
 * 表示名 → 記事名 の対応を作る。
 *
 * **なぜこれが要るか。**
 * 21世紀枠の表は親記事にあり、統廃合前の校名がそのまま残っている
 * （2012年の「北海道女満別高等学校」など）。一方、大会別記事のほうは
 * Wikipedia の編集で現存校の記事に張り替えられている（「北海道大空高等学校」）。
 * 21世紀枠の学校は必ずその年の選抜に出場しているので、
 * **同じ年・同じ表示名の出場校を引けば、現存校の記事名が手に入る。**
 * 校名を推測で書き換えるのではなく、同じ出典の中で引き当てている。
 */
function loadTournaments() {
  if (!existsSync(APPEARANCES)) return [];
  const data = JSON.parse(readFileSync(APPEARANCES, "utf8"));
  return (data.tournaments ?? []).filter((t) => t.season === "spring" && t.year);
}

/** 統廃合で消えた校名 → 現存校（confirmed のものだけ）。match-koshien.mjs と同じ表を使う。 */
function loadSuccessors() {
  if (!existsSync(SUCCESSOR)) return new Map();
  const data = JSON.parse(readFileSync(SUCCESSOR, "utf8"));
  const map = new Map();
  for (const e of data.schools ?? []) {
    if (e.confirmed && e.to) map.set(e.from, e.to);
  }
  return map;
}

/** 記事名から official_name になり得る形を列挙する（match-koshien.mjs と同じ規則） */
function candidates(article) {
  const set = new Set();
  const a = article.trim();
  set.add(a);
  set.add(a.replace(/中学校・高等学校$/, "高等学校"));
  set.add(a.replace(/高等学校・[^・]*中学校$/, "高等学校"));
  const m = a.match(/^(.*?)中学校・(.*高等学校)$/);
  if (m) set.add(m[2]);
  set.add(a.replace(/\s*[（(][^）)]*[）)]\s*$/, ""));

  for (const c of [...set]) {
    const mm = c.match(/^.+?[市区町村]立(.+高等学校)$/);
    if (mm) set.add(mm[1]);
  }
  for (const c of [...set]) {
    const mm = c.match(/中学校・(.+高等学校)$/);
    if (mm) set.add(mm[1]);
  }
  for (const c of [...set]) {
    const mm = c.match(/^(.*?[都道府県市区町村]立)(?:.+?)中学校・(.+高等学校)$/);
    if (mm) set.add(mm[1] + mm[2]);
  }
  for (const c of [...set]) {
    set.add(c.replace(/(高等学校)・(?:中等部|初等部|中学校|附属中学校).*$/, "$1"));
  }
  return [...set].filter(Boolean);
}

// ------------------------------------------------------------------

function main(article) {
  const { berths, problems } = parseBerths(article.wikitext);
  const schools = loadSchools();
  const tournaments = loadTournaments();
  const successors = loadSuccessors();

  const byOfficial = new Map();
  for (const s of schools) {
    if (!byOfficial.has(s.officialName)) byOfficial.set(s.officialName, s);
  }

  /**
   * 記事名 → 学校マスタの1件。match-koshien.mjs と同じ手順で、
   * 記事名そのもの → 統廃合の対応表 の順に試す。見つからなければ null。
   */
  function resolveSchool(articleName) {
    if (!articleName) return null;
    for (const name of [articleName, successors.get(articleName)]) {
      if (!name) continue;
      for (const c of candidates(name)) {
        if (byOfficial.has(c)) return byOfficial.get(c);
      }
    }
    return null;
  }

  // その年の選抜に出場した学校（slug）。自己検証に使う。
  const slugsByYear = new Map();
  // 表示名 → 記事名。統廃合前の校名しか無い行を引き当てるための逃げ道。
  const articleByYearAndShort = new Map();
  for (const t of tournaments) {
    const slugs = new Set();
    for (const s of t.schools ?? []) {
      if (s.short && s.article) articleByYearAndShort.set(`${t.year}:${s.short}`, s.article);
      const hit = resolveSchool(s.article);
      if (hit) slugs.add(hit.slug);
    }
    slugsByYear.set(t.year, slugs);
  }

  const unmatched = [];
  const renamed = [];

  for (const b of berths) {
    // まず21世紀枠の表に書かれている記事名で引く。こちらのほうが新しい校名で
    // 書かれていることがある（2015年の豊橋工＝現・豊橋工科）。
    let hit = resolveSchool(b.article);

    // それで引けないのは統廃合前の校名しか無い行。同じ年の選抜の出場校表を見る。
    // 21世紀枠の学校は必ずその年の選抜に出ているので、同じ出典の中で引き当てられる。
    if (!hit) {
      const fromTournament = articleByYearAndShort.get(`${b.year}:${b.displayName}`);
      const viaTournament = resolveSchool(fromTournament);
      if (viaTournament) {
        renamed.push(`  ${b.year}年 ${b.displayName}: ${b.article} → ${fromTournament}`);
        b.article = fromTournament;
        hit = viaTournament;
      }
    }

    b.schoolSlug = hit?.slug ?? null;
    if (!hit) unmatched.push(b);
  }

  // ---- 報告 ----
  const years = [...new Set(berths.map((b) => b.year))].sort();
  console.log(`出典記事      : ${article.title}${article.cached ? "（キャッシュ）" : "（取得）"}`);
  console.log(`21世紀枠      : ${berths.length} 件 / ${years.length} 大会（${years[0]}〜${years[years.length - 1]}）`);
  console.log(`学校マスタと照合: ${berths.length - unmatched.length} 件`);

  if (renamed.length > 0) {
    console.log("");
    console.log(`--- 統廃合前の校名を、同じ年の出場校表から現存校に読み替えた ${renamed.length} 件 ---`);
    console.log(renamed.join("\n"));
  }

  /*
   * 自己検証。21世紀枠の学校は必ずその年の選抜に出場しているので、
   * 照合できた学校はその年の出場校（slug）の中にいるはず。
   * 中止年（2020年）は出場歴を取り込んでいないので対象外。
   */
  const notInTournament = berths.filter(
    (b) =>
      b.schoolSlug &&
      !CANCELLED.includes(b.year) &&
      !(slugsByYear.get(b.year) ?? new Set()).has(b.schoolSlug),
  );
  console.log("");
  console.log(`自己検証（その年の選抜の出場校に見当たらない）: ${notInTournament.length} 件`);
  for (const b of notInTournament) {
    console.log(`  ${b.year}年 ${b.displayName}（${b.prefectureText ?? "?"}）… ${b.article}`);
  }

  if (problems.length > 0) {
    console.log("");
    console.log(`--- 表が読めなかった行 ${problems.length} 件（要確認）---`);
    for (const p of problems) console.log(`  ${p}`);
  }

  if (unmatched.length > 0) {
    console.log("");
    console.log(`--- 照合できなかった ${unmatched.length} 件 ---`);
    console.log("  21世紀枠はほぼ公立だが私立の選出例がある。私立ならマスタに無くて正しい。");
    for (const b of unmatched) {
      console.log(`  ${b.year}年 ${b.displayName}（${b.prefectureText ?? "?"}） … ${b.article}`);
    }
  }

  // 都道府県の突き合わせ。表に書かれた県と、照合した学校の実際の地区がずれていたら
  // 取り違えを疑う（地区は「北北海道」「西東京」のように分割されているので前後一致で見る）。
  const prefMismatch = [];
  for (const b of berths) {
    if (!b.schoolSlug || !b.prefectureText) continue;
    const s = schools.find((x) => x.slug === b.schoolSlug);
    const pref = b.prefectureText.replace(/[都道府県]$/, "");
    if (!s) continue;
    // slug ではなく校名で見る。正式名称に県名が入っているため。
    if (!s.officialName.includes(pref) && !["北海道", "東京"].includes(pref)) {
      prefMismatch.push(`  ${b.year}年 ${b.displayName}: 表は「${b.prefectureText}」だが ${s.officialName}`);
    }
  }
  console.log("");
  console.log(`自己検証（表の都道府県と照合先の校名が食い違う）: ${prefMismatch.length} 件`);
  if (prefMismatch.length > 0) console.log(prefMismatch.join("\n"));

  // ---- 出力 ----
  const q = (v) => (v == null ? "null" : JSON.stringify(v));
  const lines = berths
    .sort((a, b) => a.year - b.year || a.displayName.localeCompare(b.displayName, "ja"))
    .map(
      (b) =>
        `  { year: ${b.year}, region: ${q(b.region)}, displayName: ${q(b.displayName)}, ` +
        `article: ${q(b.article)}, prefectureText: ${q(b.prefectureText)}, schoolSlug: ${q(b.schoolSlug)} },`,
    );

  const ts = `/**
 * 21世紀枠で選抜大会に出場した学校の一覧。
 *
 * ★ このファイルは scripts/build-21st-century.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia.org「${article.title}」の「21世紀枠出場校一覧」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（年・地区区分・校名）。
 * 記事に書かれている選考理由の文章は取り込んでいない（CC BY-SA の継承条件は
 * 事実の抽出では発動しないが、文章を持ってくると発動するため）。
 * 成績は DB の school_championships 側にある。表記を揃えるためそちらを使う。
 *
 * 毎年1月の選考後に \`node scripts/build-21st-century.mjs --refresh\` で更新する。
 */

export type TwentyFirstCenturyBerth = {
  year: number;
  /** 選出時の地区区分。「東日本」「西日本」「地域限定なし」など年によって変わる */
  region: string | null;
  /** 記事内での表記（「宜野座」など） */
  displayName: string;
  /** Wikipedia の記事名。学校マスタとの照合キー */
  article: string;
  /** 表に書かれている都道府県名 */
  prefectureText: string | null;
  /** 学校マスタと照合できた場合の slug。私立などマスタに無い学校は null */
  schoolSlug: string | null;
};

/** 出典表示。ページに必ず出す。 */
export const TWENTY_FIRST_CENTURY_SOURCE = {
  title: ${q(article.title)},
  url: "https://ja.wikipedia.org/wiki/${encodeURIComponent(article.title)}#${encodeURIComponent("21世紀枠出場校一覧")}",
  license: "CC BY-SA 4.0",
  generatedOn: ${q(new Date().toISOString().slice(0, 10))},
} as const;

/**
 * 大会が中止になった年。選出はされたが甲子園では1試合も行われていない
 * （代わりに「2020年甲子園高校野球交流試合」が行われた）。
 * DB の出場歴にもこの年の記録は入れていないので、画面では成績を出さずに注記する。
 */
export const CANCELLED_YEARS: readonly number[] = ${JSON.stringify(CANCELLED)};

export const TWENTY_FIRST_CENTURY_BERTHS: readonly TwentyFirstCenturyBerth[] = [
${lines.join("\n")}
];
`;

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, ts, "utf8");
  console.log("");
  console.log(`書き出し: ${path.relative(ROOT, OUT)}（${berths.length} 件）`);
}

main(await loadArticle());
