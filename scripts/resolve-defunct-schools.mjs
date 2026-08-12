/**
 * 統廃合・改称で学校マスタに無くなった校名を、現存校に結び付ける表を作る。
 *
 *   node scripts/match-koshien.mjs --dump-unmatched data/_unmatched.json
 *   node scripts/resolve-defunct-schools.mjs data/_unmatched.json
 *
 * 出力は data/school-successor.json。
 *
 * ------------------------------------------------------------------
 * **校名を手で書かない。**（AGENTS.md）
 *
 * 「鳴門工業は鳴門渦潮になった」と記憶から書くのは、実在しない対応を
 * 作り込む危険があるので禁止。ここでは出典のある2つの方法だけを使う。
 *
 *   1. Wikipedia のリダイレクト
 *      旧校名の記事が現存校へリダイレクトされていれば、それが答え。
 *      Wikipedia の編集者が出典付きで整理した結果をそのまま使える。
 *
 *   2. 旧校名の記事から現存校へのリンク
 *      リダイレクトが無い（独立記事がある）場合は、その記事に出てくる
 *      学校記事へのリンクを**候補として並べるだけ**にする。
 *      どれが後身校かは機械では決められないので、**人が確認して
 *      data/school-successor.json に確定させる。**
 *
 * confirmed: true のものだけを match-koshien.mjs が使う。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const OUT = path.join(ROOT, "data", "school-successor.json");

const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const inputPath = process.argv[2];
if (!inputPath || !existsSync(inputPath)) {
  console.error("未照合リストのパスを渡すこと（match-koshien.mjs --dump-unmatched で作る）");
  process.exit(1);
}

/** 学校マスタの official_name 一覧 */
function loadOfficialNames() {
  const set = new Set();
  for (const f of readdirSync(SUPABASE_DIR)) {
    if (!f.startsWith("schools_") || !f.endsWith(".sql")) continue;
    const text = readFileSync(path.join(SUPABASE_DIR, f), "utf8");
    const re =
      /^\s*\('[^']+',\s*'(?:[^']|'')*',\s*'((?:[^']|'')*)',\s*\(select id from public\.prefectures/gm;
    let m;
    while ((m = re.exec(text)) !== null) set.add(m[1].replace(/''/g, "'"));
  }
  return set;
}

/** リダイレクトを解決した先の記事名を返す */
async function resolveTitle(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=" +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await res.json();
  const page = json.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page.title;
}

/** 記事の本文（wikitext）を取る */
async function wikitextOf(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
    "&prop=wikitext&redirects=1&page=" +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await res.json();
  if (json.error) return null;
  return json.parse.wikitext;
}

/** 記事本文から、学校記事へのリンクを候補として拾う */
async function schoolLinksIn(title) {
  const text = await wikitextOf(title);
  if (!text) return [];
  const found = new Set();
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const t = m[1].trim();
    const bare = t.replace(/\s*[（(][^）)]*[）)]\s*$/, "");
    if (/(大会|連盟|野球部|一覧)$/.test(bare)) continue;
    if (!/(高等学校|高等専門学校|中等教育学校)$/.test(bare)) continue;
    if (t === title) continue;
    found.add(t);
  }
  return [...found];
}

async function main() {
  const unmatched = JSON.parse(readFileSync(inputPath, "utf8"));
  const official = loadOfficialNames();

  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const keep = new Map();
  for (const e of existing?.schools ?? []) keep.set(e.from, e);

  const out = [];
  for (const { name, count } of unmatched) {
    // 人が確定済みのものは触らない
    if (keep.get(name)?.confirmed) {
      out.push(keep.get(name));
      continue;
    }

    const resolved = await resolveTitle(name);
    await sleep(800);

    if (resolved && resolved !== name && official.has(resolved)) {
      out.push({
        from: name,
        to: resolved,
        via: "wikipedia-redirect",
        confirmed: true,
        appearances: count,
      });
      console.log(`✅ ${name} → ${resolved}（リダイレクト）`);
      continue;
    }

    const candidates = (await schoolLinksIn(name)).filter((c) => official.has(c));
    await sleep(800);

    // 双方向の確認。旧校の記事がXにリンクしているだけでは「近隣校」かもしれない。
    // Xの記事のほうにも旧校名が出てくるなら、両方の記事が関係を裏付けている。
    const mutual = [];
    for (const c of candidates) {
      const text = await wikitextOf(c);
      await sleep(800);
      if (text && text.includes(name.replace(/\s*[（(][^）)]*[）)]\s*$/, ""))) mutual.push(c);
    }

    if (mutual.length === 1) {
      out.push({
        from: name,
        to: mutual[0],
        via: "wikipedia-両方向",
        confirmed: true,
        appearances: count,
        candidates,
      });
      console.log(`✅ ${name} → ${mutual[0]}（双方向の記述）`);
      continue;
    }

    out.push({
      from: name,
      to: null,
      via: "要確認",
      confirmed: false,
      appearances: count,
      candidates,
      mutual,
    });
    console.log(
      `⏸ ${name} → 決められない。候補 ${candidates.length} 件` +
        `（双方向 ${mutual.length} 件: ${mutual.join("、") || "なし"}）: ` +
        `${candidates.slice(0, 5).join("、") || "（なし）"}`,
    );
  }

  const auto = out.filter((e) => e.confirmed).length;
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          "統廃合・改称で学校マスタに無くなった校名と現存校の対応。" +
          "scripts/resolve-defunct-schools.mjs が作る。",
        _注意:
          "**校名を推測で書かない。** confirmed: true のものだけを match-koshien.mjs が使う。" +
          "via が『要確認』のものは、候補から人が選んで to を埋め、confirmed を true にする。" +
          "候補が空なら後身校が学校マスタに無い（完全に廃校した）か、記事に書かれていない。",
        generatedOn: new Date().toISOString().slice(0, 10),
        schools: out,
      },
      null,
      1,
    ),
    "utf8",
  );

  console.log("");
  console.log(`対象 ${out.length} 件 / 自動で決まった ${auto} 件 / 要確認 ${out.length - auto} 件`);
  console.log(`書き出し: ${path.relative(ROOT, OUT)}`);
}

await main();
