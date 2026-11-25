/**
 * 公立高校（国立・高専を含む私立以外）の出身で、プロ野球（NPB）に入った選手の一覧を作る。
 *
 *   node scripts/build-pro-alumni.mjs          … 書き出す
 *   node scripts/build-pro-alumni.mjs --dry    … 書き出さずに報告だけ
 *
 * 入力: data/wikipedia-cache/pro-players.json（scripts/fetch-pro-players-wikipedia.mjs）
 *       data/wikipedia-cache/pro-draft.json（scripts/fetch-pro-draft-wikipedia.mjs。あれば）
 * 出力: src/lib/data/pro-alumni/<地区>.json（**生成物。直接編集しない**）と index.json
 *       読むのは src/lib/pro-alumni.ts
 *
 * ------------------------------------------------------------------
 * ★★ 決めごと（2026-11-25。運営者の指示と回答）
 *
 *   ・対象は **1965年のドラフト開始以降にプロ入りした選手**（現役・引退とも）。
 *   ・進路は **高校 →（大学・社会人）→ プロ** のどれでもよい。
 *   ・ドラフトで指名された高校3年生は**指名の時点から**載せる（pro-draft.json から）。
 *   ・**載せるのは事実だけ**: 氏名・進路・入団した球団・入団年・ドラフト順位。
 *     **成績・写真・生年月日は載せない**（fetch の時点で保存もしていない）。
 *   ・**選手ごとの個別ページは作らない**（一覧ページと学校ページの卒業生欄だけ）。
 *
 * ★★ 「卒業生」と断定できるものだけを出す
 *
 *   経歴欄に**高校が2校以上**並ぶ選手（転校）は、どちらを卒業したか読み取れないので**出さない**
 *   （件数は報告に出す）。中学校だけの記録や、高校が1校も無い選手も出さない。
 *
 * ★★ 公立かどうかは校名から推測しない
 *
 *   高校記事のリンク先を、学校マスタの正式名称（official_name）に結び付けられたものだけが
 *   「学校マスタの学校」。統廃合した学校は、人が確認した data/school-successor.json の
 *   confirmed: true だけ使う（match-koshien.mjs と同じ規則）。
 *   マスタに無くても、記事名に「県立・市立・都立…」が入っていれば**閉校した公立校**として
 *   学校ページへは結ばずに載せる（koshien-unlinked-schools と同じ扱い）。
 *   **私立・外国の学校は出さない。**
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { candidates, loadSchools, loadSuccessors } from "./match-koshien.mjs";
import {
  HS_RE,
  PUBLIC_MARKERS,
  UNIV_RE,
  classify,
  displayName,
  sameAffiliation,
  shortTeam,
  yearsOf,
} from "./lib/pro-careers.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLAYERS = path.join(ROOT, "data", "wikipedia-cache", "pro-players.json");
const DRAFT = path.join(ROOT, "data", "wikipedia-cache", "pro-draft.json");
const OUT_DIR = path.join(ROOT, "src", "lib", "data", "pro-alumni");
const DRY = process.argv.includes("--dry");

const FIRST_DRAFT_YEAR = 1965;

// ------------------------------------------------------------------
// 学校マスタ
// ------------------------------------------------------------------
const prefNameBySlug = new Map();
{
  const seed = readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8");
  const start = seed.indexOf("insert into public.prefectures");
  const block = seed.slice(start, seed.indexOf(";", start));
  for (const m of block.matchAll(/\(\s*\d+,\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g)) {
    prefNameBySlug.set(m[2], m[1]);
  }
  if (prefNameBySlug.size < 49) throw new Error(`都道府県が ${prefNameBySlug.size} 件しか読めていない（49件のはず）`);
}
const masterRows = loadSchools().map((s) => ({
  slug: s.slug,
  name: s.name,
  officialName: s.officialName,
  prefSlug: s.prefSlug,
}));
const masterByOfficial = new Map();
for (const s of masterRows) if (!masterByOfficial.has(s.officialName)) masterByOfficial.set(s.officialName, s);
const successors = loadSuccessors();

/** 「ヶ」と「ケ」など、表記ゆれだけの違い。**2校以上が同じ形になるものは使わない**（null） */
const normKey = (s) => s.normalize("NFKC").replace(/ヶ/g, "ケ");
const masterByNorm = new Map();
for (const s of masterRows) {
  const k = normKey(s.officialName);
  masterByNorm.set(k, masterByNorm.has(k) ? null : s);
}

/**
 * 高校の記事名のリダイレクト（scripts/fetch-pro-players-wikipedia.mjs --redirects）。
 * 改称・移管した学校は、記事が移動して旧名がリダイレクトになる。
 */
const REDIRECTS_FILE = path.join(ROOT, "data", "wikipedia-cache", "pro-school-redirects.json");
const redirects = existsSync(REDIRECTS_FILE) ? JSON.parse(readFileSync(REDIRECTS_FILE, "utf8")) : {};

/**
 * 記事名 → 学校マスタの学校。
 *   ① そのままの名前（match-koshien.mjs の candidates と、人が確認した統廃合の対応表）
 *   ② リダイレクト先（改称・移管）
 * 結べたら `former`（**当時の校名**）を返す。**②と統廃合の対応表で結んだものだけ**。
 */
function articleToSchool(article) {
  const tryOne = (a) => {
    const x = successors.get(a) ?? a;
    for (const c of candidates(x)) {
      const hit = masterByOfficial.get(c) ?? masterByNorm.get(normKey(c));
      if (hit) return hit;
    }
    return null;
  };
  let hit = tryOne(article);
  if (hit) return { school: hit, former: successors.has(article) ? article : null, how: successors.has(article) ? "successor" : "direct" };
  const to = redirects[article];
  if (to) {
    hit = tryOne(to);
    if (hit) return { school: hit, former: article, how: "redirect" };
  }
  return null;
}


const players = JSON.parse(readFileSync(PLAYERS, "utf8")).players;
const draftYears = existsSync(DRAFT) ? JSON.parse(readFileSync(DRAFT, "utf8")).years : {};
/** `年|選手記事名` → ドラフトの表の行 */
const draftRowOf = new Map();
for (const [y, v] of Object.entries(draftYears)) {
  for (const r of v.picks ?? []) if (r.player.title) draftRowOf.set(`${y}|${r.player.title}`, r);
}

const stat = {
  articles: 0, redirectOrEmpty: 0, noCareers: 0, beforeEra: 0, noYear: 0, noHs: 0, multiHs: 0,
  notPublic: 0, noNpbTeam: 0, matched: 0, unlinkedPublic: 0, viaSuccessor: 0, viaRedirect: 0, routeFixed: 0,
};
const unmatchedHs = new Map(); // 公立かどうか分からずに外したもの（報告用）
const out = [];

for (const [title, p] of Object.entries(players)) {
  stat.articles++;
  if (!p) { stat.redirectOrEmpty++; continue; }
  if (!p.careers?.length) { stat.noCareers++; continue; }

  const year = Number(p.draftYear ?? p.entryYear ?? 0);
  if (!year) { stat.noYear++; continue; }
  if (year < FIRST_DRAFT_YEAR) { stat.beforeEra++; continue; }

  // 経歴を、最初の NPB の球団までに区切る
  const items = p.careers.map((it) => ({ ...it, kind: classify(it) }));
  const npbAt = items.findIndex((it) => it.kind === "npb");
  if (npbAt < 0) { stat.noNpbTeam++; continue; }
  const before = items.slice(0, npbAt);

  const hsItems = before.filter((it) => it.kind === "hs");
  if (hsItems.length === 0) { stat.noHs++; continue; }
  if (hsItems.length >= 2) { stat.multiHs++; continue; }
  const hs = hsItems[0];

  // 学校マスタ → なければ「公立だった閉校校」→ なければ私立・外国として外す
  const article = hs.link ?? "";
  const hit = article ? articleToSchool(article) : null;
  let school;
  let former = null; // 当時の校名（改称・移管・統合した学校だけ）
  if (hit) {
    school = { slug: hit.school.slug, officialName: hit.school.officialName, prefSlug: hit.school.prefSlug };
    stat.matched++;
    if (hit.how === "successor") stat.viaSuccessor++;
    if (hit.how === "redirect") stat.viaRedirect++;
    former = hit.former;
  } else if (article && PUBLIC_MARKERS.test(article)) {
    const prefix = [...prefNameBySlug].find(([, name]) => article.startsWith(`${name}県立`) || article.startsWith(`${name}府立`) || article.startsWith(`${name}都立`));
    school = { slug: null, officialName: article, prefSlug: prefix ? prefix[0] : null };
    stat.unlinkedPublic++;
  } else {
    stat.notPublic++;
    unmatchedHs.set(article || hs.label, (unmatchedHs.get(article || hs.label) ?? 0) + 1);
    continue;
  }

  // 高校の後ろ、最初の NPB 球団の前にあるものが「経由」（大学・社会人・クラブ）
  const hsAt = before.indexOf(hs);
  const route = before
    .slice(hsAt + 1)
    .filter((it) => it.kind === "univ" || it.kind === "other")
    .map((it) => ({
      label: it.label.replace(/<br\s*\/?>.*$/i, "").replace(/(硬式)?野球部$/, "").trim(),
      kind: it.kind === "univ" ? "university" : "other",
    }));

  /*
    ★★**「高校から直接」と書く前に、ドラフトの表で確かめる**（2026-11-25。検算で見つかった）。
    経歴欄が高校 → 球団と書いていても、**ドラフトの表の所属が独立リーグ・社会人・海外球団**のことがある
    （愛媛県立松山工業 → 愛媛マンダリンパイレーツ → 巨人 など）。経歴欄が途中の所属を省いているだけで、
    **「直接」と書くと事実と違う。** 表の所属が高校でなく、経歴の高校と別のものなら、それを経由先に足す。
    ★**足すのは「経由がカラ」のときだけ**（大学・社会人が書いてある選手は、書き方の違い
    （「新日本製鐵君津」と「日本製鉄かずさマジック」など）で同じチームを二重に並べてしまう）。
  */
  let routeFixed = false;
  if (route.length === 0 && p.draftYear) {
    const row = draftRowOf.get(`${p.draftYear}|${title}`);
    if (row && !sameAffiliation(hs, row) && row.affil.label && !HS_RE.test(`${row.affil.link ?? ""} ${row.affil.label}`)) {
      route.push({
        label: row.affil.label.replace(/(硬式)?野球部$/, "").trim(),
        kind: UNIV_RE.test(row.affil.label) ? "university" : "other",
      });
      routeFixed = true;
      stat.routeFixed++;
    }
  }

  /*
    ★★**在籍した球団。独立リーグ・海外球団も入れる**（運営者の了承。2026-11-25）。
    ・最初の NPB 球団から後ろだけ見る（それより前の独立リーグ・海外・社会人は「経由」に入れている）。
    ・NPB の球団は名簿で判定済み（`kind: "npb"`）。**それ以外で在籍年が付いているもの**（MLB・韓国・台湾・独立リーグ）を
      `npb: false` で並べる。**大学・高校は入れない。**
    ・「入団した球団」は引き続き**最初の NPB 球団**（`firstTeam`）。
  */
  /*
    ★**高校より前の項目**（中学校・少年野球・リトル・シニアなど）。**Wikipedia の経歴欄に書かれているものだけ**
    （2026-11-25 の実測で、高校が1校の選手 5,730人のうち **10人（0.2%）** しか書かれていない）。
    ★**無い選手に「中学・少年野球は不明」とは書かない**（書かれていないだけ。空のままにする）。
  */
  const early = before
    .slice(0, hsAt)
    .filter((it) => it.kind === "junior" || it.kind === "other")
    .map((it) => ({
      label: it.label.replace(/<br\s*\/?>.*$/i, "").trim(),
      kind: it.kind === "junior" ? "junior" : "youth",
    }))
    .filter((e) => e.label);

  const teams = items
    .slice(npbAt)
    .filter((it) => it.kind === "npb" || (it.kind === "other" && yearsOf(it.text)))
    .map((it) =>
      it.kind === "npb"
        ? { team: shortTeam(it.link), years: yearsOf(it.text) }
        : { team: it.label.replace(/<br\s*\/?>.*$/i, "").trim(), years: yearsOf(it.text), npb: false },
    );

  out.push({
    title,
    name: displayName(title),
    school,
    formerName: former,
    early,
    route,
    teams,
    draft: p.draftYear ? { year: Number(p.draftYear), rank: p.draftRank || null } : null,
    entryYear: p.entryYear ? Number(p.entryYear) : null,
    routeFixed,
  });
}

// ------------------------------------------------------------------
// ドラフトで指名された高校生（入団前）。**指名の時点から載せる**（運営者の判断。2026-11-25）
//   ・選手記事は「仮契約が成立するまで作らない」ので、ドラフトの表の「所属」が高校のものを読む。
//   ・**いちばん新しいドラフトの年だけ**。前の年の指名は、入団すれば選手記事から出る。
//   ・結果が「拒否」「辞退」「交渉権放棄」の選手は載せない（プロには入らない）。
//   ・**事実（指名した球団・順位）以外は書かない。**
// ------------------------------------------------------------------
const pendingOut = { year: null, picks: [] };
const pendingStat = { rows: 0, hs: 0, public: 0, declined: 0, hasArticle: 0 };
if (existsSync(DRAFT)) {
  const draft = JSON.parse(readFileSync(DRAFT, "utf8")).years;
  const latest = Math.max(...Object.keys(draft).filter((y) => draft[y]?.picks?.length).map(Number));
  pendingOut.year = latest;
  for (const pick of draft[latest].picks) {
    pendingStat.rows++;
    const link = pick.affil.link;
    // 大学・社会人・独立リーグの指名は、入団後に選手記事（経歴）から読む
    if (!link || !HS_RE.test(`${link} ${pick.affil.label}`)) continue;
    pendingStat.hs++;
    if (/(拒否|辞退|交渉権放棄)/.test(pick.result)) { pendingStat.declined++; continue; }
    // 選手の記事が既にあれば、選手記事の側（経歴）で扱う
    if (pick.player.title && players[pick.player.title]) { pendingStat.hasArticle++; continue; }
    const hit = articleToSchool(link);
    if (!hit) continue; // 公立と確かめられない（私立など）は載せない
    pendingStat.public++;
    pendingOut.picks.push({
      team: shortTeam(pick.team),
      rank: (pick.kind === "development" ? "育成" : "") + pick.rank,
      kind: pick.kind,
      name: displayName(pick.player.name),
      school: { slug: hit.school.slug, officialName: hit.school.officialName, prefSlug: hit.school.prefSlug },
    });
  }
  console.log(
    `\n— ${latest}年のドラフト（入団前の高校生）—\n  表の行 ${pendingStat.rows} ／ 所属が高校 ${pendingStat.hs}（拒否・辞退 ${pendingStat.declined}・選手記事あり ${pendingStat.hasArticle}）` +
      ` ／ ★公立 ${pendingStat.public} 人`,
  );
  for (const p of pendingOut.picks) console.log(`  ${p.team} ${p.rank}  ${p.name}  ${p.school.officialName}`);
}

// ------------------------------------------------------------------
// 報告
// ------------------------------------------------------------------
console.log("— 読み取りの内訳 —");
console.log(`記事 ${stat.articles} 件`);
console.log(`  リダイレクト・取得できず ${stat.redirectOrEmpty} ／ 経歴なし ${stat.noCareers} ／ 入団年なし ${stat.noYear}`);
console.log(`  ${FIRST_DRAFT_YEAR}年より前 ${stat.beforeEra} ／ NPB球団が経歴に無い ${stat.noNpbTeam}`);
console.log(`  高校が経歴に無い ${stat.noHs} ／ 高校が2校以上（転校。出さない） ${stat.multiHs}`);
console.log(`  私立・外国・公立と確かめられない ${stat.notPublic}`);
console.log(`★ 公立（国立・高専を含む）の出身 ${out.length} 人`);
console.log(`    うち学校マスタに結べた ${stat.matched}（統廃合の対応表経由 ${stat.viaSuccessor}・リダイレクト経由 ${stat.viaRedirect}）／ 閉校校で学校ページへ結ばない ${stat.unlinkedPublic}`);
console.log(`    ドラフトの表で経由先を補った（経歴欄は高校から直接だった）${stat.routeFixed} 人`);

const top = [...unmatchedHs].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log("\n— 公立と確かめられずに外した高校（多い順。公立が混じっていないか目で確かめる）—");
for (const [name, n] of top) console.log(`  ${String(n).padStart(3)}  ${name}`);

if (DRY) {
  console.log("\n--dry なので書き出さない");
  process.exit(0);
}

// ------------------------------------------------------------------
// 書き出し: 地区ごとに学校でまとめる
// ------------------------------------------------------------------
const byPref = new Map();
for (const p of out) {
  const pref = p.school.prefSlug ?? "other";
  if (!byPref.has(pref)) byPref.set(pref, new Map());
  const schools = byPref.get(pref);
  const key = p.school.slug ?? `~${p.school.officialName}`;
  if (!schools.has(key)) {
    schools.set(key, { slug: p.school.slug, officialName: p.school.officialName, players: [] });
  }
  schools.get(key).players.push({
    name: p.name,
    ...(p.formerName ? { formerName: p.formerName } : {}),
    ...(p.early.length > 0 ? { early: p.early } : {}),
    route: p.route,
    teams: p.teams,
    draft: p.draft,
    entryYear: p.entryYear,
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) if (f.endsWith(".json")) rmSync(path.join(OUT_DIR, f));

const index = { generatedAt: new Date().toISOString(), firstYear: FIRST_DRAFT_YEAR, total: out.length, prefs: {} };
for (const [pref, schools] of [...byPref].sort()) {
  const list = [...schools.values()]
    .map((s) => ({
      ...s,
      // 新しい入団の順
      players: s.players.sort((a, b) => (b.draft?.year ?? b.entryYear ?? 0) - (a.draft?.year ?? a.entryYear ?? 0) || a.name.localeCompare(b.name, "ja")),
    }))
    .sort((a, b) => b.players.length - a.players.length || a.officialName.localeCompare(b.officialName, "ja"));
  writeFileSync(path.join(OUT_DIR, `${pref}.json`), JSON.stringify({ pref, schools: list }));
  index.prefs[pref] = { schools: list.length, players: list.reduce((n, s) => n + s.players.length, 0) };
}
writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 1));
// 指名された高校生（入団前）。学校ページと一覧ページが読む小さなファイル
writeFileSync(path.join(OUT_DIR, "draft.json"), JSON.stringify(pendingOut, null, 1));

// 地区ごとのファイルを動的 import で読む表（TypeScript は import のパスが文字列リテラルでないと解決できない）
const prefs = Object.keys(index.prefs).sort();
writeFileSync(
  path.join(OUT_DIR, "loaders.ts"),
  `// このファイルは scripts/build-pro-alumni.mjs が生成する。直接編集しない。
// 学校ページが自分の地区だけ読み込むための表。**静的 import にしないこと**（全地区が1ページに入る）。
// 型は src/lib/pro-alumni.ts で1回だけ与える（JSON をリテラル型にすると重い）。

import type { ProPrefFile } from "@/lib/pro-alumni";
import index from "./index.json";
import draft from "./draft.json";

export const PRO_ALUMNI_INDEX = index;
/** ドラフトで指名された高校生（入団前）。小さいファイルなので静的 import */
export const PRO_DRAFT = draft;

export const PRO_ALUMNI_LOADERS: Record<string, () => Promise<ProPrefFile>> = {
${prefs.map((p) => `  ${JSON.stringify(p)}: () => import("./${p}.json").then((m) => m.default as ProPrefFile),`).join("\n")}
};
`,
);
console.log(`\n書き出し: ${path.relative(ROOT, OUT_DIR)}（${byPref.size} 地区・${out.length} 人）`);
