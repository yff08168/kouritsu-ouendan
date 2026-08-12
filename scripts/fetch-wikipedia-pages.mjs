/**
 * 指定した記事の wikitext を Wikipedia から取って data/wikipedia-cache/pages/ に貯める。
 *
 *   node scripts/fetch-wikipedia-pages.mjs "記事名" "記事名" ...
 *
 * fetch-koshien-wikipedia.mjs は大会別記事を番号で取るのに対し、
 * こちらは試合単体の記事や学校の記事など、名前を指定して取るためのもの。
 *
 * **要約モデルを通さないこと。** WebFetch で大会記事を要約させると
 * 対戦相手も勝敗も入れ替わって出てくる（AGENTS.md 参照）。
 * ここで取った wikitext を人が直接読む。
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache", "pages");

// Wikimedia の方針で連絡先の分かる User-Agent が要る。
// **HTTPヘッダはASCIIのみ。** 日本語を入れると fetch が TypeError で落ちる。
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";

const INTERVAL = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ファイル名に使えない文字を落とす */
function cacheName(title) {
  return title.replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

async function fetchWikitext(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&prop=revisions" +
    "&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2" +
    `&titles=${encodeURIComponent(title)}`;

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);

  const json = await res.json();
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return null;

  return {
    title: page.title,
    wikitext: page.revisions?.[0]?.slots?.main?.content ?? "",
  };
}

const titles = process.argv.slice(2);
if (titles.length === 0) {
  console.error('使い方: node scripts/fetch-wikipedia-pages.mjs "記事名" ...');
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });

for (const title of titles) {
  const file = path.join(CACHE_DIR, cacheName(title));

  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    console.log(`cached  ${cached.title} (${cached.wikitext.length} chars)`);
    continue;
  }

  const got = await fetchWikitext(title);
  if (!got) {
    console.log(`MISSING ${title}`);
    await sleep(INTERVAL);
    continue;
  }

  writeFileSync(file, JSON.stringify(got, null, 2), "utf8");
  const hasLinescore = got.wikitext.includes("Linescore");
  console.log(
    `fetched ${got.title} (${got.wikitext.length} chars)` +
      (hasLinescore ? "  [Linescore あり]" : ""),
  );
  await sleep(INTERVAL);
}
