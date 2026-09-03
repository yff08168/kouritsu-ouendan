/**
 * 地方大会の「夏の優勝校」を、甲子園の代表校と突き合わせる。
 *
 *   node scripts/verify-regional-summer.mjs
 *
 * ★★**出典がまったく別**なのがこの検算の値打ち。
 *   地方大会は各県の連盟や HSB flash から、甲子園（`src/lib/data/koshien-games.json`）は
 *   ja.wikipedia の大会記事から作っている。
 *   **選手権の県大会で優勝した学校は、その年の甲子園にその県の代表として出ている。**
 *
 * ★**食い違いが出ても、まず「略し方の違い」を疑うこと**（`専修大松戸`/`専大松戸`、
 *   `智辯学園`/`智弁学園`、`西短大附`/`西日本短大付`）。2026-09-02 時点の27件はすべてこれと、
 *   **佐賀のNHK杯（6月の大会も夏に入っている）を選手権の決勝として拾っていた1件。**
 *
 * ★**2020年は甲子園が中止**なので、その年は突き合わせられない（`甲子園側に無い年`に数える）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGIONAL = path.join(ROOT, "src/lib/data/regional");
const koshien = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/data/koshien-games.json"), "utf8"));

/** 「県\t年」→ その年の甲子園に出た校名 */
const reps = new Map();
for (const g of koshien) {
  if (g.season !== "summer") continue;
  for (const t of g.teams) {
    if (!t.pref) continue;
    const k = `${t.pref}\t${g.year}`;
    if (!reps.has(k)) reps.set(k, new Set());
    reps.get(k).add(t.display);
  }
}

/** 比べるときだけ使う寄せ方。**画面に出す校名は寄せない** */
const bare = (v) => (v ?? "").replace(/[・･、,\s]/g, "").replace(/高等学校$|高校$/, "");

let ok = 0;
const miss = [];
const skipped = [];
for (const f of fs.readdirSync(REGIONAL).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(fs.readFileSync(path.join(REGIONAL, f), "utf8"));
  for (const g of d.games) {
    if (g.season !== "summer" || g.round !== "決勝") continue;
    const m = (g.tournament ?? "").match(/第(\d+)回/);
    const year = g.date?.slice(0, 4) ?? (m ? String(Number(m[1]) + 1918) : null);
    const won = g.teams.find((t) => t.won);
    if (!year || !won) continue;
    const set = reps.get(`${d.district}\t${year}`);
    if (!set) {
      skipped.push(`${d.district} ${year}`);
      continue;
    }
    const w = bare(won.display);
    const hit = [...set].some((n) => {
      const b = bare(n);
      return b.includes(w) || w.includes(b);
    });
    if (hit) ok += 1;
    else miss.push(`${d.district} ${year}: 地方の優勝 ${won.display} / 甲子園の代表 ${[...set].join("・")}`);
  }
}
console.log(`一致 ${ok} 件 / 食い違い ${miss.length} 件 / 甲子園側にその年が無い ${skipped.length} 件`);
for (const m of miss) console.log("  ⚠️", m);
