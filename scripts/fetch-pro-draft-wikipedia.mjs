/**
 * プロ野球のドラフト会議（1965年〜）の記事から、指名された選手の表を Wikipedia から取得して
 * data/wikipedia-cache/pro-draft.json に貯める。
 *
 *   node scripts/fetch-pro-draft-wikipedia.mjs              … 未取得の年だけ取る
 *   node scripts/fetch-pro-draft-wikipedia.mjs --refresh    … 取り直す（**今年の分は指名のあと毎週のように
 *                                                              結果の欄が変わる**ので、指名の直後は --refresh）
 *   node scripts/fetch-pro-draft-wikipedia.mjs --year 2026  … その年だけ取り直す
 *
 * ------------------------------------------------------------------
 * ★★ 何のためか（2026-11-25。運営者の指示「ドラフトで指名された高校3年生は指名の時点から載せる」）
 *
 *   ① **まだ入団していない高校生**: 選手の記事は「仮契約が成立するまで作らない」ことになっている
 *      （2026年度の記事の冒頭に注記がある）ので、選手記事の Infobox（fetch-pro-players-wikipedia.mjs）
 *      からは読めない。**ドラフトの表の「所属」が高校なら、その高校を読める。**
 *   ② **検算**: 選手記事の経歴（Infobox）と、ドラフトの表（別の記事）の所属を突き合わせる
 *      （scripts/verify-pro-alumni.mjs）。**編集履歴の別々の2か所**なので、どちらかの読み違いを止められる。
 *
 * ★ 表の形は1965年から今年まで**ほぼ同じ**（`順位!!選手名!!守備!!所属!!結果`）。違うのは次の2点。
 *     ・順位のセルが `!1位`（見出し）の年と `|1位||…`（同じ行）の年がある
 *     ・球団の見出しの深さ（`===` / `====`）。リーグの見出し（パシフィック・リーグ）は球団ではない
 * ★ 選手名にリンクが無い選手がいる（記事が無い）。**名前は残し、リンクは null**。
 * ★ 育成選手選択会議は同じ表の中に `!colspan="5"|育成選手選択会議` の行で区切られている。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const OUT = path.join(CACHE_DIR, "pro-draft.json");

const UA =
  "kouritsu-ouendan/0.1 (https://kouritsu-ouendan.com; public high school baseball site) node.js";
const INTERVAL = 1200;
const FIRST = 1965;

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const yearIdx = args.indexOf("--year");
const ONLY_YEAR = yearIdx >= 0 ? Number(args[yearIdx + 1]) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, attempt = 0) {
  const u = new URL("https://ja.wikipedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) u.searchParams.set(k, v);
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

/** 注釈・脚注・コメントを落とす（中に `|` や `[[` が入っているため、読む前に消す） */
function clean(s) {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/g, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{(?:efn2?|Efn2?|refnest|Refnest|注釈)[^{}]*\}\}/g, "");
  return t;
}

/** セルの先頭の属性（`style="…"|`）を落とす。リンクの `[[A|B]]` の `|` と取り違えない */
const stripAttr = (c) => c.replace(/^\s*(?:style|class|rowspan|colspan|bgcolor|align|width|nowrap)[^|[]*\|(?!\|)/i, "").trim();

/** [[A|B]] を先頭から1つ読む。リンクが無ければ link: null */
function firstLink(cell) {
  const m = cell.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/);
  const plain = cell
    .replace(/'''?/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  return { link: m ? m[1].trim() : null, label: m ? (m[2] ?? m[1]).trim() : plain, text: plain };
}

function parseYear(wikitext) {
  const text = clean(wikitext);
  const lines = text.split("\n");
  const picks = [];
  let team = null;
  let kind = "regular";
  let inTable = false;
  let row = [];

  const flush = () => {
    if (row.length === 0) return;
    const joined = row.join("\n");
    row = [];
    // 見出し行（`!colspan="5"|育成選手選択会議` / `!順位!!選手名…`）
    if (/育成選手選択会議/.test(joined)) { kind = "development"; return; }
    if (/新人選手選択会議/.test(joined) && !/\[\[/.test(joined)) { kind = "regular"; return; }
    if (/順位\s*!!\s*選手名/.test(joined)) return;
    const cells = joined
      .replace(/\n[|!]/g, "||")
      .replace(/^[|!]/, "")
      .split("||")
      .map((c) => c.trim());
    if (cells.length < 5) return;
    const [rankRaw, playerRaw, pos, affilRaw, ...resultRest] = cells;
    const rank = stripAttr(rankRaw).replace(/'''/g, "").trim();
    if (!/^(?:\d+位|\d+巡目|外れ|[^\s]*位)/.test(rank) && !/\d/.test(rank)) return;
    const player = firstLink(stripAttr(playerRaw));
    const affil = firstLink(stripAttr(affilRaw));
    picks.push({
      team,
      kind,
      rank,
      player: { title: player.link, name: player.label },
      pos: firstLink(stripAttr(pos)).text,
      affil: { link: affil.link, label: affil.label, text: affil.text },
      result: firstLink(stripAttr(resultRest.join("||"))).text,
    });
  };

  for (const l of lines) {
    const h = l.match(/^={2,4}\s*([^=]+?)\s*={2,4}\s*$/);
    if (h) {
      flush();
      const name = h[1].trim();
      // リーグ・概要などの見出しは球団ではない
      team = /リーグ|概要|備考|指名|選択|中継|脚注|出典|外部|テレビ|ラジオ|ネット|地上波|CS|注釈|記録/.test(name) ? team : name;
      if (/概要|備考|中継|脚注/.test(name)) team = null;
      kind = "regular";
      continue;
    }
    if (/^\{\|/.test(l)) { inTable = true; row = []; continue; }
    if (/^\|\}/.test(l)) { flush(); inTable = false; continue; }
    if (!inTable) continue;
    if (/^\|-/.test(l)) { flush(); continue; }
    row.push(l);
  }
  flush();
  return picks.filter((p) => p.team);
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cache = existsSync(OUT) && !REFRESH ? JSON.parse(readFileSync(OUT, "utf8")) : { years: {} };
  const thisYear = new Date().getFullYear();
  const years = ONLY_YEAR ? [ONLY_YEAR] : Array.from({ length: thisYear - FIRST + 1 }, (_, i) => FIRST + i);

  for (const y of years) {
    if (!ONLY_YEAR && !REFRESH && cache.years[y]) continue;
    const title = `${y}年度新人選手選択会議 (日本プロ野球)`;
    const j = await api({
      action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: title, redirects: "1",
    });
    const p = j.query.pages[0];
    if (p.missing) {
      console.log(`${y}: 記事なし`);
      cache.years[y] = { picks: [], missing: true };
    } else {
      const picks = parseYear(p.revisions[0].slots.main.content);
      cache.years[y] = { title: p.title, picks };
      const hs = picks.filter((x) => /高(?:校|等学校)?$|高等学校/.test(x.affil.label + (x.affil.link ?? ""))).length;
      console.log(`${y}: ${picks.length} 件（うち所属が高校と読めるもの ${hs}）`);
    }
    cache.fetchedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(cache));
    await sleep(INTERVAL);
  }
  console.log(`完了 → ${path.relative(ROOT, OUT)}`);
}

await main();
