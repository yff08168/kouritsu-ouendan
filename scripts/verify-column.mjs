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
 *      回ごとの得点・試合時間・観衆・投手の人数・主な得点場面・**完投の記録（投手1人・投球回・球数）**。
 *      ★本文に書いた「N球」「N回、N球」は、ここで検算した完投の値以外を書けない（`checkProse`）。
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

  // 投手成績（投手欄と同じチームの並び）。見出し「回 球数 打者 安 振 球 責」のあとに、
  // 投手ごとの9行（名前・(学年 中学)・回・球数・打者・安・振・球・責）が続き、最後に「計」と7つの数。
  // ★投球回は「3 1/3」のように1行で書かれる。**人数は行の数から数える**（投手欄の「、」の数とは別の出所）
  const pitching = [];
  for (let n = 1; n < lines.length; n++) {
    if (lines[n] !== "球数" || lines[n - 1] !== "回") continue;
    let p = n + 6; // 見出しの残り（打者 安 振 球 責）を飛ばす
    let people = 0;
    while (p < lines.length && lines[p] !== "計" && people < 30) {
      p += 9;
      people++;
    }
    if (lines[p] === "計") {
      // 投手の名前は各行の先頭（公式の表記＝姓だけ）
      const rows = Array.from({ length: people }, (_, k) => ({
        name: lines[n + 6 + 9 * k],
        innings: lines[n + 6 + 9 * k + 2],
        pitches: Number(lines[n + 6 + 9 * k + 3]),
      }));
      pitching.push({ people, names: rows.map((r) => r.name), rows, innings: lines[p + 1], pitches: Number(lines[p + 2]) });
    }
  }

  // 得点経過（「[9裏]仙台・有本のソロでサヨナラ」）。ページに同じ内容が2か所あるので重複を除く
  const scoring = [
    ...new Set(lines.filter((l) => /^\[\d+[表裏]\]/.test(l))),
  ].map((l) => {
    const m = l.match(/^\[(\d+)(表|裏)\](.*)$/);
    return { inning: Number(m[1]), half: m[2], text: m[3] };
  });

  return {
    rows: [row(abbr1, t1), row(abbr2, t2)],
    no: meta ? Number(meta[1]) : null,
    startedAt: meta?.[2] ?? null,
    endedAt: meta?.[3] ?? null,
    attendance: meta ? Number(meta[4].replace(/,/g, "")) : null,
    pitchers,
    pitching,
    scoring,
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

  // ---- 完投（1人が全イニングを投げた）の記録。本文の「N球」はこの値と突き合わせる（下の checkProse）
  const cg = s.completeGame;
  if (cg) {
    const i = off.pitchers.findIndex((x) => same(x.team, cg.team));
    const blk = off.pitching[i];
    if (i < 0) fail(`完投 ${cg.team}: 公式の投手欄に見つからない`);
    else if (!blk) fail(`完投 ${cg.team}: 公式の投手成績が読めない`);
    else if (blk.people !== off.pitchers[i].count) {
      // 投手成績の並びが投手欄と合っているかの番人（合わなければ、別のチームの球数を比べてしまう）
      fail(`完投 ${cg.team}: 投手成績の並びが投手欄と合わない（成績 ${blk.people}人 ／ 投手欄 ${off.pitchers[i].count}人）`);
    } else {
      if (blk.people !== 1) fail(`完投 ${cg.team}: 公式の投手は${blk.people}人（完投ではない）`);
      else if (blk.names[0] !== cg.pitcher) {
        fail(`完投 ${cg.team}: 投手の名前が公式と違う（公式 ${blk.names[0]} ／ 書いた ${cg.pitcher}）`);
      }
      if (Number(blk.innings) !== cg.innings) {
        fail(`完投 ${cg.team}: 投球回が公式と違う（公式 ${blk.innings}回 ／ 書いた ${cg.innings}回）`);
      }
      if (blk.pitches !== cg.pitches) {
        fail(`完投 ${cg.team}: 球数が公式と違う（公式 ${blk.pitches}球 ／ 書いた ${cg.pitches}球）`);
      }
      // 完投なら、投球回は相手が攻撃した回数（裏の攻撃なし「x」の回は数えない）と同じ
      const oppRow = s.lineScore.find((r) => !same(r.team, cg.team));
      const faced = oppRow ? oppRow.innings.filter((t) => !/^x$/i.test(t)).length : NaN;
      if (faced !== cg.innings) fail(`完投 ${cg.team}: 投球回 ${cg.innings}回が、相手が攻撃した回数 ${faced}回と違う`);
    }
    const mine = s.pitchers.find((p) => same(p.team, cg.team));
    if (!mine || mine.count !== 1) fail(`完投 ${cg.team}: pitchers の人数が1人になっていない`);
  }

  // ---- 先発投手の投球回（「先発が8回まで投げた」「先発が初回のうちに交代した」の裏づけ。公式の投手成績の先頭の行）
  for (const st of s.starters ?? []) {
    const i = off.pitchers.findIndex((x) => same(x.team, st.team));
    const blk = off.pitching[i];
    if (i < 0 || !blk) fail(`先発 ${st.team}: 公式の投手成績が読めない`);
    else if (blk.people !== off.pitchers[i].count) {
      fail(`先発 ${st.team}: 投手成績の並びが投手欄と合わない（成績 ${blk.people}人 ／ 投手欄 ${off.pitchers[i].count}人）`);
    } else if (blk.rows[0].innings !== st.innings) {
      fail(`先発 ${st.team}: 投球回が公式と違う（公式 ${blk.rows[0].innings} ／ 書いた ${st.innings}）`);
    }
  }

  // ---- 本文で名前を出した選手: 公式の「得点経過」のその回・その表裏の行に、名前とキーワードがあること
  for (const n of s.named ?? []) {
    const hit = off.scoring.filter((x) => x.inning === n.inning && x.half === n.half);
    if (hit.length === 0) {
      fail(`${n.name}: 公式の得点経過に ${n.inning}回${n.half} の行が無い`);
      continue;
    }
    if (!hit.some((x) => x.text.includes(n.name))) {
      fail(`${n.name}: 公式の ${n.inning}回${n.half} の行に名前が無い（公式 ${hit.map((x) => x.text).join(" ／ ")}）`);
      continue;
    }
    const line = hit.find((x) => x.text.includes(n.name));
    for (const w of n.words) {
      if (!line.text.includes(w)) fail(`${n.name}: 公式の ${n.inning}回${n.half} の行に「${w}」が無い（公式 ${line.text}）`);
    }
  }

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

/**
 * 本文（題・説明・リード・節）に書いた「N球」「N回、N球」を、`summary.completeGame` と突き合わせる。
 * ★**本文の中の数字は手で書くので必ず誤る**ため、球数は検算した値（公式の投手成績）以外を書けないようにする。
 *   （点数は `games` から描くので本文に書かない。球数だけは文の中に書きたいので、ここで見張る）
 */
function checkProse(c) {
  const known = c.games.flatMap((g) => (g.summary?.completeGame ? [g.summary.completeGame] : []));
  const texts = [
    c.title,
    c.searchTitle,
    c.description,
    ...c.lead,
    ...c.sections.flatMap((s) => [s.heading ?? "", s.body]),
  ];
  const before = bad;
  for (const t of texts) {
    for (const m of t.matchAll(/(\d+)球/g)) {
      if (!known.some((k) => k.pitches === Number(m[1]))) {
        fail(`本文の「${m[0]}」は、検算した完投の球数（${known.map((k) => k.pitches).join("・") || "なし"}）にない`);
      }
    }
    for (const m of t.matchAll(/(\d+)回[、，,]\s*(\d+)球/g)) {
      if (!known.some((k) => k.innings === Number(m[1]) && k.pitches === Number(m[2]))) {
        fail(`本文の「${m[0]}」は、検算した完投の回数・球数の組にない`);
      }
    }
  }
  if (bad === before && known.length) console.log(`  ✅ 本文の球数が検算した値と一致（${known.map((k) => `${k.innings}回${k.pitches}球`).join("・")}）`);

  // ---- 本文の「◯◯選手」「◯◯投手」は、裏づけを書いた名前（named / completeGame.pitcher）だけ
  const allowed = new Set(
    c.games.flatMap((g) => [
      ...(g.summary?.named ?? []).map((n) => n.name),
      ...(g.summary?.completeGame ? [g.summary.completeGame.pitcher] : []),
    ]),
  );
  // 投手のうち、名前でない語（「先発投手」など）
  const NOT_NAMES = new Set(["先発", "継投", "救援", "中継ぎ", "左", "右", "両", "エース"]);
  const beforeNames = bad;
  const seen = new Set();
  for (const t of texts) {
    // ★「ヶ」「ケ」は名前に入る（鐘ヶ江）。「選手権」は名前ではない
    for (const m of t.matchAll(/([一-龥々ヶケ]{1,4})(?:選手(?!権)|投手)/g)) {
      const name = m[1];
      if (NOT_NAMES.has(name)) continue;
      seen.add(name);
      if (!allowed.has(name)) fail(`本文に出した「${m[0]}」は、公式記録で裏づけた名前（${[...allowed].join("・") || "なし"}）にない`);
    }
  }
  if (bad === beforeNames && seen.size) console.log(`  ✅ 本文の選手名は公式記録で裏づけた名前だけ（${[...seen].join("・")}）`);
}

for (const c of targets) {
  console.log(`\n== ${c.slug}${c.published ? "" : "（下書き）"}`);
  checkProse(c);
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
