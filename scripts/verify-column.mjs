/**
 * コラムに書いた「観戦した試合」（`src/lib/content/columns.ts` の `games`）を、
 * 大会の公式データと突き合わせる。**1試合でも食い違えば終了コード1で止まる。**
 *
 *   node scripts/verify-column.mjs            # 全コラム（下書き含む）
 *   node scripts/verify-column.mjs <slug>     # 1本だけ
 *
 * ★**手で書いた点数は必ず誤る**（公立旋風の `verify-senpu.mjs` と同じ理由）。公開前・書き換えのたびに回すこと。
 *
 * 突き合わせる相手（神宮 `kind: "jingu"`）:
 *   ① 開催中の年は **主催者の日程表**（`getJinguLive`。ネットワークを使う。読むだけ）
 *   ② 大会が終わって生成物に入った年は `src/lib/data/jingu-games.json`
 *   ★①が取れなければ②。**どちらも無ければ「照合できなかった」と書いて終了コード2**（黙って通さない）。
 *
 * ★**確かめるのは 日付・回戦・両校・両校の得点。** 向き（どちらが1校目か）は問わず、校名ごとに点数を比べる。
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = createRequire(path.join(ROOT, "package.json"))("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(ROOT, "src") } });

const { COLUMNS } = await jiti.import(path.join(ROOT, "src/lib/content/columns.ts"));
const live = await jiti.import(path.join(ROOT, "src/lib/jingu-live.ts"));

const only = process.argv[2] ?? null;
const targets = COLUMNS.filter((c) => !only || c.slug === only);
if (targets.length === 0) {
  console.log(only ? `コラム「${only}」が見つかりません` : "コラムがありません");
  process.exit(2);
}

/** 「仙台育英高」「仙台育英高校」→「仙台育英」。「二松学舎大高」の大高は残す */
const norm = (s) => String(s ?? "").replace(/\s/g, "").replace(/(?<!大)高校?$/, "");
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};

/** 年 → 比べる相手の試合 [{date, round, teams:[{name,score}]}] と出所 */
const cache = new Map();
async function gamesOfJingu(year) {
  if (cache.has(year)) return cache.get(year);
  let result = null;
  try {
    const l = await live.getJinguLive(year);
    if (l && l.games.length) {
      result = {
        from: "主催者の日程表（開催中）",
        games: l.games
          .filter((g) => g.scores && g.teams[0] && g.teams[1])
          .map((g) => ({
            date: `${year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
            round: g.round,
            teams: [
              { name: g.teams[0], score: g.scores[0] },
              { name: g.teams[1], score: g.scores[1] },
            ],
          })),
      };
    }
  } catch {
    // 取れなければ生成物へ
  }
  if (!result) {
    const rows = JSON.parse(readFileSync(path.join(ROOT, "src/lib/data/jingu-games.json"), "utf8")).filter(
      (g) => g.year === year,
    );
    if (rows.length) {
      result = {
        from: "生成物（jingu-games.json）",
        games: rows.map((g) => ({
          date: g.date,
          round: g.round,
          teams: g.teams.map((t) => ({ name: t.display, score: t.score })),
        })),
      };
    }
  }
  cache.set(year, result);
  return result;
}

let bad = 0;
let unchecked = 0;
for (const c of targets) {
  console.log(`\n== ${c.slug}${c.published ? "" : "（下書き）"}`);
  if (c.games.length === 0) console.log("  観戦した試合の記載なし");
  for (const g of c.games) {
    const label = `${g.date} ${g.round} ${g.teams[0].name} ${g.teams[0].score}-${g.teams[1].score} ${g.teams[1].name}`;
    if (g.source.kind !== "jingu") {
      console.log(`  ⚠️ 照合できない種類: ${g.source.kind}  ${label}`);
      unchecked++;
      continue;
    }
    const data = await gamesOfJingu(g.source.year);
    if (!data) {
      console.log(`  ⚠️ 照合できなかった（${g.source.year}年のデータが無い）  ${label}`);
      unchecked++;
      continue;
    }
    // 同じ日・同じ回戦・同じ2校の試合を探す
    const hit = data.games.find(
      (d) =>
        d.date === g.date &&
        d.round === g.round &&
        g.teams.every((t) => d.teams.some((u) => same(u.name, t.name))),
    );
    if (!hit) {
      console.log(`  ❌ 該当する試合が見つからない（${data.from}）  ${label}`);
      bad++;
      continue;
    }
    const wrong = g.teams.filter((t) => {
      const u = hit.teams.find((x) => same(x.name, t.name));
      return !u || u.score !== t.score;
    });
    if (wrong.length) {
      console.log(
        `  ❌ 点数が違う（${data.from}: ${hit.teams.map((t) => `${t.name} ${t.score}`).join(" - ")}）  ${label}`,
      );
      bad++;
    } else {
      console.log(`  ✅ 一致（${data.from}）  ${label}`);
    }
  }
}

console.log(bad ? `\n食い違い ${bad} 件。直してから公開すること` : "\n食い違いなし");
if (bad) process.exit(1);
if (unchecked) {
  console.log(`照合できなかったものが ${unchecked} 件あります`);
  process.exit(2);
}
