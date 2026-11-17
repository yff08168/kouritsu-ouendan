/**
 * 公立旋風の記事（`data/senpu/*.mjs` ＋ `data/senpu/text/*.mjs`）を読み、
 * 勝ち上がり（TournamentRun）を組み立てる。`build-senpu.mjs` と `verify-senpu.mjs` が共有する。
 *
 * ★ 記事は「骨組み」と「文章」を別のファイルに置く:
 *     data/senpu/<名前>.mjs        … slug・学校・年・成績の札・勝ち上がりの取り方（事実の取り出し方）
 *     data/senpu/text/<名前>.mjs   … slug → { title, summary, body }（人が書いた文章）
 *   文章は事実の一覧（facts.mjs の出力）を見て書き、数字は verify-senpu.mjs が検算する。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  cleanTeamName,
  isSelfTeam,
  fetchSchools,
  koshienFinal,
  koshienGames,
  koshienRunGames,
  loadAllSchools,
  makeResolve,
  normalizeName,
  prefectureKey,
  regionalRunGames,
  resultOf,
  roundDepth,
  toRegionalRunGame,
  toRunGame,
  finalInningsOf,
} from "./lib.mjs";

const DIR = path.join(ROOT, "data", "senpu");

/** 骨組み＋文章を合わせた記事の一覧 */
export async function loadDefinitions() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".mjs")).sort();
  const defs = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(path.join(DIR, f)).href)).default;
    for (const d of mod) defs.push({ ...d, __file: f });
  }
  const texts = {};
  const tdir = path.join(DIR, "text");
  if (fs.existsSync(tdir)) {
    for (const f of fs.readdirSync(tdir).filter((x) => x.endsWith(".mjs")).sort()) {
      const mod = (await import(pathToFileURL(path.join(tdir, f)).href)).default;
      for (const [slug, t] of Object.entries(mod)) {
        if (texts[slug]) throw new Error(`文章が二重に書かれています: ${slug}（${f}）`);
        texts[slug] = t;
      }
    }
  }
  const seen = new Set();
  for (const d of defs) {
    if (seen.has(d.slug)) throw new Error(`slug が二重です: ${d.slug}`);
    seen.add(d.slug);
  }
  for (const slug of Object.keys(texts)) {
    if (!seen.has(slug)) throw new Error(`骨組みの無い文章があります: ${slug}`);
  }
  return defs.map((d) => ({ ...d, ...(texts[d.slug] ?? {}), __hasText: Boolean(texts[d.slug]) }));
}

const wiki = (title) => `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`;

/** 大会の記事の表記ゆれ（大会記事は市立校を「市◯◯」、県立校を「県◯◯」と書く）に対する言い換え */
export function nameForms(display) {
  const forms = new Set([display]);
  const m = display.match(/^([市県])(.+)$/);
  if (m) forms.add(`${m[1]}立${m[2]}`);
  return [...forms];
}

/** 甲子園の勝ち上がりを組む */
export function buildKoshienRun(def, school) {
  const { year, season } = def;
  const { display, pref } = def.run;
  const { mine, all } = koshienRunGames({ year, season, display, pref });
  if (!mine.length) throw new Error(`${def.slug}: 試合が見つかりません（${display}・${pref}）`);
  const isSelf = (t) =>
    normalizeName(t.display) === normalizeName(display) &&
    (!pref || !t.pref || prefectureKey(t.pref) === prefectureKey(pref));
  const rows = mine
    .map((g) => ({ g, row: toRunGame(g, isSelf) }))
    // ★勝ち抜き戦なので回戦の深さが先。日付の無い試合が先頭に来る（2001年夏の松山商で実際になった）
    .sort((a, b) => roundDepth(a.g.round) - roundDepth(b.g.round) || (a.g.date ?? "").localeCompare(b.g.date ?? ""));
  const fin = koshienFinal(year, season);
  const champion = Boolean(fin && isSelf(fin.champion));
  const tournament = all[0].tournament;
  const computed = computedBadge(rows.map((r) => r.row), champion);
  const run = {
    phenomenonSlug: def.slug,
    schoolSlug: def.school,
    schoolName: school.name,
    year,
    season,
    tournamentName: tournament,
    result: def.badge,
    games: rows.map((r) => r.row),
    sources: [
      {
        label: `${tournament} - Wikipedia`,
        url: wiki(tournament),
        note: `${rows.length}試合の勝ち上がり（大会記事の wikitext）`,
      },
    ],
  };
  return { run, rows, all, champion, computed, isSelf };
}

/** 勝ち上がりの最後の試合から、成績の札（優勝・準優勝・ベスト4・ベスト8）を割り出す */
export function computedBadge(games, champion) {
  if (champion) return "優勝";
  const lastLoss = [...games].reverse().find((g) => g.outcome === "loss");
  if (!lastLoss) return null;
  const map = { 決勝: "準優勝", 準決勝: "ベスト4", 準々決勝: "ベスト8" };
  return map[lastLoss.round] ?? resultOf(games, false);
}

/**
 * 地方大会の勝ち上がりを組む。
 *
 *   run.scope === "full"（既定）… 大会の全試合が揃っている（`complete`）ときだけ。全試合を出す。
 *                                回戦が書いていない大会は、標準の勝ち抜き戦の形（`structureOk`）なら深さから「N回戦」と付ける
 *   run.scope === "late"       … 準々決勝以降だけ（`topExact`）。**記録に穴のある大会でも、上のほうは確か**なので
 *   どちらにも当たらなければ**例外を投げる**（「組めない大会は組まない」）。
 *
 * ★★ 夏の大会は、決勝の優勝校・準優勝校・点数を **Wikipedia の歴代代表校の表と突き合わせる**。食い違えば例外。
 *   （生成物の出典は連盟や個人運営のサイトで、決勝を取り違えた前例がある。出典が2つ揃って初めて「決勝」と書く）
 * ★ 学校名はシード表記を外して返す（検算でも同じ名前で比べる）。
 */
export function buildRegionalRun(def, school) {
  const { district: dist, tournament, heading, scope = "full", label, block } = def.run;
  const { all: rawAll, mine, source, bracket } = regionalRunGames({
    districtSlug: dist,
    tournament,
    schoolSlug: def.school,
    year: def.run.year ?? def.year,
    team: def.run.team,
  });
  if (!mine.length) throw new Error(`${def.slug}: 試合が見つかりません（${dist}・${tournament}）`);
  if (!bracket) throw new Error(`${def.slug}: 大会の木が組めません（${tournament}）`);
  if (scope === "full" && !bracket.complete) throw new Error(`${def.slug}: 大会が完全に組めていません（scope: "late" にするか、記事にしない）`);
  if (scope === "late" && !bracket.topExact) throw new Error(`${def.slug}: 準々決勝以降が揃っていません`);

  const depthOf = (g) => bracket.depth.get(g);
  const picked = scope === "late" ? mine.filter((g) => depthOf(g) !== undefined && depthOf(g) <= 2) : mine;
  const rows = picked
    .map((g) => {
      const lab = bracket.labelOf(g);
      if (!lab) throw new Error(`${def.slug}: 回戦名を付けられない試合があります（${g.date}）`);
      return { g, row: toRegionalRunGame(g, def.school, lab, def.run.team) };
    })
    .sort((a, b) => (a.g.date ?? "").localeCompare(b.g.date ?? ""));

  const selfTeam = mine[0].teams.find((t) => isSelfTeam(t, def.school, def.run.team));
  const champion = cleanTeamName(selfTeam.display) === bracket.champ;
  const computed = computedBadge(rows.map((r) => r.row), champion);

  // 夏は決勝を Wikipedia の表と突き合わせる
  const extraPairs = [];
  const sources = [{ label: source.name, ...(source.url ? { url: source.url } : {}), note: `${rows.length}試合の勝ち上がり` }];
  if (def.season === "summer" && ARTICLE_OF_DISTRICT[dist]) {
    const wp = finalRow(dist, def.year, block ?? null);
    if (!wp) throw new Error(`${def.slug}: Wikipedia の表に${def.year}年の行がありません`);
    const w = bracket.final.teams.find((t) => cleanTeamName(t.display) === bracket.champ);
    const l = bracket.final.teams.find((t) => cleanTeamName(t.display) !== bracket.champ);
    const [a, b] = wp.score.replace(/x/g, "").split(/[-－ー]/).map(Number);
    const same = normalizeName(wp.champion) === normalizeName(bracket.champ) && a === w.score && b === l.score;
    if (!same) {
      throw new Error(
        `${def.slug}: 決勝が Wikipedia の表と違います（生成物 ${bracket.champ} ${w.score}-${l.score} ${cleanTeamName(l.display)} ／ 表 ${wp.champion} ${wp.score} ${wp.runnerUp}）`,
      );
    }
    extraPairs.push({ a, b, names: [wp.champion, wp.runnerUp] });
    sources.push({
      label: `${ARTICLE_OF_DISTRICT[dist]} - Wikipedia`,
      url: wiki(ARTICLE_OF_DISTRICT[dist]),
      note: "決勝の突き合わせ（歴代代表校の一覧）",
    });
  }

  const all = rawAll.map((g) => ({ ...g, teams: g.teams.map((t) => ({ ...t, display: cleanTeamName(t.display) })) }));
  const run = {
    phenomenonSlug: def.slug,
    schoolSlug: def.school,
    schoolName: school.name,
    year: def.year,
    season: def.season,
    tournamentName: def.run.displayName ?? tournament,
    heading: heading ?? `${label ?? "地方大会"}での勝ち上がり${scope === "late" ? "（準々決勝以降）" : ""}`,
    result: def.badge,
    games: rows.map((r) => r.row),
    sources,
  };
  return { run, rows, all, champion, computed, extraPairs, bracket };
}

/** 公立のベスト4以上（優勝・準優勝・準決勝で負けた学校）を大会の時間順に並べる */
const SEASON_ORDER = { spring: 0, summer: 1 };
export const timeKey = (y, s) => y * 10 + SEASON_ORDER[s];
export function buildPublicSemis(resolve) {
  const out = [];
  const keys = [...new Set(koshienGames().map((g) => `${g.year}:${g.season}`))];
  for (const k of keys) {
    const [y, se] = k.split(":");
    const games = koshienGames().filter((g) => g.year === Number(y) && g.season === se);
    const fin = koshienFinal(Number(y), se);
    const teams = [];
    if (fin) teams.push({ t: fin.champion, kind: "優勝" }, { t: fin.runnerUp, kind: "準優勝" });
    for (const g of games.filter((x) => x.round === "準決勝")) {
      const l = g.teams.find((t) => !t.won);
      if (l && g.teams.some((t) => t.won)) teams.push({ t: l, kind: "ベスト4" });
    }
    for (const { t, kind } of teams) {
      const r = resolve(t.display, t.pref);
      if (r) out.push({ year: Number(y), season: se, kind, display: t.display, slug: r.slug, time: timeKey(Number(y), se) });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export { fetchSchools, loadAllSchools, makeResolve, finalInningsOf };

// ------------------------------------------------------------------
// 地方大会の「決勝の記録」（Wikipedia の歴代代表校の表）
// ------------------------------------------------------------------
import { ARTICLE_OF_DISTRICT, finalRow, parseFinals } from "./wikipedia-finals.mjs";

/**
 * `run: { kind: "table", district, school, also?: [...] }` の記事の事実。
 * 勝ち上がり（1試合ずつ）は持たず、**決勝に進んだ年・相手・点数**だけを表から取る。
 * 校名は表の書き方のまま完全一致（改称・統合した学校は別の校名で出るので数えない）。
 */
/*
  ★ 数え始めは 1975年（`run.since` で変えられる）。**それ以前の表は「その県の決勝」とは限らない。**
    千葉は茨城と、埼玉は山梨と、**ひとつの代表枠を争う東関東・北関東の大会**だった時期があり、
    表に載る決勝の相手が他県の学校（日立一・竜ヶ崎一・塩山商・甲府工 など）になっている。
    1974年は表の上では県大会に見えるが、記事の注記が「1973〜1974年は東関東代表」と書いているので避けた。
    表の冒頭には南関東・東関東などの見出しも混じる。**県の決勝として数えてよいのは 1975年から**。
*/
export const TABLE_SINCE = 1975;

export function buildTableFacts(def) {
  const { district, school, also = [], since = TABLE_SINCE } = def.run;
  if (!ARTICLE_OF_DISTRICT[district]) throw new Error(`${def.slug}: 地区が未対応です: ${district}`);
  const rows = parseFinals(ARTICLE_OF_DISTRICT[district]).filter((r) => r.year >= since);
  const names = [school, ...also];
  const mine = rows.filter((r) => names.includes(r.champion) || names.includes(r.runnerUp));
  if (!mine.length) throw new Error(`${def.slug}: 表に${names.join("・")}の決勝がありません`);
  const champ = rows.filter((r) => r.champion === school);
  const runner = rows.filter((r) => r.runnerUp === school);
  const pairs = mine.map((r) => {
    const [a, b] = r.score.replace(/x/g, "").split(/[-－ー]/).map(Number);
    return { a, b, names: [r.champion, r.runnerUp], year: r.year };
  });
  return { rows, mine, champ, runner, pairs, firstYear: since };
}

// ------------------------------------------------------------------
// 大会そのものを主題にした記事（学校ではなく、その大会で起きたこと）
// ------------------------------------------------------------------
/**
 * `run: { kind: "tournament" }` の記事の事実。その大会の全試合だけを持つ（勝ち上がりは持たない）。
 * 点数・延長・「公立のベスト4以上の年表」の検算は、学校の記事と同じ規則で効く。
 */
export function buildTournamentFacts(def) {
  const all = koshienGames().filter((g) => g.year === def.year && g.season === def.season);
  if (!all.length) throw new Error(`${def.slug}: ${def.year}年${def.season}の試合がありません`);
  return { run: { games: [] }, all, computed: null };
}
