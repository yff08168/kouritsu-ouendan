/**
 * NPB（日本プロ野球）の選手の記事から、導入部の Infobox の「経歴」などを Wikipedia から取得して
 * data/wikipedia-cache/pro-players.json に貯める。
 *
 *   node scripts/fetch-pro-players-wikipedia.mjs              … 未取得の記事だけ取る
 *   node scripts/fetch-pro-players-wikipedia.mjs --refresh    … 取り直す
 *   node scripts/fetch-pro-players-wikipedia.mjs --enumerate  … 記事の一覧を作るだけ（本文は取らない）
 *   node scripts/fetch-pro-players-wikipedia.mjs --limit 200  … 試し取り（先頭から200件）
 *
 * ------------------------------------------------------------------
 * ★★ 何のためか（2026-11-25。運営者の指示「公立高校からプロ野球選手になった選手を紹介するページ」）
 *
 *   公立高校 → （大学・社会人） → プロ という進路は、選手記事の Infobox の「経歴」欄に
 *   箇条書きで入っている（高校名は学校記事への正式名称リンク）。これを読んで
 *   scripts/build-pro-alumni.mjs が学校マスタに結び付ける。
 *
 * ★ なぜ Wikipedia か
 *   CC BY-SA で、API での取得が正規の手段（fetch-koshien-wikipedia.mjs と同じ理由）。
 *   取るのは**事実（氏名・経歴・入団年・ドラフト順位）だけ**。**文章（本文）は取らない。**
 *   NPB 公式の選手名鑑は規約を確かめていないので使わない。
 *
 * ★ 母集団は球団ごとのカテゴリ（Category:NPB選手 の子カテゴリ）
 *   記事のある選手だけが対象になる。**「プロ野球選手の全員」ではない**ので、ページには
 *   「Wikipedia に記事のある選手」と書くこと。
 *
 * ★ 取るのは導入部（rvsection=0）だけ。Infobox は導入部の先頭にあるので、本文を丸ごと
 *   取るより転送量が1/10以下で済む。50記事を1回の問い合わせで取る。
 *
 * ★ 個人情報: **生年月日・出身地・年俸は保存しない**（ページに出さないものは持たない）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const OUT = path.join(CACHE_DIR, "pro-players.json");
const INDEX = path.join(CACHE_DIR, "pro-players-index.json");

// HTTPヘッダはASCIIしか通らない（日本語を書くと fetch が落ちる）。fetch-koshien-wikipedia.mjs と同じ。
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";
const INTERVAL = 1000;
const BATCH = 50;

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const ENUM_ONLY = args.includes("--enumerate");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, attempt = 0) {
  const u = new URL("https://ja.wikipedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u, { headers: { "user-agent": UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${res.status} ${u}`);
    const wait = (Number(res.headers.get("retry-after")) || 10 * (attempt + 1)) * 1000;
    console.log(`  … ${res.status}。${Math.round(wait / 1000)}秒待つ`);
    await sleep(wait);
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${u}`);
  return res.json();
}

// ------------------------------------------------------------------
// 1. 選手の記事の一覧（カテゴリをたどる）
// ------------------------------------------------------------------
/** 子カテゴリのうち、選手のカテゴリでないもの（監督・コーチ・属性で括った集合） */
const SKIP_CATEGORY =
  /(オールスター|YouTuber|韓国人|キューバ人|台湾人|完全試合|一覧|監督|コーチ|関連人物|オーナー|球団社長|審判|アナウンサー|解説者|マスコット|ファン|外国人)/;

async function members(title, type) {
  const out = [];
  let cont = {};
  do {
    const j = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: title,
      cmtype: type,
      cmlimit: "500",
      ...(type === "page" ? { cmnamespace: "0" } : {}),
      ...cont,
    });
    out.push(...j.query.categorymembers.map((m) => m.title));
    cont = j.continue ?? null;
    await sleep(INTERVAL / 2);
  } while (cont);
  return out;
}

async function enumerate() {
  const roots = (await members("Category:NPB選手", "subcat")).filter(
    (c) => /選手$/.test(c) && !SKIP_CATEGORY.test(c),
  );
  console.log(`球団などのカテゴリ ${roots.length} 件`);

  const titles = new Map(); // 記事名 → どのカテゴリから来たか
  const seen = new Set();
  const queue = roots.map((c) => ({ c, depth: 0 }));
  while (queue.length) {
    const { c, depth } = queue.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    const pages = await members(c, "page");
    for (const t of pages) if (!titles.has(t)) titles.set(t, c);
    console.log(`  ${c}: ${pages.length} 件${depth > 0 ? "（子カテゴリ）" : ""}`);
    if (depth < 2) {
      const subs = (await members(c, "subcat")).filter((s) => /選手$/.test(s) && !SKIP_CATEGORY.test(s));
      for (const s of subs) queue.push({ c: s, depth: depth + 1 });
    }
  }
  const list = [...titles.keys()].sort();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    INDEX,
    JSON.stringify({ fetchedAt: new Date().toISOString(), categories: [...seen], titles: list }, null, 1),
  );
  console.log(`記事 ${list.length} 件（カテゴリをまたぐ重複は除いた）→ ${path.relative(ROOT, INDEX)}`);
  return list;
}

// ------------------------------------------------------------------
// 2. 導入部の Infobox を読む
// ------------------------------------------------------------------
/** 注釈・脚注・コメントを落とす（中に `|` や `[[` が入っているため、読む前に消す） */
function clean(s) {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/g, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  // {{efn|…}} などの注釈テンプレートは内側から順に消す
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{(?:efn|Efn|refnest|Refnest|注釈)[^{}]*\}\}/g, "");
  return t;
}

/** [[A|B]] → { link: "A", label: "B" }。リンクが無ければ link: null */
function parseItem(line) {
  const text = line.replace(/^\*+\s*/, "").trim();
  const m = text.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/);
  const plain = text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  return { link: m ? m[1].trim() : null, label: m ? (m[2] ?? m[1]).trim() : plain, text: plain };
}

/** 1つの記事の導入部から、必要な項目だけを取り出す */
function parseLead(wikitext) {
  const start = wikitext.search(/\{\{\s*Infobox baseball player/i);
  if (start < 0) return null;
  const body = clean(wikitext.slice(start));
  const lines = body.split("\n");

  const get = (key) => {
    const re = new RegExp(`^\\|\\s*${key}\\s*=\\s*(.*)$`);
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return null;
    return lines[i].match(re)[1].trim();
  };

  // 経歴は箇条書き。次の「| 項目 =」か「}}」までが範囲
  const careers = [];
  const ci = lines.findIndex((l) => /^\|\s*経歴\s*=/.test(l));
  if (ci >= 0) {
    const first = lines[ci].replace(/^\|\s*経歴\s*=\s*/, "").trim();
    if (first.startsWith("*")) careers.push(parseItem(first));
    for (let i = ci + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\|\s*[^=\n|]{1,20}=/.test(l) || /^\}\}/.test(l)) break;
      if (/^\*/.test(l)) careers.push(parseItem(l));
    }
  }

  const draftYear = (get("プロ入り年度") ?? "").match(/NPBドラフト\s*\|\s*(\d{4})/)?.[1] ?? null;
  const entryRaw = get("プロ入り年度") ?? "";
  const entryYear = entryRaw.match(/(\d{4})/)?.[1] ?? null;

  return {
    name: (get("選手名") ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    team: (get("所属球団") ?? "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").trim(),
    draftYear,
    entryYear,
    draftRank: (get("ドラフト順位") ?? "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").trim(),
    careers,
  };
}

// ------------------------------------------------------------------
// 3. 高校の記事名のリダイレクトを解決する（--redirects）
//
//   学校が改称・移管（大阪市立桜宮 → 大阪府立桜宮）・統合すると、Wikipedia の記事は移動して旧名が
//   リダイレクトになる。選手記事の経歴は**当時の校名**のリンクのままなので、学校マスタ（現在の校名）に
//   完全一致しない。リダイレクト先を引けば現存校に結べる。
//   ★**結んだものは「当時の校名」を残す**（build-pro-alumni.mjs の formerName）。
//   ★経歴に出てくる高校の記事名だけ（約1,500件）。50件ずつの問い合わせ。
// ------------------------------------------------------------------
async function resolveRedirects() {
  const { classify } = await import("./lib/pro-careers.mjs");
  const players = JSON.parse(readFileSync(OUT, "utf8")).players;
  const titles = new Set();
  for (const p of Object.values(players)) {
    if (!p) continue;
    for (const it of p.careers) if (it.link && classify(it) === "hs") titles.add(it.link);
  }
  const list = [...titles].sort();
  const file = path.join(CACHE_DIR, "pro-school-redirects.json");
  const map = existsSync(file) && !REFRESH ? JSON.parse(readFileSync(file, "utf8")) : {};
  const todo = list.filter((t) => !(t in map));
  console.log(`高校の記事名 ${list.length} 件のうち、未解決 ${todo.length} 件`);
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const j = await api({ action: "query", titles: batch.join("|"), redirects: "1" });
    const norm = new Map((j.query.normalized ?? []).map((n) => [n.from, n.to]));
    const red = new Map((j.query.redirects ?? []).map((r) => [r.from, r.to]));
    for (const t of batch) {
      const n = norm.get(t) ?? t;
      map[t] = red.get(n) ?? null; // リダイレクトでなければ null（そのままの名前が実体）
    }
    if ((i / BATCH) % 10 === 9 || i + BATCH >= todo.length) {
      writeFileSync(file, JSON.stringify(map));
      console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    }
    await sleep(INTERVAL);
  }
  writeFileSync(file, JSON.stringify(map));
  console.log(`リダイレクトあり ${Object.values(map).filter(Boolean).length} 件 → ${path.relative(ROOT, file)}`);
}

// ------------------------------------------------------------------
async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (args.includes("--redirects")) return resolveRedirects();
  let titles;
  if (!REFRESH && !ENUM_ONLY && existsSync(INDEX)) titles = JSON.parse(readFileSync(INDEX, "utf8")).titles;
  else titles = await enumerate();
  if (ENUM_ONLY) return;

  const cache = existsSync(OUT) && !REFRESH ? JSON.parse(readFileSync(OUT, "utf8")) : { players: {} };
  const todo = titles.filter((t) => !(t in cache.players)).slice(0, LIMIT);
  console.log(`取得する記事 ${todo.length} 件（取得済み ${Object.keys(cache.players).length}）`);

  let done = 0;
  let noBox = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const j = await api({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      rvsection: "0",
      titles: batch.join("|"),
    });
    for (const p of j.query.pages) {
      const w = p.revisions?.[0]?.slots?.main?.content;
      if (!w) {
        cache.players[p.title] = null;
        continue;
      }
      // 「K-鈴木」のようにカテゴリが付いたままのリダイレクトは、実体の記事が別に一覧へ入っている
      if (/^\s*#(?:REDIRECT|転送)/i.test(w)) {
        cache.players[p.title] = null;
        continue;
      }
      const parsed = parseLead(w);
      if (!parsed) noBox++;
      cache.players[p.title] = parsed;
    }
    done += batch.length;
    if ((i / BATCH) % 10 === 9 || i + BATCH >= todo.length) {
      cache.fetchedAt = new Date().toISOString();
      writeFileSync(OUT, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length}（Infobox なし ${noBox}）`);
    }
    await sleep(INTERVAL);
  }
  console.log(`完了 → ${path.relative(ROOT, OUT)}`);
}

await main();
