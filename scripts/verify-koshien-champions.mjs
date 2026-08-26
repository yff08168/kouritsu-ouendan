/**
 * 甲子園の生成物を、**外部の一覧と突き合わせる検算**（2026-08-26）。
 *
 * ------------------------------------------------------------------
 * ★★ これは「出典」ではなく「検算相手」
 *
 *   生成物（`src/lib/data/koshien-games.json`）の出典は ja.wikipedia のままで、
 *   **このスクリプトは1バイトも書き込まない。**
 *   ★**やるのは「優勝校が食い違っていないか」を見るだけ。**
 *   出典の中だけで完結する検算（優勝校以外は1回だけ負ける／勝ち上がりが繋がる）は
 *   **記事をまるごと読み違えたときに効かない**ので、
 *   **紙の外から来る事実**と突き合わせる相手がいると強い。
 *   （地方大会で「連盟の歴代表と4項目を突き合わせる」のと同じ考え方）
 *
 * ------------------------------------------------------------------
 * ★ 突き合わせ相手
 *
 *   「高校野球史 甲子園篇」（https://data-man.com/kokoyakyu/）の歴代優勝校の一覧。
 *   ★**robots.txt は全許可**（`User-agent: * / Disallow:`）。
 *   ★**利用規約・転載や営利利用の禁止は、サイト内のどこにも見当たらない**
 *   （トップページ全文とサイトマップ5,290URLを確認。2026-08-26 時点）。
 *   ★★**それでも「試合のデータを取り込む出典」にはしない。**
 *   記録の編纂そのものが商品のサイトで、
 *   **禁止条項が無いことと、その人の商売を取ってよいことは別**
 *   （福岡で `fk-kokoyakyu.com` を採らなかったのと同じ線引き）。
 *   ★**取るのは1ページに1リクエストだけ。** 大会ごとのページは叩かない。
 *
 * ------------------------------------------------------------------
 * 使い方
 *
 *   node scripts/verify-koshien-champions.mjs
 *
 *   食い違いがあれば一覧で出す。**0件なら「193大会の優勝校が全部一致」。**
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GAMES = path.join(ROOT, "src", "lib", "data", "koshien-games.json");
// ★別の出典から補ったぶんも突き合わせる（画面に出ているのは両方なので）
const SUPPLEMENTS = path.join(ROOT, "src", "lib", "data", "koshien-supplements.json");

const SOURCES = [
  { season: "summer", url: "https://data-man.com/kokoyakyu/contents/champ-result/summer/" },
  { season: "spring", url: "https://data-man.com/kokoyakyu/contents/champ-result/" },
];

/** 照合用にそろえる。**画面に出す表記は変えない**（`normalizeKoshienName` と同じ規則） */
const OLD_KANJI = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵",
};
const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/[ヶケ]/g, "ケ")
    .replace(/\s+/g, "")
    .replace(/高等学校$|高校$|高$/, "")
    .replace(/[應廣濱澤齋邊穗舘國學榮德淸眞靑藝圓惠]/g, (c) => OLD_KANJI[c] ?? c)
    .replace(/商業$/, "商")
    .replace(/工業$/, "工")
    .replace(/農業$/, "農")
    .trim();

/**
 * 一覧のHTMLから「年・回・優勝校」を読む。
 * 1行は `<li class="flex"><p class="year">2025</p>…<span class="school">沖縄尚学</span>…`。
 */
function parseChampions(html) {
  const out = [];
  for (const m of html.matchAll(/<li class="flex">([\s\S]*?)<\/li>/g)) {
    const row = m[1];
    const year = row.match(/<p class="year">(\d{4})<\/p>/)?.[1];
    const no = row.match(/>(\d{1,3})<\/a><\/p>/)?.[1];
    const school = row.match(/<span class="school">([^<]+)<\/span>/)?.[1];
    if (!year || !school) continue;
    out.push({ year: Number(year), no: no ? Number(no) : null, school: school.trim() });
  }
  return out;
}

/**
 * 校名が同じとみなせるか。
 * ★**部分列で比べる**（一覧「智弁和歌山」／大会記事「智辯和歌山」のような
 * 表記ゆれがある）。★**点数のような数字は緩めない。ここは校名だけ。**
 */
const sameSchool = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x) && Boolean(y) && (x === y || x.includes(y) || y.includes(x));
};

async function main() {
  const games = [
    ...JSON.parse(readFileSync(GAMES, "utf8")),
    ...JSON.parse(readFileSync(SUPPLEMENTS, "utf8")),
  ];
  const mine = new Map();
  for (const g of games) {
    if (g.round !== "決勝") continue;
    const key = `${g.year}-${g.season}`;
    const winner = g.teams.find((t) => t.won);
    // ★引き分けの決勝（再試合がある年）は勝者がいない。再試合のほうが残る
    if (winner) mine.set(key, winner.display);
  }

  let checked = 0;
  const missing = [];
  const mismatch = [];

  for (const src of SOURCES) {
    // ★UAに日本語を入れないこと（ヘッダはASCIIしか通らない）
    const res = await fetch(src.url, {
      headers: { "user-agent": "kouritsu-ouendan/1.0 (verification)" },
    });
    if (!res.ok) {
      console.log(`⚠️ ${src.url} が取れなかった（${res.status}）。検算を飛ばす`);
      continue;
    }
    const rows = parseChampions(await res.text());
    console.log(`（${src.season}: 一覧に ${rows.length} 大会）`);

    for (const row of rows) {
      const key = `${row.year}-${src.season}`;
      const ours = mine.get(key);
      if (!ours) {
        // ★こちらが収録していない大会。**足りないぶんとして数える**
        missing.push(`${key} ${row.school}`);
        continue;
      }
      checked += 1;
      if (!sameSchool(ours, row.school)) {
        mismatch.push(`${key} こちら「${ours}」／一覧「${row.school}」`);
      }
    }
  }

  console.log(`\n突き合わせた大会 ${checked} 件`);
  if (mismatch.length) {
    console.log(`\n⚠️ 優勝校が食い違う ${mismatch.length} 件`);
    for (const m of mismatch) console.log(`  ${m}`);
  } else {
    console.log("優勝校の食い違いは0件");
  }
  if (missing.length) {
    console.log(`\n（こちらが収録していない大会 ${missing.length} 件）`);
    for (const m of missing) console.log(`  ${m}`);
  }
}

await main();
