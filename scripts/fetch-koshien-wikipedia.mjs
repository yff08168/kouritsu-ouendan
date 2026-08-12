/**
 * 甲子園（春の選抜・夏の選手権）の大会別記事を Wikipedia から取得して
 * data/wikipedia-cache/ に貯める。
 *
 *   node scripts/fetch-koshien-wikipedia.mjs
 *   node scripts/fetch-koshien-wikipedia.mjs --refresh   … キャッシュを無視して取り直す
 *
 * なぜ大会別記事なのか:
 *   各学校の記事にも甲子園成績は書かれているが、書式が統一されていない。
 *   銚子商業には「出場8回 通算14勝8敗」と整理されている一方、成東高校は
 *   地の文に埋もれているだけで、機械的に読むと取りこぼす。
 *   大会別記事は「代表校」表と「試合結果」節の形が古い大会から一貫している。
 *
 * なぜ Wikipedia なのか:
 *   CC BY-SA で商用利用が明示的に許諾されており、API での取得も正規の手段。
 *   他の候補（一球速報.com・バーチャル高校野球）は規約で自動取得を禁じている。
 *   高野連の公式サイトは規約が無く一次情報だが、当年分しか残っていない。
 *   詳細は README「甲子園出場歴・創立年・紹介文」。
 *
 * ここでは取得だけを行う。解析は build-koshien-seed.mjs。
 * 取り直しが要らないようにキャッシュを挟んでいる（相手のサーバに何度も行かない）。
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");

// Wikimedia の方針で、連絡先の分かる User-Agent を付けることが求められている。
// **HTTPヘッダはASCIIしか通らない**ので、ここに日本語を書くと fetch が
// TypeError（Cannot convert argument to a ByteString）で落ちる。
const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";

/** 相手のサーバに負荷をかけないための間隔（ミリ秒） */
const INTERVAL = 800;

const REFRESH = process.argv.includes("--refresh");

/**
 * 夏 = 全国高等学校野球選手権大会。第1回(1915)〜。
 * 第30回(1948)の学制改革より前は「全国中等学校優勝野球大会」。
 * 記念大会は記事名に「記念」が入るが、素の名前がリダイレクトになっているので
 * redirects=1 で解決できる。どちらの名前で引けるか分からないので候補を順に試す。
 */
function summerCandidates(n) {
  return [
    `第${n}回全国高等学校野球選手権大会`,
    `第${n}回全国中等学校優勝野球大会`,
    `第${n}回記念全国高等学校野球選手権大会`,
  ];
}

/** 春 = 選抜高等学校野球大会。第1回(1924)〜。第20回(1948)より前は「選抜中等学校野球大会」。 */
function springCandidates(n) {
  return [
    `第${n}回選抜高等学校野球大会`,
    `第${n}回選抜中等学校野球大会`,
    `第${n}回記念選抜高等学校野球大会`,
  ];
}

/**
 * 開催されなかった年。記事自体が無いので取りに行かない。
 * 夏: 1918年(米騒動で中止)・1941年(戦局)・1942〜1945年(中断)・2020年(コロナ)
 *     ただし回数は中止年を飛ばして数える大会があるため、実際の欠番は取得時に判定する。
 * ここでは「候補をすべて試しても見つからない」ことを異常ではなく欠番として扱う。
 */

async function fetchWikitext(title) {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
    "&prop=wikitext&redirects=1&page=" +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${title}`);
  const json = await res.json();
  if (json.error) return null; // missingtitle など
  return { title: json.parse.title, wikitext: json.parse.wikitext };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 大会1つぶん。候補名を順に試して最初に見つかったものを使う。 */
async function fetchTournament(season, n) {
  const cachePath = path.join(CACHE_DIR, `${season}-${String(n).padStart(3, "0")}.json`);
  if (!REFRESH && existsSync(cachePath)) {
    return { ...JSON.parse(readFileSync(cachePath, "utf8")), cached: true };
  }

  const candidates = season === "summer" ? summerCandidates(n) : springCandidates(n);
  for (const c of candidates) {
    const got = await fetchWikitext(c);
    await sleep(INTERVAL);
    if (got && got.wikitext.length > 1000) {
      const record = { season, no: n, requested: c, title: got.title, wikitext: got.wikitext };
      writeFileSync(cachePath, JSON.stringify(record), "utf8");
      return { ...record, cached: false };
    }
  }
  const record = { season, no: n, requested: candidates[0], title: null, wikitext: null };
  writeFileSync(cachePath, JSON.stringify(record), "utf8");
  return { ...record, cached: false };
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  // 2026年時点。夏は第108回、春は第98回まで。
  const plan = [
    ["summer", 108],
    ["spring", 98],
  ];

  let hit = 0;
  let miss = 0;
  let fromCache = 0;
  const missing = [];

  for (const [season, last] of plan) {
    const label = season === "summer" ? "夏" : "春";
    for (let n = 1; n <= last; n++) {
      const r = await fetchTournament(season, n);
      if (r.cached) fromCache++;
      if (r.title) {
        hit++;
        if (!r.cached) console.log(`${label}第${n}回 → ${r.title}（${r.wikitext.length}文字）`);
      } else {
        miss++;
        missing.push(`${label}第${n}回`);
        console.log(`${label}第${n}回 → 見つからない`);
      }
    }
  }

  console.log("");
  console.log(`取得できた大会: ${hit}`);
  console.log(`見つからない  : ${miss}`);
  console.log(`キャッシュ利用: ${fromCache}`);
  if (missing.length > 0) {
    console.log("");
    console.log("見つからなかった大会（中止・欠番の可能性がある。目視で確認すること）:");
    console.log("  " + missing.join(" / "));
  }
}

await main();
