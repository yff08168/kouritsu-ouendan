// Search Console の「インデックス登録をリクエスト」に出す候補を並べる。
//
// ★★なぜ要るか（2026-10-31）
//   9/30〜10/11 の障害で Googlebot のクロールが 1日480件 → 10件 に落ちた。
//   サイトマップに 11,779件あるのに 1日10件しか取りに来ないので、
//   **自分から「ここを見に来て」と言う手段が URL 検査のリクエストしかない。**
//   枠は1日およそ10件で、日付で戻る。
//
// ★やっていることは2つだけ
//   ①本番のサイトマップから候補を作り、価値の高い順に並べる
//   ②`data/index-requests.json`（控え）に載っているURLを外す
//
// ★★状態は「もう頼んだURL」と「登録済みと分かったURL」だけ持つ。
//   **待ち行列そのものは持たない** —— サイトマップが変われば候補も変わるべきで、
//   凍らせると新しいページが永遠に出てこない。
//
// ★★控えは必ずコミットすること。
//   コミットしないと毎日同じURLに枠を使い、1件も進まない。
//
// 使い方:
//   node scripts/index-request-queue.mjs            次の候補を12件出す
//   node scripts/index-request-queue.mjs --count 20
//   node scripts/index-request-queue.mjs --record requested https://…/a https://…/b
//   node scripts/index-request-queue.mjs --record indexed  https://…/c
//   node scripts/index-request-queue.mjs --stats

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = resolve(ROOT, "data/index-requests.json");
const SITEMAP = "https://kouritsu-ouendan.com/sitemap.xml";

// ★並べる順。**上にあるものほど先に枠を使う。**
//   ★★「流入が多い種類」と「外へのリンクが多い種類」を上に置く。
//     - 大会ページは実測の流入1位（`/prefectures/tokushima/2026-spring` 表示158回）
//     - 年別アーカイブはその年の全大会へリンクする入口
//     - `/koshien/public/<年>` は「公立高校 甲子園」（8月33,100）の受け皿
//   ★学校ページと対戦成績ページは入れない —— 2,844＋6,690件あり、
//     1日10件では焼け石に水。**クロールが戻れば勝手に拾われる種類。**
// ★★上に置く種類は「未登録が多いほう」から決める（2026-10-31 に入れ替えた）——
//   年別アーカイブは実測5枚とも登録済み、`/koshien/public/<年>` は2017年以外すべて未登録だった。
//   **登録済みばかりの種類を上に置くと、検査に時間を使って枠が1件も減らない。**
const TIERS = [
  {
    name: "公立の甲子園出場（年別）",
    match: (u) => /\/koshien\/public\/\d{4}$/.test(u),
    rank: (u) => -Number(u.match(/(\d{4})$/)[1]),
  },
  {
    name: "年別アーカイブ",
    match: (u) => /\/archive\/\d{4}$/.test(u),
    // 新しい年ほど上
    rank: (u) => -Number(u.match(/(\d{4})$/)[1]),
  },
  {
    name: "今年の地方大会",
    match: (u) => /\/prefectures\/[a-z-]+\/2026-(autumn|summer|spring)/.test(u),
    // 秋 → 夏 → 春（新しい大会から）
    rank: (u) => ({ autumn: 0, summer: 1, spring: 2 }[u.match(/2026-(\w+)/)[1]] ?? 9),
  },
  {
    name: "明治神宮大会",
    match: (u) => /\/jingu\/\d{4}$/.test(u),
    rank: (u) => -Number(u.match(/(\d{4})$/)[1]),
  },
  {
    name: "去年の地方大会",
    match: (u) => /\/prefectures\/[a-z-]+\/2025-(autumn|summer|spring)/.test(u),
    rank: (u) => ({ autumn: 0, summer: 1, spring: 2 }[u.match(/2025-(\w+)/)[1]] ?? 9),
  },
  {
    name: "甲子園の大会",
    match: (u) => /\/koshien\/\d{4}-(spring|summer)$/.test(u),
    rank: (u) => -Number(u.match(/(\d{4})-/)[1]),
  },
];

function loadState() {
  if (!existsSync(STATE)) return { requested: {}, indexed: {} };
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  // ★壊れていたら例外のまま落とす。作り直すと「もう頼んだ」が消える。
  return { requested: s.requested ?? {}, indexed: s.indexed ?? {} };
}

function saveState(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}
`);
}

async function sitemapUrls() {
  const res = await fetch(SITEMAP, { headers: { "user-agent": "kouritsu-ouendan/index-queue" } });
  if (!res.ok) throw new Error(`サイトマップが取れない: ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function candidates(urls, state) {
  const seen = new Set([...Object.keys(state.requested), ...Object.keys(state.indexed)]);
  const out = [];
  for (const tier of TIERS) {
    const hits = urls
      .filter((u) => !seen.has(u) && tier.match(u))
      .sort((a, b) => tier.rank(a) - tier.rank(b) || a.localeCompare(b));
    for (const u of hits) out.push({ url: u, tier: tier.name });
  }
  return out;
}

// ★★ fetch のあとに process.exit() を呼ばないこと —— Windows の Node 24 は
//   終了時に libuv のアサーション（async.c:94）で落ち、**出力は正しいのに
//   終了コードが 3 になる。** 自動実行から見ると「失敗」になる。
//   ★返り値で終わらせ、例外だけを異常にする。
async function main(argv) {
  const flag = (name) => argv.indexOf(`--${name}`);
  const state = loadState();

  if (flag("record") >= 0) {
    const kind = argv[flag("record") + 1];
    if (kind !== "requested" && kind !== "indexed") {
      throw new Error("--record のあとは requested か indexed");
    }
    const today = new Date().toISOString().slice(0, 10);
    const urls = argv.slice(flag("record") + 2).filter((a) => a.startsWith("http"));
    if (urls.length === 0) throw new Error("URLが無い");
    for (const u of urls) state[kind][u] = today;
    saveState(state);
    console.log(
      `${kind} に ${urls.length}件 記録した（合計 requested ${Object.keys(state.requested).length} / indexed ${Object.keys(state.indexed).length}）`,
    );
    return;
  }

  const urls = await sitemapUrls();

  if (flag("stats") >= 0) {
    console.log(`サイトマップ ${urls.length}件`);
    console.log(
      `リクエスト済み ${Object.keys(state.requested).length}件 / 登録済みと分かったもの ${Object.keys(state.indexed).length}件`,
    );
    const rest = candidates(urls, state);
    const byTier = new Map();
    for (const c of rest) byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + 1);
    for (const [t, n] of byTier) console.log(`  残り ${t}: ${n}件`);
    console.log(`  候補の残り合計: ${rest.length}件`);
    return;
  }

  const count = flag("count") >= 0 ? Number(argv[flag("count") + 1]) : 12;
  const next = candidates(urls, state).slice(0, count);
  if (next.length === 0) {
    console.log("候補が尽きた");
    return;
  }
  for (const c of next) console.log(`${c.url}	${c.tier}`);
}

await main(process.argv.slice(2));
