/**
 * 甲子園の大会記事の校名のうち、**学校マスタの校名では引けないのに、マスタに出場歴（school_championships）が
 * 引き継がれている公立校**を、年・季節・県で対にして出す。読み取り専用。**文章は書かない。**
 *
 *   node --env-file=.env.local scripts/senpu/find-successors.mjs [開始年=1985]
 *
 * ------------------------------------------------------------------
 * ★ なぜ要るか（2026-11-04）
 *
 *   `getSchoolNameIndex`（`src/lib/queries/schools.ts`）は**校名の完全一致だけ**で学校を引く。
 *   ところが公立校は**統廃合・改称**で校名が変わり、学校マスタには承継先しかいない。
 *   **DB の出場歴（`school_championships`）は承継先に引き継いである**（旧校名は `note` に
 *   「香川県立観音寺中央高等学校として出場」と残る。AGENTS.md「統廃合・校名変更で現存しない学校の出場歴は
 *   現存校に引き継ぎ、note に旧校名を残す」）が、**校名索引はそれを見ていない**ので、
 *   大会ページの「公立」の判定・`/koshien/public/champions` などから漏れる。
 *
 * ★ 見つけ方
 *   年・季節・県ごとに「大会記事のチーム」と「DB の出場歴の行」を並べ、
 *   **校名で引けたものを外した残りが、チーム1つ・行1つのときだけ対にする。**
 *   マスタは公立だけなので、対になれば公立。推測の幅が狭いぶん、取りこぼしは多い。
 *   ★**対になっただけでは確定しない**（私立のチームを公立の行に当ててしまう恐れがゼロではない）。
 *     閉校・改称の事実は Wikipedia の学校の記事（`scripts/fetch-wikipedia-pages.mjs`）で確かめること。
 *   ★**同じ校名が別の年にも同じ学校に対になれば、確からしさが上がる**（広島商＝9回）。
 *
 * ★ 出力の見方
 *   「校名(県) → 承継先のslug : 年季節 …」。`★` は ベスト4以上に進んだ年を含むもの。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { koshienFinal, koshienGames, loadAllSchools, makeResolve, prefectureKey } from "./lib.mjs";

const FROM = Number(process.argv[2] ?? 1985);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("環境変数がありません。`node --env-file=.env.local` で実行してください");

// 出場歴は約3,000行（約300KB）。一時フォルダに24時間控える
const cacheFile = path.join(os.tmpdir(), "kouritsu-championships-cache.json");
let champ;
if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < 24 * 3600 * 1000) {
  champ = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
} else {
  champ = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${url}/rest/v1/school_championships?select=year,season,result,note,school:schools(slug,name,prefecture:prefectures(name))` +
        `&order=year.asc,season.asc,id.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } },
    );
    if (!r.ok) throw new Error(`school_championships ${r.status}`);
    const page = await r.json();
    champ.push(...page);
    if (page.length < 1000) break;
  }
  fs.writeFileSync(cacheFile, JSON.stringify(champ));
}

// サイト本体と同じ引き方（校名の完全一致）。この道具が補っている DEFUNCT_PUBLIC は「引けない」ものとして扱う
const resolve = makeResolve(await loadAllSchools());
const byName = (d, p) => {
  const r = resolve(d, p);
  return r && !String(r.slug).startsWith("defunct:") ? r : null;
};

const gk = (y, s, p) => `${y}:${s}:${prefectureKey(p ?? "")}`;
const groups = new Map();
const deep = new Set(); // ベスト4以上に進んだ「年:季節:校名」
for (const g of koshienGames()) {
  if (g.year < FROM) continue;
  for (const t of g.teams) {
    if (!t.pref) continue;
    const k = gk(g.year, g.season, t.pref);
    if (!groups.has(k)) groups.set(k, { teams: new Map(), rows: [] });
    groups.get(k).teams.set(t.display, t);
  }
}
for (const [y, s] of new Set(koshienGames().filter((g) => g.year >= FROM).map((g) => `${g.year}:${g.season}`).values().map((v) => v.split(":")))) {
  const games = koshienGames().filter((g) => g.year === Number(y) && g.season === s);
  const fin = koshienFinal(Number(y), s);
  if (fin) {
    deep.add(`${y}:${s}:${fin.champion.display}`);
    deep.add(`${y}:${s}:${fin.runnerUp.display}`);
  }
  for (const g of games.filter((x) => x.round === "準決勝")) {
    const l = g.teams.find((t) => !t.won);
    if (l) deep.add(`${y}:${s}:${l.display}`);
  }
}
for (const c of champ) {
  const p = Array.isArray(c.school?.prefecture) ? c.school.prefecture[0]?.name : c.school?.prefecture?.name;
  const k = gk(c.year, c.season, p);
  if (groups.has(k)) groups.get(k).rows.push(c);
}

const by = new Map();
for (const [k, g] of groups) {
  const unresolved = [...g.teams.values()].filter((t) => !byName(t.display, t.pref));
  const matched = new Set([...g.teams.values()].map((t) => byName(t.display, t.pref)?.slug).filter(Boolean));
  const free = g.rows.filter((r) => !matched.has(r.school.slug));
  if (unresolved.length !== 1 || free.length !== 1) continue;
  const [y, s] = k.split(":");
  const team = unresolved[0];
  const id = `${team.display}(${team.pref}) → ${free[0].school.slug}`;
  if (!by.has(id)) by.set(id, []);
  by.get(id).push(`${y}${s === "spring" ? "春" : "夏"}${deep.has(`${y}:${s}:${team.display}`) ? "★" : ""}`);
}
console.log(`出場歴の行 ${champ.length} ／ ${FROM}年以降で対になった校 ${by.size}`);
for (const [id, v] of [...by.entries()].sort()) console.log(`${id} : ${v.join(" ")}`);
