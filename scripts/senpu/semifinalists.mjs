/**
 * 地方大会の生成物から、**準決勝まで進んだ公立校**を大会ごとに出す。読み取り専用。**文章は書かない。**
 *
 *   node scripts/senpu/semifinalists.mjs <地区slug> [<地区slug> ...] [--from=2018]
 *   例) node scripts/senpu/semifinalists.mjs kanagawa aichi
 *
 * ------------------------------------------------------------------
 * ★ なぜ要るか（2026-11-04。運営者の「神奈川、愛知については準決勝まで進んだ高校で再度やって」）
 *
 *   Wikipedia の歴代代表校の表は**決勝しか持たない**ので、決勝に進んだ公立校は少なく、
 *   激戦区の神奈川・愛知は記事が2本ずつしか作れなかった。**準決勝（ベスト4）は地方大会の生成物から取る。**
 *   ★生成物は**2018年以降だけ**（神奈川・愛知。HSB flash の底が2018年。README「HSB flash は2018年まである」）。
 *
 * ★ 見つけ方（`lib.mjs` の `tournamentBracket`）
 *   決勝 = 負けのない学校（優勝校）の最後の試合。準決勝 = 決勝の2校それぞれの直前の試合の相手。
 *   - complete    … 全試合が揃っている（試合数＝学校数−1、決勝から全試合に辿れる）
 *   - top         … 準々決勝以降だけ確か（記録に穴があるが、深さ0・1・2が1・2・4試合）
 *   - ×           … 組めない。**記事にしない**
 *   夏は決勝を Wikipedia の歴代代表校の表と突き合わせる（優勝校・点数）。
 * ★ 学校名はシード表記（「第3シード 横浜商業」）を外してから数える。外さないと同じ学校が2校に見える。
 */
import { cleanTeamName, district, jaDate, loadAllSchools, makeResolve, normalizeName, tournamentBracket } from "./lib.mjs";
import { finalRow } from "./wikipedia-finals.mjs";

const args = process.argv.slice(2);
const slugs = args.filter((a) => !a.startsWith("--"));
const from = Number(args.find((a) => a.startsWith("--from="))?.slice(7) ?? 2018);
if (!slugs.length) {
  console.error("使い方: node scripts/senpu/semifinalists.mjs <地区slug> ... [--from=2018]");
  process.exit(1);
}

const resolve = makeResolve(await loadAllSchools());
const PREF = { kanagawa: "神奈川", aichi: "愛知", "higashi-tokyo": "東東京", "nishi-tokyo": "西東京", osaka: "大阪", chiba: "千葉", saitama: "埼玉", hyogo: "兵庫", fukuoka: "福岡" };
const pubSlug = (slug, name) => resolve(name, PREF[slug] ?? district(slug).district)?.slug;

for (const slug of slugs) {
  const d = district(slug);
  const by = new Map();
  for (const g of d.games) {
    const key = `${(g.date ?? "").slice(0, 4)}|${g.season}|${g.tournament ?? "(名前なし)"}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(g);
  }
  console.log(`\n### ${slug}（${d.district}）出典:${d.sourceName}`);
  const keys = [...by.keys()].filter((k) => Number(k.split("|")[0]) >= from && by.get(k).length >= 40).sort().reverse();
  for (const key of keys) {
    const [year, season, name] = key.split("|");
    const all = by.get(key);
    const b = tournamentBracket(all);
    const status = !b ? "×" : b.complete ? (b.structureOk ? "complete(構造OK)" : "complete") : b.topExact ? `top(無敗${b.unbeaten.length})` : "×";
    const head = `${year} ${season.padEnd(6)} ${status.padEnd(18)} ${name.slice(0, 34)}`;
    if (!b || (!b.complete && !b.topExact)) {
      console.log(`× ${head}`);
      continue;
    }
    const slugOf = new Map();
    // slug はデータのものを先に、無ければ（シード表記で付かなかったもの）校名から学校マスタを引く
    for (const g of all) for (const t of g.teams) { const n = cleanTeamName(t.display); if (!slugOf.get(n)) { const s = t.slug ?? pubSlug(slug, n); if (s) slugOf.set(n, s); } }
    const finalists = b.final.teams.map((t) => cleanTeamName(t.display));
    const semis = finalists.map((n) => {
      const list = b.played.get(n);
      const prev = list[list.indexOf(b.final) - 1];
      const me = prev.teams.find((t) => cleanTeamName(t.display) === n);
      const opp = prev.teams.find((t) => cleanTeamName(t.display) !== n);
      return { n, prev, opp: cleanTeamName(opp.display), me, oppT: opp };
    });
    const four = [...finalists, ...semis.map((s) => s.opp)];
    const w = b.final.teams.find((t) => cleanTeamName(t.display) === b.champ);
    const l = b.final.teams.find((t) => cleanTeamName(t.display) !== b.champ);
    let wp = "";
    if (season === "summer" && !/独自|令和2年度|2020年/.test(name)) {
      let row = null;
      try { row = finalRow(slug, Number(year), null); } catch { row = null; }
      if (row) {
        const rows = [row];
        const ok = normalizeName(row.champion) === normalizeName(b.champ);
        wp = ` WP:${ok ? "一致" : "★不一致"}(${row.champion} ${row.score} ${row.runnerUp})`;
        void rows;
      } else wp = " WP:行なし";
    }
    const pubs = four.filter((n) => slugOf.get(n));
    console.log(`○ ${head} 校${b.nTeams} | 優勝 ${b.champ} ${b.final.date} ${w.score}-${l.score} ${cleanTeamName(l.display)}${wp}`);
    for (const n of pubs) {
      const kind = n === b.champ ? "優勝" : finalists.includes(n) ? "準優勝" : "ベスト4";
      const list = b.played.get(n);
      const lines = list.map((g) => {
        const me = g.teams.find((t) => cleanTeamName(t.display) === n);
        const op = g.teams.find((t) => t !== me);
        const lab = b.labelOf(g) ?? "?";
        return `${jaDate(g.date)} ${lab} ${me.won ? "○" : "●"}${me.score}-${op.score} ${cleanTeamName(op.display)}${slugOf.get(cleanTeamName(op.display)) || op.slug || pubSlug(slug, cleanTeamName(op.display)) ? "〔公〕" : ""}`;
      });
      console.log(`    ${n}（${slugOf.get(n)}）${kind}: ${lines.join(" | ")}`);
    }
  }
}
