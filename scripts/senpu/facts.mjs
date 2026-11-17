/**
 * 記事の下書きに使う「事実の一覧」を出す。**文章は書かない。**
 *
 *   node --env-file=.env.local scripts/senpu/facts.mjs data/senpu/<ファイル>.mjs [slug ...]
 *
 * 記事の定義（`data/senpu/*.mjs`）の `run` を見て、サイトが持っている生成物から
 * 勝ち上がり・大会の結果・相手の素性を取り出す。**人はこれを見て文章を書く。**
 * 書いた文章の数字は `verify-senpu.mjs` が検算する。
 *
 * ★ 相手が公立かどうかを出したいときは、学校マスタの控えを指す:
 *     SENPU_SCHOOLS_CACHE=C:/…/schools-cache.json
 *   （無ければ取りに行って、その場所に書く。3,500行・約2MB）
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  establishmentWord,
  fetchSchools,
  koshienAppearances,
  koshienFinal,
  koshienGames,
  koshienRunGames,
  loadAllSchools,
  makeResolve,
  normalizeName,
  officialShort,
  prefectureKey,
  regionalRunGames,
  resultOf,
  roundDepth,
  toRegionalRunGame,
  toRunGame,
  winsOf,
  SEASON_JA,
} from "./lib.mjs";
import { finalRow, ARTICLE_OF_DISTRICT } from "./wikipedia-finals.mjs";

const [, , file, ...only] = process.argv;
if (!file) {
  console.error("使い方: node --env-file=.env.local scripts/senpu/facts.mjs data/senpu/<ファイル>.mjs [slug ...]");
  process.exit(1);
}

const defs = (await import(pathToFileURL(path.resolve(file)).href)).default.filter(
  (d) => only.length === 0 || only.includes(d.slug),
);

const schools = await fetchSchools(defs.map((d) => d.school));
let resolve = null;
if (process.env.SENPU_SCHOOLS_CACHE) resolve = makeResolve(await loadAllSchools());

// 優勝・準優勝の履歴（相手の素性を言うため）
const finalsByKey = new Map();
for (const t of new Set(koshienGames().map((g) => `${g.year}:${g.season}`))) {
  const [y, s] = t.split(":");
  const f = koshienFinal(Number(y), s);
  if (!f) continue;
  for (const [kind, team] of [["優勝", f.champion], ["準優勝", f.runnerUp]]) {
    const key = `${normalizeName(team.display)}|${team.pref ? prefectureKey(team.pref) : ""}`;
    if (!finalsByKey.has(key)) finalsByKey.set(key, []);
    finalsByKey.get(key).push({ year: Number(y), season: s, kind });
  }
}

function koshienTags(opp, year, season) {
  const key = `${normalizeName(opp.display)}|${opp.pref ? prefectureKey(opp.pref) : ""}`;
  const hist = finalsByKey.get(key) ?? [];
  const tags = [];
  for (const h of hist) {
    if (h.year === year && h.season === season) tags.push(`この大会の${h.kind}`);
    else if (h.kind === "優勝" && h.year === year - 1 && h.season === season) tags.push(`前年${SEASON_JA[season]}の優勝校`);
    else if (h.kind === "優勝" && h.year === year && season === "summer" && h.season === "spring") tags.push("この年の春の優勝校");
    else if (h.kind === "優勝" && (h.year < year || (h.year === year && h.season === "spring" && season === "summer")))
      tags.push(`甲子園優勝経験(${h.year}${SEASON_JA[h.season]})`);
  }
  return [...new Set(tags)];
}

/*
  公立のベスト4以上（優勝・準優勝・準決勝で負けた学校）を、甲子園の大会の時間順に並べる。
  「公立校のベスト4は◯年以来」を書くための年表。
  ★**サイトの `/koshien/public/<年>` と同じ判定（学校マスタに完全一致で当たるか）**。
*/
const SEASON_ORDER = { spring: 0, summer: 1 };
const timeKey = (y, s) => y * 10 + SEASON_ORDER[s];
const publicSemis = [];
if (resolve) {
  const keys = [...new Set(koshienGames().map((g) => `${g.year}:${g.season}`))];
  for (const k of keys) {
    const [y, se] = k.split(":");
    const games = koshienGames().filter((g) => g.year === Number(y) && g.season === se);
    const fin = koshienFinal(Number(y), se);
    const teams = [];
    if (fin) {
      teams.push({ t: fin.champion, kind: "優勝" }, { t: fin.runnerUp, kind: "準優勝" });
    }
    for (const g of games.filter((x) => x.round === "準決勝")) {
      const l = g.teams.find((t) => !t.won);
      if (l && g.teams.some((t) => t.won)) teams.push({ t: l, kind: "ベスト4" });
    }
    for (const { t, kind } of teams) {
      const r = resolve(t.display, t.pref);
      if (r) publicSemis.push({ year: Number(y), season: se, kind, display: t.display, slug: r.slug, time: timeKey(Number(y), se) });
    }
  }
  publicSemis.sort((a, b) => a.time - b.time);
}
function publicBest4Around(year, season, selfSlug) {
  const now = timeKey(year, season);
  const before = publicSemis.filter((e) => e.time < now);
  const after = publicSemis.filter((e) => e.time > now);
  const prevTime = before.length ? Math.max(...before.map((e) => e.time)) : null;
  const nextTime = after.length ? Math.min(...after.map((e) => e.time)) : null;
  const sameTime = publicSemis.filter((e) => e.time === now).map((e) => `${e.display}(${e.kind})`);
  const prevSelf = [...before].reverse().find((e) => e.slug === selfSlug);
  const fmtAt = (time) => {
    if (time === null) return "なし";
    const es = publicSemis.filter((e) => e.time === time);
    return `${es[0].year}${SEASON_JA[es[0].season]} ` + es.map((e) => `${e.display}(${e.kind})`).join("・");
  };
  const fmt = (e) => (e ? `${e.year}${SEASON_JA[e.season]} ${e.display}(${e.kind})` : "なし");
  return `公立ベスト4以上: この大会=${sameTime.join("・") || "-"} / 直前=${fmtAt(prevTime)} / 次=${fmtAt(nextTime)} / この学校の前回=${fmt(prevSelf)}`;
}

function publicCount(year, season) {
  if (!resolve) return null;
  const seen = new Set();
  for (const g of koshienGames().filter((x) => x.year === year && x.season === season)) {
    for (const t of g.teams) if (resolve(t.display, t.pref)) seen.add(`${t.display}|${t.pref ?? ""}`);
  }
  return seen.size;
}

const pubFlag = (display, pref) => {
  if (!resolve) return "";
  const r = resolve(display, pref);
  return r ? "〔公〕" : "";
};

for (const def of defs) {
  const sc = schools.get(def.school);
  console.log("=".repeat(78));
  console.log(
    `■ ${def.slug}  ${officialShort(sc.official_name)}（${establishmentWord(sc.official_name) ?? "?"}／${sc.prefecture?.name}・${sc.city ?? "?"}）` +
      `  甲子園 春${sc.koshien_spring_count}・夏${sc.koshien_summer_count}（直近 ${sc.last_koshien_year ?? "-"}）`,
  );

  if (def.run?.kind === "koshien") {
    const { year, season } = def;
    const { display, pref } = def.run;
    const { mine, all } = koshienRunGames({ year, season, display, pref });
    const ap = koshienAppearances().find((t) => t.year === year && t.season === season);
    const aps = ap?.schools.find(
      (s) =>
        normalizeName(s.short) === normalizeName(display) &&
        (!pref || (s.prefs ?? []).some((p) => prefectureKey(p) === prefectureKey(pref))),
    );
    console.log(`  ${all[0]?.tournament}（${SEASON_JA[season]}${year}）出場${ap?.schoolCount ?? "?"}校・収録${all.length}試合`);
    console.log(
      `  出場の記録: ${aps ? `${aps.appearanceText}／${aps.wins}勝${aps.losses}敗／${aps.result}` : "（記事の表に当たらず）"}`,
    );
    {
      // この学校の出場歴（大会記事の表から）。「初のベスト4」「◯年ぶり」を言うための材料
      const hist = [];
      for (const t of koshienAppearances()) {
        const sc2 = t.schools.find(
          (x) =>
            [display, ...(def.run.alt ?? [])].map(normalizeName).includes(normalizeName(x.short)) &&
            (!pref || (x.prefs ?? []).some((q) => prefectureKey(q) === prefectureKey(pref))),
        );
        if (sc2) hist.push({ t, sc2 });
      }
      hist.sort((a, b) => a.t.year * 10 + (a.t.season === "summer" ? 1 : 0) - (b.t.year * 10 + (b.t.season === "summer" ? 1 : 0)));
      console.log(
        "  出場歴(大会記事の表): " +
          hist.map(({ t, sc2 }) => `${t.year}${SEASON_JA[t.season]}:${sc2.result}`).join(" "),
      );
    }
    if (resolve) console.log(`  この大会の公立校: ${publicCount(year, season)}校 / ${publicBest4Around(year, season, def.school)}`);
    const fin = koshienFinal(year, season);
    if (fin) {
      console.log(
        `  決勝: ${fin.champion.display}(${fin.champion.pref ?? "?"}) ${fin.champion.score}-${fin.runnerUp.score} ${fin.runnerUp.display}(${fin.runnerUp.pref ?? "?"})`,
      );
    }
    const isSelf = (t) => normalizeName(t.display) === normalizeName(display) && (!pref || !t.pref || prefectureKey(t.pref) === prefectureKey(pref));
    const rows = mine
      .map((g) => ({ g, row: toRunGame(g, isSelf) }))
      // ★勝ち抜き戦なので回戦の深さが先。**日付の無い試合が先頭に来る**（2001年夏の松山商で実際になった）
      .sort((a, b) => roundDepth(a.g.round) - roundDepth(b.g.round) || (a.g.date ?? "").localeCompare(b.g.date ?? ""));
    const champ = fin && isSelf(fin.champion);
    for (const { g, row } of rows) {
      const other = g.teams.find((t) => !isSelf(t));
      const mark = row.outcome === "win" ? "○" : row.outcome === "loss" ? "●" : "△";
      const tags = koshienTags(other, year, season);
      console.log(
        `   ${row.round.padEnd(5, "　")} ${(row.date ?? "").padEnd(6)} ${mark} ${row.scoreFor}${row.walkOff ? "x" : ""}-${row.scoreAgainst} ` +
          `${other.display}(${other.pref ?? "?"})${pubFlag(other.display, other.pref)}` +
          `${row.note ? `  [${row.note}]` : ""}${tags.length ? `  ←${tags.join("・")}` : ""}`,
      );
    }
    const runGames = rows.map((r) => r.row);
    const wins = winsOf(runGames);
    const f = rows.map((r) => r.row);
    console.log(
      `  → ${resultOf(runGames, champ)}・${wins}勝` +
        ` / 合計 ${f.reduce((s, r) => s + r.scoreFor, 0)}得点 ${f.reduce((s, r) => s + r.scoreAgainst, 0)}失点` +
        ` / サヨナラ勝ち${f.filter((r) => r.walkOff).length}` +
        ` / 延長${f.filter((r) => /延長/.test(r.note ?? "")).length}試合` +
        ` / 完封勝ち${f.filter((r) => r.outcome === "win" && r.scoreAgainst === 0).length}` +
        ` / 1点差勝ち${f.filter((r) => r.outcome === "win" && r.scoreFor - r.scoreAgainst === 1).length}`,
    );
    const beaten = rows.filter((r) => r.row.outcome === "win").map((r) => r.g.teams.find((t) => !isSelf(t)).pref).filter(Boolean);
    console.log(`  破った相手の代表地区: ${[...new Set(beaten)].join("・") || "-"}`);
  } else if (def.run?.kind === "regional") {
    const { district: dist, tournament, block } = def.run;
    const { all, mine, source } = regionalRunGames({ districtSlug: dist, tournament, schoolSlug: def.school });
    const teams = new Set(all.flatMap((g) => g.teams.map((t) => t.display)));
    const dates = all.map((g) => g.date).filter(Boolean).sort();
    console.log(`  ${tournament}（${SEASON_JA[def.season]}${def.year}）収録${all.length}試合・${teams.size}校・${dates[0]}〜${dates.at(-1)}  出典:${source.name}`);
    const fin = all.find((g) => g.round === "決勝");
    if (fin) {
      const w = fin.teams.find((t) => t.won);
      const l = fin.teams.find((t) => !t.won);
      console.log(`  決勝(生成物): ${w?.display} ${w?.score}-${l?.score} ${l?.display}`);
    }
    if (def.season === "summer" && ARTICLE_OF_DISTRICT[dist]) {
      const wp = finalRow(dist, def.year, block ?? null);
      console.log(
        wp
          ? `  決勝(Wikipedia): ${wp.champion} ${wp.score} ${wp.runnerUp}／参加${wp.entrants ?? "?"}校／${wp.championNote ?? ""}／全国:${wp.koshien}`
          : "  決勝(Wikipedia): 表に行が無い",
      );
      const prev = finalRow(dist, def.year - 1, block ?? null);
      if (prev) console.log(`  前年(${def.year - 1})の決勝: ${prev.champion} ${prev.score} ${prev.runnerUp}`);
    }
    const rows = mine
      .map((g) => ({ g, row: toRegionalRunGame(g, def.school) }))
      .sort((a, b) => (a.g.date ?? "").localeCompare(b.g.date ?? "") || roundDepth(a.g.round) - roundDepth(b.g.round));
    for (const { g, row } of rows) {
      const other = g.teams.find((t) => t.slug !== def.school);
      const mark = row.outcome === "win" ? "○" : row.outcome === "loss" ? "●" : "△";
      console.log(
        `   ${row.round.padEnd(5, "　")} ${(row.date ?? "").padEnd(6)} ${mark} ${row.scoreFor}-${row.scoreAgainst} ` +
          `${other.display}${other.slug ? "〔公〕" : ""}${row.note ? `  [${row.note}]` : ""}`,
      );
    }
    const f = rows.map((r) => r.row);
    console.log(
      `  → ${resultOf(f, false)}・${winsOf(f)}勝 / 合計 ${f.reduce((s, r) => s + r.scoreFor, 0)}得点 ${f.reduce((s, r) => s + r.scoreAgainst, 0)}失点` +
        ` / 1点差勝ち${f.filter((r) => r.outcome === "win" && r.scoreFor - r.scoreAgainst === 1).length}` +
        ` / 完封勝ち${f.filter((r) => r.outcome === "win" && r.scoreAgainst === 0).length}`,
    );
  } else {
    console.log("  （勝ち上がりなし。文章だけの記事）");
  }
}
