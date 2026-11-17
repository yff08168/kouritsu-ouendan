/**
 * 「公立と数える校名」の索引（`getSchoolNameIndex`）を、**補う前と補った後**で比べて検算する。
 *
 *   node scripts/check-public-index.mjs                       … 学校マスタは一時フォルダの控え（24時間）を使う
 *   node --env-file=.env.local scripts/check-public-index.mjs … 控えが無いとき（Supabase を4回読む。約0.8MB）
 *
 * ------------------------------------------------------------------
 * ★ 何をするか（2026-11-04）
 *
 *   閉校・改称した公立校を補う2つの表（別名表と手書きの公立校。`src/lib/school-name-index.ts`）を
 *   入れた前後で、**本物のコード**（`src/lib/*.ts`）に同じ学校マスタを渡して数え直す。
 *   TypeScript は `jiti`（node_modules にある）で直接読むので、**サイトと同じ関数が動く**。
 *   ★**Supabase の転送量は増やさない**: 学校マスタは `scripts/senpu/lib.mjs` の `loadAllSchools` と
 *   同じ控え（`<一時フォルダ>/kouritsu-schools-cache.json`）を読む。
 *   別名表と手書きの表は**コードに入っているので、DB の読み取りは1行も増えない。**
 *
 * ★ 検算（1つでも NG なら終了コード 1）
 *   1. 別名表の slug が、すべて学校マスタ（公開済み）にある
 *   2. **補う前に引けていた校名が、1つも変わっていない**（補いは「空いている鍵」にしか入らない）
 *   3. 手書きの公立校の校名が、試合に実在し、補う前は引けていない（死んだ行・重複が無い）
 *   4. 同じ大会で、別々の校名が同じ学校に当たっていない（`publicEntrants` が1校に潰してしまう）
 *   5. 学校ページが無い公立校（slug が null）が、トーナメント表で `closed` になる
 *
 * ★ 学校マスタを入れ替えた直後は、控えを消してから走らせること。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  console.error("jiti が見つかりません。`npm ci` で node_modules を入れ直してください。");
  process.exit(2);
}
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(ROOT, "src").replace(/\\/g, "/") },
  fsCache: false,
});

// ------------------------------------------------------------------
// 学校マスタ（公開済みの行だけ。anon キー・読み取り専用）
// ------------------------------------------------------------------
async function loadSchoolRows() {
  const file = process.env.SENPU_SCHOOLS_CACHE ?? path.join(os.tmpdir(), "kouritsu-schools-cache.json");
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600 * 1000) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("学校マスタの控えが無く、環境変数も読めません。`node --env-file=.env.local` で実行してください");
  }
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/schools?select=slug,name,official_name,city,establishment,school_kind,prefecture:prefectures(name,slug)&order=slug.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } },
    );
    if (!res.ok) throw new Error(`schools ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

const rows = await loadSchoolRows();
const idx = await jiti.import("@/lib/school-name-index");
const kg = await jiti.import("@/lib/koshien-games");
const jg = await jiti.import("@/lib/jingu-games");
const nt = await jiti.import("@/lib/national-tournaments");
const kp = await jiti.import("@/lib/koshien-public");
const rb = await jiti.import("@/lib/regional-bracket");

const { KOSHIEN_GAMES, teamPrefecture } = kg;
const { buildSchoolNameIndex, KOSHIEN_SCHOOL_ALIASES } = idx;
const { UNLINKED_PUBLIC_SCHOOLS } = await jiti.import("@/lib/content/koshien-unlinked-schools");

const before = buildSchoolNameIndex(rows, "koshien", { aliases: [], unlinked: [] });
const after = buildSchoolNameIndex(rows, "koshien");
const beforeJingu = buildSchoolNameIndex(rows, "jingu", { aliases: [], unlinked: [] });
const afterJingu = buildSchoolNameIndex(rows, "jingu");

let ng = 0;
const check = (ok, label, detail = []) => {
  console.log(`${ok ? "OK" : "NG"}  ${label}`);
  if (!ok) {
    ng += 1;
    for (const d of detail.slice(0, 20)) console.log(`      - ${d}`);
    if (detail.length > 20) console.log(`      … 他 ${detail.length - 20} 件`);
  }
};

// ------------------------------------------------------------------
// 1〜5. 検算
// ------------------------------------------------------------------
console.log(`学校マスタ ${rows.length}行／別名表 ${KOSHIEN_SCHOOL_ALIASES.length}件／手書きの公立校 ${UNLINKED_PUBLIC_SCHOOLS.length}件\n`);

const slugs = new Set(rows.map((r) => r.slug));
check(
  KOSHIEN_SCHOOL_ALIASES.every((a) => slugs.has(a.slug)),
  "1. 別名表の slug がすべて学校マスタ（公開済み）にある",
  KOSHIEN_SCHOOL_ALIASES.filter((a) => !slugs.has(a.slug)).map((a) => `${a.display} → ${a.slug}`),
);

// 試合に出てくる全チーム（校名＋県）
const teams = new Map();
for (const g of KOSHIEN_GAMES) {
  for (const t of g.teams) {
    const pref = teamPrefecture(t);
    const k = `${t.display}\t${pref ?? ""}`;
    if (!teams.has(k)) teams.set(k, { display: t.display, pref, tournaments: new Set() });
    teams.get(k).tournaments.add(`${g.year}${g.season}`);
  }
}

const changed = [];
let resolvedBefore = 0;
let resolvedAfter = 0;
for (const t of teams.values()) {
  const b = before.find(t.display, t.pref);
  const a = after.find(t.display, t.pref);
  if (b) resolvedBefore += 1;
  if (a) resolvedAfter += 1;
  if (b && (!a || a.slug !== b.slug)) {
    changed.push(`${t.display}(${t.pref ?? "県不明"}): ${b.slug} → ${a?.slug ?? "引けない"}`);
  }
}
check(changed.length === 0, "2. 補う前に引けていた校名が、1つも変わっていない", changed);

const dead = [];
// 別名表だけを重ねた索引（手書きの公立校と鍵が重なっていないかを見る）
const aliasesOnly = buildSchoolNameIndex(rows, "koshien", { unlinked: [] });
for (const u of UNLINKED_PUBLIC_SCHOOLS) {
  if (aliasesOnly.find(u.display, u.prefless ? undefined : u.pref)) {
    dead.push(`${u.display}(${u.pref}) は別名表がすでに結んでいる（手書きと鍵がぶつかり、どちらも引けなくなる）`);
  }
  const hits = [...teams.values()].filter(
    (t) => t.display === u.display && (t.pref ? kg.prefectureKey(t.pref) === kg.prefectureKey(u.pref) : u.prefless),
  );
  if (hits.length === 0) dead.push(`${u.display}(${u.pref}) が試合に出てこない（校名か県か prefless が違う）`);
  for (const h of hits) {
    if (before.find(h.display, h.pref)) dead.push(`${u.display}(${u.pref}) は補う前から引けている（手書きは要らない）`);
  }
  if (!after.find(u.display, u.prefless ? undefined : u.pref)) dead.push(`${u.display}(${u.pref}) が引けない`);
}
check(dead.length === 0, "3. 手書きの公立校の校名が試合に実在し、補う前は引けていない", dead);

const dup = [];
{
  const seen = new Map();
  for (const t of nt.listKoshienTournaments()) {
    for (const g of t.games) {
      for (const x of g.teams) {
        const s = after.find(x.display, teamPrefecture(x));
        if (!s) continue;
        const key = `${t.slug}\t${s.slug ?? `unlinked:${s.name}`}`;
        const prev = seen.get(key);
        if (prev && prev !== x.display) dup.push(`${t.slug}: 「${prev}」と「${x.display}」が同じ学校（${s.slug ?? s.name}）`);
        seen.set(key, x.display);
      }
    }
  }
}
check(dup.length === 0, "4. 同じ大会で、別々の校名が同じ学校に当たっていない", [...new Set(dup)]);

{
  const bad = [];
  let closedTeams = 0;
  for (const t of nt.listKoshienTournaments()) {
    const games = nt.toRegionalGames(t, (d, p) => after.find(d, p));
    for (const g of games) {
      for (const x of g.teams) {
        if (x.closed) closedTeams += 1;
        if (x.closed && x.slug) bad.push(`${t.slug} ${x.display}: closed なのに slug がある`);
      }
    }
    // 組めていた表が組めなくなっていない
    const bb = rb.buildRegionalBracket(games);
    const bBefore = rb.buildRegionalBracket(nt.toRegionalGames(t, (d, p) => before.find(d, p)));
    if (Boolean(bb) !== Boolean(bBefore)) bad.push(`${t.slug}: トーナメント表の組めた／組めないが変わった`);
  }
  check(bad.length === 0, `5. 学校ページが無い公立校が closed になり、トーナメント表の成否は変わらない（closed ${closedTeams}チーム）`, bad);
}

// ------------------------------------------------------------------
// 件数の比較
// ------------------------------------------------------------------
console.log(`\n--- 甲子園の校名（県つき）${teams.size}件 ---`);
console.log(`  引けた校名: ${resolvedBefore} → ${resolvedAfter}（+${resolvedAfter - resolvedBefore}）`);

const yearsBefore = kp.listPublicYears((d, p) => before.find(d, p));
const yearsAfter = kp.listPublicYears((d, p) => after.find(d, p));
const pageYears = (ys) => ys.filter((y) => y.entrantCount > 0);
const sum = (ys, f) => ys.reduce((n, y) => n + f(y), 0);
console.log(`\n--- /koshien/public/<年> ---`);
console.log(`  ページになる年: ${pageYears(yearsBefore).length} → ${pageYears(yearsAfter).length}`);
console.log(`  公立の出場（のべ）: ${sum(yearsBefore, (y) => y.entrantCount)} → ${sum(yearsAfter, (y) => y.entrantCount)}`);
console.log(`  公立が勝った試合: ${sum(yearsBefore, (y) => y.wins)} → ${sum(yearsAfter, (y) => y.wins)}`);
console.log(`  公立が優勝した大会: ${sum(yearsBefore, (y) => y.publicChampions)} → ${sum(yearsAfter, (y) => y.publicChampions)}`);

const byYearBefore = new Map(yearsBefore.map((y) => [y.year, y]));
const diffs = yearsAfter
  .map((y) => ({ year: y.year, b: byYearBefore.get(y.year)?.entrantCount ?? 0, a: y.entrantCount }))
  .filter((y) => y.a !== y.b)
  .sort((x, y) => x.year - y.year);
console.log(`  公立の出場校数が変わった年: ${diffs.length}年`);
const newPages = diffs.filter((d) => d.b === 0 && d.a > 0).map((d) => d.year);
if (newPages.length) console.log(`  ★新しくページになる年（補う前は公立が0校）: ${newPages.join("・")}`);
const showYears = (process.env.SHOW_YEARS ?? "").split(",").filter(Boolean).map(Number);
const wanted = diffs.filter((d) => showYears.includes(d.year) || d.year >= 1990);
for (const d of wanted) console.log(`    ${d.year}年: ${d.b} → ${d.a}校（+${d.a - d.b}）`);
if (diffs.length > wanted.length) console.log(`    （1989年以前 ${diffs.length - wanted.length}年は SHOW_YEARS=1927,1950 のように指定すると出す）`);

const champsBefore = kp.listPublicChampions((d, p) => before.find(d, p));
const champsAfter = kp.listPublicChampions((d, p) => after.find(d, p));
console.log(`\n--- /koshien/public/champions ---`);
console.log(`  公立が優勝した大会: ${champsBefore.champions.length} → ${champsAfter.champions.length}`);
console.log(`  公立が準優勝した大会: ${champsBefore.runnersUp.length} → ${champsAfter.runnersUp.length}`);
const had = new Set(champsBefore.champions.map((e) => e.tournament.slug));
const added = champsAfter.champions.filter((e) => !had.has(e.tournament.slug));
console.log(`  ★増えた優勝（${added.length}）:`);
for (const e of added.sort((x, y) => y.tournament.year - x.tournament.year)) {
  console.log(
    `    ${e.tournament.year}${e.tournament.season === "spring" ? "春" : "夏"}  ${e.champion}（${e.school.slug ?? "学校ページなし"}）  ${e.score ?? ""} ${e.runnerUp}`,
  );
}
const hadR = new Set(champsBefore.runnersUp.map((e) => e.tournament.slug));
const addedR = champsAfter.runnersUp.filter((e) => !hadR.has(e.tournament.slug));
console.log(`  ★増えた準優勝（${addedR.length}）: ${addedR.map((e) => `${e.tournament.year}${e.tournament.season === "spring" ? "春" : "夏"} ${e.runnerUp}`).join("、")}`);

// ------------------------------------------------------------------
// 6. DB の出場歴（supabase/koshien.sql）の側から見る
//
//   上の検算は「試合のチーム → 学校」の向き。**逆向き**（DB が「この学校はこの大会に出た」と言っているのに、
//   大会ページではその学校に結び付いていない）も見る。AGENTS.md「照合できなかったものは両方向とも報告する」。
//   ★DB の出場歴は Wikipedia の表のリンクから作ったもので、**試合のデータとは出典の経路が別**。
//   食い違いは「どちらかに穴がある」ことの印になる。
// ------------------------------------------------------------------
const dbByTournament = new Map(); // `${年}|${季節}` -> Set(slug)
let dbRowCount = 0;
{
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "koshien.sql"), "utf8");
  for (const m of sql.matchAll(/where slug = '([^']+)'\), (\d{4}), '(spring|summer)'/g)) {
    const k = `${m[2]}|${m[3]}`;
    if (!dbByTournament.has(k)) dbByTournament.set(k, new Set());
    dbByTournament.get(k).add(m[1]);
    dbRowCount += 1;
  }
}

/**
 * 余った行 ＝ DB に出場歴があるのに、その大会の試合のチームがその学校に結び付かない
 * 余ったチーム ＝ 大会ページが学校に結ぶのに、DB にその出場歴が無い
 * ★DB が持たない大会（1924春・1925春・1929春。表を作ったときの記事のキャッシュ不良）は比べようが無いので飛ばす。
 */
function crossCheck(index, fromYear) {
  const surplusRows = [];
  const surplusTeams = [];
  let checked = 0;
  for (const t of nt.listKoshienTournaments()) {
    const db = dbByTournament.get(`${t.year}|${t.season}`);
    if (!db || t.year < fromYear) continue;
    const resolved = new Map(); // slug -> { display, alias }
    for (const g of t.games) {
      for (const x of g.teams) {
        const s = index.find(x.display, teamPrefecture(x));
        if (s?.slug) resolved.set(s.slug, { display: x.display, alias: Boolean(s.alias) });
      }
    }
    const label = `${t.year}${t.season === "spring" ? "春" : "夏"}`;
    for (const slug of db) {
      checked += 1;
      if (!resolved.has(slug)) surplusRows.push({ slug, label });
    }
    for (const [slug, r] of resolved) if (!db.has(slug)) surplusTeams.push({ slug, label, ...r });
  }
  return { surplusRows, surplusTeams, checked };
}

const crossBefore = crossCheck(before, 1900);
const crossAfter = crossCheck(after, 1900);
check(
  crossAfter.surplusTeams.every((x) => !x.alias),
  "6. 別名が結ぶチームは、すべて DB に出場歴の行がある（別名が、DB に無い出場を学校に結んでいない）",
  crossAfter.surplusTeams.filter((x) => x.alias).map((x) => `${x.label} ${x.display} → ${x.slug}`),
);

const bySchool = (list) => {
  const m = new Map();
  for (const x of list) m.set(x.slug, [...(m.get(x.slug) ?? []), x.label]);
  return m;
};
const since1985 = (cx) => ({
  rows: cx.surplusRows.filter((x) => Number.parseInt(x.label, 10) >= 1985),
});
console.log(`\n--- DB の出場歴 ${dbRowCount}行（koshien.sql）から見た突き合わせ ---`);
console.log(
  `  余った行（DBにあるが大会ページで結び付かない）: ${crossBefore.surplusRows.length}行／${bySchool(crossBefore.surplusRows).size}校 → ` +
    `${crossAfter.surplusRows.length}行／${bySchool(crossAfter.surplusRows).size}校` +
    `（うち1985年以降 ${since1985(crossBefore).rows.length}行 → ${since1985(crossAfter).rows.length}行）`,
);
for (const [slug, labels] of bySchool(crossAfter.surplusRows)) console.log(`    残り: ${slug}（${labels.join(" ")}）`);
console.log(
  `  余ったチーム（大会ページが結ぶがDBに行が無い）: ${crossBefore.surplusTeams.length}件 → ${crossAfter.surplusTeams.length}件` +
    `（補う前後で変わらない。DB の照合漏れ・再編期の同名校・試合データの県の誤り。README「甲子園の公立判定の穴」の残した穴）`,
);
for (const [slug, labels] of [...bySchool(crossAfter.surplusTeams)].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${slug}（${labels.length}件: ${labels.slice(0, 5).join(" ")}${labels.length > 5 ? " …" : ""}）`);
}

// ------------------------------------------------------------------
// 明治神宮大会（高校の部）
// ------------------------------------------------------------------
const jinguResolve = (index) => (d, p) => index.find(d, p ?? jg.jinguPrefectureOf(d));
let jb = 0;
let ja = 0;
const jinguDiff = [];
for (const t of nt.listJinguTournaments()) {
  const eb = nt.publicEntrants(t, jinguResolve(beforeJingu)).length;
  const ea = nt.publicEntrants(t, jinguResolve(afterJingu)).length;
  jb += eb;
  ja += ea;
  if (eb !== ea) jinguDiff.push(`${t.year}年 ${eb}→${ea}`);
}
console.log(`\n--- /jingu/<年> ---`);
console.log(`  公立の出場（のべ）: ${jb} → ${ja}${jinguDiff.length ? `（${jinguDiff.join("、")}）` : "（変わらない）"}`);

// ------------------------------------------------------------------
// 甲子園の大会ページ（/koshien/<年-季節>）
// ------------------------------------------------------------------
let tb = 0;
let ta = 0;
let tournamentsChanged = 0;
for (const t of nt.listKoshienTournaments()) {
  const eb = nt.publicEntrants(t, (d, p) => before.find(d, p)).length;
  const ea = nt.publicEntrants(t, (d, p) => after.find(d, p)).length;
  tb += eb;
  ta += ea;
  if (eb !== ea) tournamentsChanged += 1;
}
console.log(`\n--- /koshien/<年-季節>（${nt.listKoshienTournaments().length}大会）---`);
console.log(`  「この大会に出場した公立高校」の延べ: ${tb} → ${ta}（${tournamentsChanged}大会で変わる）`);

console.log(ng === 0 ? "\n検算はすべて OK。" : `\n検算に NG が ${ng} 件ある。`);
process.exit(ng === 0 ? 0 : 1);
