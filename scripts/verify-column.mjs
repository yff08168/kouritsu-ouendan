/**
 * コラムに書いた「観戦した試合」（`src/lib/content/columns.ts` の `games`）を、
 * 大会の公式データと突き合わせる。**1試合でも食い違えば終了コード1で止まる。**
 *
 *   node scripts/verify-column.mjs            # 全コラム（下書き含む）
 *   node scripts/verify-column.mjs <slug>     # 1本だけ
 *
 * ★**手で書いた数字は必ず誤る**（公立旋風の `verify-senpu.mjs` と同じ理由）。公開前・書き換えのたびに回すこと。
 *
 * 突き合わせる相手（神宮 `kind: "jingu"`）:
 *   ① 試合の結果（日付・回戦・両校・点数）
 *      開催中の年は **主催者の日程表**（`getJinguLive`。ネットワークを使う。読むだけ）、
 *      大会が終わって生成物に入った年は `src/lib/data/jingu-games.json`。
 *   ② **試合の概要カード（`summary`）** … **主催者の試合詳細ページ**（日程表の「詳細」リンク）。
 *      回ごとの得点・試合時間・観衆・投手の人数・主な得点場面。
 *   ★どちらも取れなければ「照合できなかった」と書いて終了コード2（黙って通さない）。
 *
 * ★**確かめるのは 日付・回戦・両校・両校の得点。** 向き（どちらが1校目か）は問わず、校名ごとに点数を比べる。
 * ★**回ごとの得点は公式記録の表の並び（上が先攻）で書く。** 一覧ページ・詳細ページの見出しの並びとは
 *   同じとは限らない（第2試合は一覧が「創志学園 北海」、見出しが「北海 創志学園」、表は先攻の創志学園が上）。
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

const BASE = "https://www.student-baseball.or.jp";
const UA = "Mozilla/5.0 (compatible; kouritsu-ouendan-verify)";

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 1500));
  const charset = head.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  return new TextDecoder(charset).decode(buf);
}

// ---------------------------------------------------------------------
// ① 試合の結果

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

// ---------------------------------------------------------------------
// ② 試合の概要（主催者の試合詳細ページ）

/** 日程表の「詳細」リンクから、その日の第N試合の詳細ページを探す */
const scheduleCache = new Map();
async function officialUrl(year, date, order) {
  if (!scheduleCache.has(year)) {
    scheduleCache.set(
      year,
      await getText(`${BASE}/system/prog/schedule.php?m=pc&k=all&e=jingu&s=${year}`),
    );
  }
  const html = scheduleCache.get(year);
  if (!html) return null;
  for (const m of html.matchAll(/href="(\.\.\/prog\/game\.php\?[^"]*)"/g)) {
    const q = new URLSearchParams(m[1].replace(/&amp;/g, "&").split("?")[1]);
    if (q.get("gd") === date && Number(q.get("gnd")) === order) {
      return `${BASE}/system/prog/${m[1].replace(/&amp;/g, "&").replace(/^\.\.\/prog\//, "")}`;
    }
  }
  return null;
}

const TOKEN = /^(\d+x?|x)$/i;

/** 試合詳細ページ → { rows[{abbr,innings,total}], startedAt, endedAt, attendance, no, pitchers[{team,count}] } */
function parseOfficial(html) {
  const lines = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // 回ごとの得点の表。見出し（一 二 … 計）の上が先攻、下が後攻
  const i1 = lines.indexOf("一");
  const k = lines.indexOf("計", i1);
  if (i1 < 0 || k < 0) return null;
  let j = i1 - 1;
  const t1 = [];
  while (j >= 0 && TOKEN.test(lines[j])) t1.unshift(lines[j--]);
  const abbr1 = lines[j];
  let m = k + 2;
  const t2 = [];
  while (m < lines.length && TOKEN.test(lines[m])) t2.push(lines[m++]);
  const abbr2 = lines[k + 1];
  const row = (abbr, tok) => ({ abbr, innings: tok.slice(0, -1), total: Number(tok.at(-1)) });

  const meta = lines
    .join(" ")
    .match(/第(\d+)試合\s*試合開始\s*(\d+:\d+)\s*終了\s*(\d+:\d+)\s*観衆([\d,]+)人/);

  // 投手欄: 「左のチーム」「右のチーム」「左の投手（、区切り）」「投　手」「右の投手」の並び
  const ip = lines.findIndex((l) => /^投\s*手$/.test(l));
  const count = (s) => String(s ?? "").split("、").filter(Boolean).length;
  const pitchers =
    ip >= 3
      ? [
          { team: lines[ip - 3], count: count(lines[ip - 1]) },
          { team: lines[ip - 2], count: count(lines[ip + 1]) },
        ]
      : [];

  return {
    rows: [row(abbr1, t1), row(abbr2, t2)],
    no: meta ? Number(meta[1]) : null,
    startedAt: meta?.[2] ?? null,
    endedAt: meta?.[3] ?? null,
    attendance: meta ? Number(meta[4].replace(/,/g, "")) : null,
    pitchers,
  };
}

const runsOf = (token) => (token === undefined ? NaN : Number(String(token).replace(/x/i, "") || 0));

let bad = 0;
let unchecked = 0;
const fail = (msg) => {
  console.log(`    ❌ ${msg}`);
  bad++;
};

async function verifySummary(g) {
  const s = g.summary;
  if (!s) return;
  const url = await officialUrl(g.source.year, g.date, g.order);
  const html = url ? await getText(url) : null;
  const off = html ? parseOfficial(html) : null;
  if (!off) {
    console.log(`    ⚠️ 概要を照合できなかった（主催者の試合詳細ページが取れない）`);
    unchecked++;
    return;
  }
  const before = bad;

  // ---- 書いた値の中の辻褄（公式に頼らない）
  for (const r of s.lineScore) {
    const sum = r.innings.reduce((n, t) => n + runsOf(t), 0);
    if (sum !== r.total) fail(`${r.team}: 回ごとの合計 ${sum} と計 ${r.total} が合わない`);
    const t = g.teams.find((x) => same(x.name, r.team));
    if (!t) fail(`${r.team}: games の teams に無い校名`);
    else if (t.score !== r.total) fail(`${r.team}: 計 ${r.total} が games の点数 ${t.score} と違う`);
  }

  // ---- 公式記録との突き合わせ
  s.lineScore.forEach((r, i) => {
    const o = off.rows[i];
    if (r.innings.join(",") !== o.innings.join(",")) {
      fail(`${r.team}: 回ごとの得点が公式と違う（公式 ${o.innings.join(" ")} ／ 書いた ${r.innings.join(" ")}）`);
    }
    if (r.total !== o.total) fail(`${r.team}: 計が公式と違う（公式 ${o.total} ／ 書いた ${r.total}）`);
  });
  if (s.lineScore.length !== 2) fail("lineScore は先攻・後攻の2行");
  if (off.no !== g.order) fail(`第N試合が公式と違う（公式 第${off.no}試合 ／ 書いた 第${g.order}試合）`);
  if (off.startedAt !== s.startedAt) fail(`開始時刻が公式と違う（公式 ${off.startedAt} ／ 書いた ${s.startedAt}）`);
  if (off.endedAt !== s.endedAt) fail(`終了時刻が公式と違う（公式 ${off.endedAt} ／ 書いた ${s.endedAt}）`);
  if (off.attendance !== s.attendance) fail(`観衆が公式と違う（公式 ${off.attendance} ／ 書いた ${s.attendance}）`);
  for (const p of s.pitchers) {
    const o = off.pitchers.find((x) => same(x.team, p.team));
    if (!o) fail(`${p.team}: 公式の投手欄に見つからない`);
    else if (o.count !== p.count) fail(`${p.team}: 投手の人数が公式と違う（公式 ${o.count}人 ／ 書いた ${p.count}人）`);
  }
  if (s.pitchers.length !== off.pitchers.length) fail("pitchers は両チームぶん");

  // ---- 主な得点場面: 先攻＝表／後攻＝裏の行で、その回に点が入っていること
  for (const p of s.plays) {
    const row = s.lineScore[p.half === "表" ? 0 : 1];
    if (!row || !same(row.team, p.team)) {
      fail(`${p.inning}回${p.half}: ${p.team} は${p.half}の攻撃のチームではない`);
      continue;
    }
    const got = runsOf(off.rows[p.half === "表" ? 0 : 1].innings[p.inning - 1]);
    if (!(got > 0)) fail(`${p.inning}回${p.half}: 公式では点が入っていない`);
    else if (p.runs > got) fail(`${p.inning}回${p.half}: 書いた ${p.runs}点が公式の ${got}点より多い`);
  }

  if (bad === before) console.log(`    ✅ 概要が公式記録と一致（${url.replace(/^.*\?/, "").slice(0, 60)}…）`);
}

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
    } else {
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
      } else {
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
    await verifySummary(g);
  }
}

console.log(bad ? `\n食い違い ${bad} 件。直してから公開すること` : "\n食い違いなし");
if (bad) process.exit(1);
if (unchecked) {
  console.log(`照合できなかったものが ${unchecked} 件あります`);
  process.exit(2);
}
