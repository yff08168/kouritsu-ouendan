/**
 * 開催中の甲子園の試合結果を Wikipedia から取り、
 * src/lib/data/live-results.ts を作る。
 *
 *   node --env-file=.env.local scripts/build-live-results.mjs
 *   node --env-file=.env.local scripts/build-live-results.mjs --dry   … 書き出さずに報告だけ
 *
 * GitHub Actions から毎日実行し、差分があればコミットする想定
 * （.github/workflows/update-results.yml）。
 *
 * ------------------------------------------------------------------
 * なぜ Wikipedia なのか
 *
 * 大会中も当日中に更新されており、APIでの取得が公式に認められていて、
 * CC BY-SA で商用利用できる。事実（スコア）の抽出なので継承条件は発動しない。
 * 一球速報.com と バーチャル高校野球 は利用規約で使えない（README参照）。
 *
 * ------------------------------------------------------------------
 * 照合の考え方
 *
 * ブラケットの校名は「高岡商」のような略称で、リンクが無い。
 * 一方、記事上部の代表校表はウィキリンクになっている。
 *
 *   代表校表   [[富山県立高岡商業高等学校|高岡商]]
 *   ブラケット |高岡商|1|'''高川学園'''|'''7'''
 *
 * つまり**表示名 → 正式名称**の対応が記事の中にある。これを使えば
 * あいまい照合をせずに学校マスタへ辿り着ける。**推測で結び付けない。**
 *
 * 学校マスタには公立しか入っていないので、**照合できた＝公立**。
 * 私立が一致しないのは正常であって、失敗として報告しない。
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "data", "live-results.ts");
const DRY = process.argv.includes("--dry");

// Wikimedia の方針で連絡先の分かる User-Agent が要る。**ASCIIのみ。**
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";

/**
 * 取得する大会。
 *
 * **回数は「年 - 第1回の年 + 1」では出せない。** 戦争で中止された年があり、
 * 夏は1941年と1942〜1945年、春は1942〜1946年が飛んでいるため、
 * 実際の対応から逆算した固定のオフセットを使う。
 *
 *   夏  2018年=第100回, 2025年=第107回, 2026年=第108回 → 年 - 1918
 *   春  2001年=第73回,  2026年=第98回                  → 年 - 1928
 *
 * （2020年は中止されたが回数は消費されているので、この式で通る）
 *
 * **大会が始まる前は記事がまだ無い。それは異常ではない。**
 */
const SUMMER_OFFSET = 1918;
const SPRING_OFFSET = 1928;

function currentTournament(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 3〜5月は選抜、それ以外は選手権を見る
  if (month >= 3 && month <= 5) {
    return {
      season: "spring",
      year,
      title: `第${year - SPRING_OFFSET}回選抜高等学校野球大会`,
    };
  }
  return {
    season: "summer",
    year,
    title: `第${year - SUMMER_OFFSET}回全国高等学校野球選手権大会`,
  };
}

async function fetchWikitext(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&prop=revisions" +
    "&rvprop=content|timestamp&rvslots=main&redirects=1&format=json&formatversion=2" +
    `&titles=${encodeURIComponent(title)}`;

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);

  const page = (await res.json())?.query?.pages?.[0];
  if (!page || page.missing) return null;

  const rev = page.revisions?.[0];
  return {
    title: page.title,
    wikitext: rev?.slots?.main?.content ?? "",
    /** Wikipedia側の最終更新。鮮度の表示に使う */
    revisedAt: rev?.timestamp ?? null,
  };
}

/** `'''○○'''` の太字と余分な空白を落とす */
function plain(s) {
  return (s ?? "").replace(/'''/g, "").trim();
}

/** 太字かどうか＝その試合の勝者 */
function isBold(s) {
  return /'''/.test(s ?? "");
}

/**
 * 代表校表から「表示名 → 正式名称」を作る。
 * 行の形は `|[[…大会|地区]]||[[正式名称|表示名]]||4年ぶり23回目`
 */
function parseRepresentatives(wikitext) {
  const map = new Map();
  const re = /\[\[([^\]|]+)\|([^\]|]+)\]\]/g;

  // **「代表校」節だけを見る。** 記事の他の場所（各地方大会の日程など）にも
  // 同じ形の行があり、全体を舐めると同じ学校を二重に拾う（49校が98件になった）。
  const section = wikitext.match(/^==\s*代表校\s*==\s*$([\s\S]*?)^==[^=]/m);
  const scope = section ? section[1] : wikitext;

  for (const line of scope.split("\n")) {
    if (!line.startsWith("|[[")) continue;

    const links = [...line.matchAll(re)];
    // 1つ目は地方大会へのリンク、2つ目が学校
    if (links.length < 2) continue;

    const [, officialName, displayName] = links[1];
    map.set(displayName.trim(), officialName.trim());
  }

  return map;
}

/**
 * ブラケットから試合を取り出す。
 *
 * 形式:
 *   {{Round8 seed
 *   |RD1=1回戦
 *   |8月6日（1）|東筑|1|'''神村学園'''|'''5'''
 *   |RD2=2回戦
 *   |月日（）|高川学園||天理|          ← 未実施のプレースホルダ
 *   }}
 *
 * `|||||` は空欄、`月日（）` と空スコアは未実施。どちらも試合ではない。
 */
function parseGames(wikitext) {
  const games = [];
  const blocks = wikitext.match(/\{\{Round\d+[^}]*\}\}/gs) ?? [];

  for (const block of blocks) {
    let round = null;

    for (const raw of block.split("\n")) {
      const line = raw.trim();

      const rd = line.match(/^\|RD\d+\s*=\s*(.+)$/);
      if (rd) {
        const label = rd[1].trim();
        // `RD1=-` は「その山に1回戦が無い」の意味
        round = label === "-" ? null : label;
        continue;
      }

      if (!round || !line.startsWith("|")) continue;

      // 先頭の | を落としてから分割する
      const cells = line.slice(1).split("|");
      if (cells.length < 5) continue;

      const [date, teamA, scoreA, teamB, scoreB] = cells;

      const nameA = plain(teamA);
      const nameB = plain(teamB);
      const sA = plain(scoreA);
      const sB = plain(scoreB);

      // 空行・未実施を落とす
      if (!nameA || !nameB) continue;
      if (sA === "" || sB === "") continue;

      // **サヨナラは「2x」と書かれる。** 数字だけを期待すると、
      // サヨナラ勝ちの試合が丸ごと無視される（鳴門渦潮の初戦がそうだった）。
      const mA = sA.match(/^(\d+)(x?)$/i);
      const mB = sB.match(/^(\d+)(x?)$/i);
      if (!mA || !mB) continue;

      games.push({
        round,
        // 「8月6日（1）」から日付と試合順を分ける
        date: plain(date).replace(/（.*$/, "").trim(),
        order: (plain(date).match(/（(\d+)）/) ?? [])[1] ?? null,
        walkOff: Boolean(mA[2] || mB[2]),
        teams: [
          { display: nameA, score: Number(mA[1]), won: isBold(teamA) },
          { display: nameB, score: Number(mB[1]), won: isBold(teamB) },
        ],
      });
    }
  }

  return games;
}

// ------------------------------------------------------------------

// **process.exit() を使わない。** 出力を書いている途中でプロセスを落とすと
// Windows で libuv のアサーションに当たり、書きかけのファイルも壊れる。
// 早く抜けたいところは main() からの return で表す。
await main();

async function main() {
const tournament = currentTournament();
const fetched = await fetchWikitext(tournament.title);

if (!fetched) {
  console.log(`記事がまだ無い: ${tournament.title}`);
  console.log("大会前ならこれは正常。生成ファイルは変更しない。");
  return;
}

const representatives = parseRepresentatives(fetched.wikitext);
const games = parseGames(fetched.wikitext);

console.log(`大会: ${fetched.title}`);
console.log(`代表校: ${representatives.size} 校`);
console.log(`試合: ${games.length} 件`);

// 学校マスタと突き合わせる。**マスタは公立だけなので、一致＝公立。**
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// **`.in()` にまとめて渡さない。** PostgREST は GET のクエリ文字列で条件を送るので、
// 日本語の正式名称を49件も入れるとURLが長くなりすぎて fetch が失敗する。
// 小分けにして投げる。
const officialNames = [...representatives.values()];
const matched = [];

for (let i = 0; i < officialNames.length; i += 20) {
  const chunk = officialNames.slice(i, i + 20);
  const { data, error } = await supabase
    .from("schools")
    .select("slug, name, official_name, prefecture:prefectures ( name, slug )")
    .in("official_name", chunk);

  if (error) throw new Error("学校マスタの照合: " + error.message);
  matched.push(...(data ?? []));
}

/** 正式名称 → 学校 */
const byOfficial = new Map(matched.map((s) => [s.official_name, s]));
/** 表示名 → 学校（公立のみ。私立は undefined） */
const byDisplay = new Map();
for (const [display, official] of representatives) {
  const school = byOfficial.get(official);
  if (school) byDisplay.set(display, school);
}

console.log(`公立の代表校: ${byDisplay.size} 校`);

// 公立が絡む試合だけ残す
const publicGames = games
  .map((g) => ({
    ...g,
    teams: g.teams.map((t) => {
      const school = byDisplay.get(t.display);
      return {
        ...t,
        slug: school?.slug ?? null,
        name: school?.name ?? t.display,
        prefecture: school?.prefecture?.name ?? null,
      };
    }),
  }))
  .filter((g) => g.teams.some((t) => t.slug));

console.log(`公立が絡む試合: ${publicGames.length} 件`);

// 勝ち残り＝公立校のうち、まだ負けていない学校
const lost = new Set();
const played = new Map();
for (const g of publicGames) {
  for (const t of g.teams) {
    if (!t.slug) continue;
    if (!played.has(t.slug)) {
      played.set(t.slug, { ...t, wins: 0 });
    }
    if (t.won) played.get(t.slug).wins += 1;
    else lost.add(t.slug);
  }
}
const alive = [...played.values()]
  .filter((s) => !lost.has(s.slug))
  .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "ja"));

console.log(`勝ち残り: ${alive.length} 校 — ${alive.map((s) => `${s.name}(${s.wins}勝)`).join("、")}`);

if (DRY) {
  console.log("\n--dry のため書き出しません。");
  return;
}

// **タイムスタンプを埋め込まない。**
// 生成時刻を書くとファイルが毎回変わり、CIが3時間おきに中身の同じコミットを
// 積み続ける。この生成物は「入力（Wikipediaの記事）が同じなら出力も同じ」に
// してある。おかげで**本当に試合結果が動いたときだけコミットが発生する。**
// 鮮度は最新の試合日（データ自身が持っている）で示せば足りる。
const body = `// このファイルは scripts/build-live-results.mjs が生成する。直接編集しない。
// 出典: ${fetched.title}（Wikipedia, CC BY-SA）
//   https://ja.wikipedia.org/wiki/${encodeURIComponent(fetched.title)}

import type { LiveResults } from "@/lib/live-results";

export const LIVE_RESULTS: LiveResults = ${JSON.stringify(
  {
    tournamentTitle: fetched.title,
    season: tournament.season,
    year: tournament.year,
    sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(fetched.title)}`,
    games: publicGames,
    alive: alive.map((s) => ({
      slug: s.slug,
      name: s.name,
      prefecture: s.prefecture,
      wins: s.wins,
    })),
  },
  null,
  2,
)};
`;

writeFileSync(OUT, body, "utf8");
console.log(`\n書き出した: ${path.relative(ROOT, OUT)}`);
}
