/**
 * 甲子園（春の選抜・夏の選手権）の**試合単位の結果**を作る。
 *
 * ------------------------------------------------------------------
 * ★★ 出典は `data/wikipedia-cache/{spring,summer}-NNN.json` の `wikitext`
 *
 *   ★**要約（WebFetch）に通さないこと。** AGENTS の決まり。
 *   Wikipediaの大会記事を要約させると**対戦相手も勝敗も入れ替わって出てくる**
 *   （大社2024が1勝3敗、金足農の3回戦の相手が横浜でなく東海大熊本星翔、
 *   佐賀北が1回戦敗退、という出力が実際に出た）。**wikitext を直接読む。**
 *
 * ------------------------------------------------------------------
 * ★ 紙（wikitext）の形は3つある
 *
 *   1. `{{Round8 seed}}` / `{{Round16 no third}}` … 1回戦〜準決勝
 *      `|8月11日（3）|'''高川学園'''|'''8'''|未来富山|5`
 *      ★**太字（`'''`）が勝者。** スコアの大小から導かない
 *      （**不戦勝はスコアが無い**ので、大小では決まらない）。
 *   2. `wikitable` … 準々決勝・準決勝（夏）
 *      `|rowspan="4"|8月19日||第1試合||山梨学院||11 - 4||京都国際||…`
 *      ★**この表は「勝利」「敗戦」の列**なので、左が必ず勝者。
 *   3. `{{Linescore}}` … 決勝
 *      `|Road=沖縄尚学 |Home=日大三 |RR=3 |HR=1`
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**その大会を1試合も出さない**）
 *
 *   - **試合数が `koshien-tournaments.ts` の `gameCount` と一致**
 *     （あちらは大会記事の別の場所から作った生成物なので、**別の出どころ**）
 *   - **出場校数が `schoolCount` と一致**
 *   - ★**勝ち上がりが繋がる** —— 2回戦以降に出てくる学校は、
 *     **前の回戦の勝者**でなければならない
 *
 * ★**サヨナラは `x` 付き**（`'''6x'''`）。`Number("6x")` は NaN になるので外してから読む。
 * ★**不戦勝は試合として出さない**（勝者だけ next round へ進む）。
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "data", "wikipedia-cache");
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-games.ts");

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
/** 何年ぶんを出すか。省略すると全部 */
const fromYear = Number(flag("--from") ?? 0);

/**
 * 校名をそろえる。
 *
 * ★★**カタカナの「ニ」が漢数字として使われている**（2026-08-23）。
 * 第97回選抜の2回戦は `ニ松学舎大付`（カタカナ）で、1回戦は `二松学舎大付`（漢字）。
 * **そのままだと同じ学校が別チームになり、勝ち上がりの検算が落ちる。**
 * ★福岡の `七 月 ニ 十 五 日` と同じ罠。
 */
const cleanName = (s) =>
  s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/\{\{Efn\|[^}]*\}\}/gi, "")
    .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/ニ/g, "二")
    .replace(/\s+/g, "")
    .trim();

/** `'''6x'''` → `{ score: 6, walkOff: true }`。読めなければ null */
const parseScore = (raw) => {
  const t = String(raw ?? "").replace(/'''/g, "").replace(/\s+/g, "").trim();
  const m = t.match(/^(\d{1,2})(x|X|ｘ)?$/);
  if (!m) return null;
  return { score: Number(m[1]), walkOff: Boolean(m[2]) };
};

/** 日付ラベル `8月11日（3）：延長10回 TB` → `{ date: "8-11", note }` */
const parseLabel = (raw) => {
  const t = String(raw ?? "").replace(/\{\{Efn\|[^}]*\}\}/gi, "").trim();
  const d = t.match(/(\d{1,2})月(\d{1,2})日/);
  const note = t.match(/[：:]\s*(.+)$/)?.[1]?.trim() ?? null;
  return { md: d ? [Number(d[1]), Number(d[2])] : null, note };
};

/**
 * `{{Round8 seed}}` / `{{Round16 no third}}` を読む。
 *
 * ★**`RDn=` で回戦名が切り替わる。** `RD1=-` のように名前が無い段もある
 * （その大会に1回戦が無いブロック）。**そこは試合が空行なので自然に落ちる。**
 */
function readBracketTemplates(text) {
  const games = [];
  // {{Round…}} の中身を取る。入れ子は無い
  for (const m of text.matchAll(/\{\{Round[^|}]*\|([\s\S]*?)\n\}\}/g)) {
    let round = null;
    for (const line of m[1].split("\n")) {
      const rd = line.match(/^\s*\|\s*RD\d+\s*=\s*(.*)$/);
      if (rd) {
        round = rd[1].trim() === "-" ? null : rd[1].trim();
        continue;
      }
      // |日付|チームA|点A|チームB|点B
      const cells = line.split("|").slice(1);
      if (cells.length < 5) continue;
      const [label, a, sa, b, sb] = cells;
      const nameA = cleanName(a);
      const nameB = cleanName(b);
      if (!nameA || !nameB) continue;
      /*
        ★**不戦勝は試合として出さない。**
        `|'''津田学園'''（不戦勝）||広陵|` の形で、スコアが空になる。
        **勝者は次の回戦に出てくる**ので、勝ち上がりの検算はそのまま通る。
      */
      if (/不戦勝|棄権/.test(a + b)) continue;
      const scoreA = parseScore(sa);
      const scoreB = parseScore(sb);
      if (!scoreA || !scoreB) continue;
      const { md, note } = parseLabel(label);
      games.push({
        round,
        md,
        note,
        teams: [
          // ★太字が勝者。スコアの大小から導かない
          { display: nameA, score: scoreA.score, won: a.includes("'''"), walkOff: scoreA.walkOff },
          { display: nameB, score: scoreB.score, won: b.includes("'''"), walkOff: scoreB.walkOff },
        ],
      });
    }
  }
  return games;
}

/**
 * 準々決勝・準決勝の `wikitable` を読む。
 * ★**「勝利」「敗戦」の列**なので、左が必ず勝者。
 */
function readResultTables(text) {
  const games = [];
  for (const sec of text.matchAll(/===\s*(準々決勝|準決勝|3位決定戦)\s*===\s*([\s\S]*?)\n\|\}/g)) {
    const round = sec[1];
    let date = null;
    for (const line of sec[2].split("\n")) {
      if (!line.startsWith("|")) continue;
      // rowspan の行に日付が入っている。以降の行はその日付を引き継ぐ
      const d = line.match(/(\d{1,2})月(\d{1,2})日/);
      if (d) date = [Number(d[1]), Number(d[2])];
      const cells = line.replace(/^\|-?/, "").split("||").map((c) => c.trim());
      const at = cells.findIndex((c) => /^\d{1,2}x?\s*[-−–]\s*\d{1,2}x?$/.test(c.replace(/\s/g, "")));
      if (at < 1) continue;
      const sc = cells[at].replace(/\s/g, "").split(/[-−–]/);
      const win = parseScore(sc[0]);
      const lose = parseScore(sc[1]);
      const winner = cleanName(cells[at - 1]);
      const loser = cleanName(cells[at + 1] ?? "");
      if (!win || !lose || !winner || !loser) continue;
      games.push({
        round,
        md: date,
        note: cleanName(cells[at + 2] ?? "") || null,
        teams: [
          { display: winner, score: win.score, won: true, walkOff: win.walkOff },
          { display: loser, score: lose.score, won: false, walkOff: lose.walkOff },
        ],
      });
    }
  }
  return games;
}

/** 決勝の `{{Linescore}}` を読む */
function readFinal(text) {
  const m = text.match(/\{\{Linescore([\s\S]*?)\n\}\}/);
  if (!m) return null;
  const get = (k) => m[1].match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n]*)`))?.[1]?.trim() ?? null;
  const road = cleanName(get("Road") ?? "");
  const home = cleanName(get("Home") ?? "");
  const rr = parseScore(get("RR"));
  const hr = parseScore(get("HR"));
  if (!road || !home || !rr || !hr) return null;
  const d = (get("Date") ?? "").match(/(\d{1,2})月(\d{1,2})日/);
  return {
    round: "決勝",
    md: d ? [Number(d[1]), Number(d[2])] : null,
    note: null,
    teams: [
      { display: road, score: rr.score, won: rr.score > hr.score, walkOff: rr.walkOff },
      { display: home, score: hr.score, won: hr.score > rr.score, walkOff: hr.walkOff },
    ],
  };
}

/** 回戦の深さ。浅い順 */
const ROUND_ORDER = ["1回戦", "2回戦", "3回戦", "準々決勝", "準決勝", "決勝"];

/** 1大会を読む。**検算に落ちたら null**（その大会は1試合も出さない） */
function readTournament(entry, summary) {
  const t = entry.wikitext ?? "";
  const games = [...readBracketTemplates(t), ...readResultTables(t)];
  const final = readFinal(t);
  if (final) games.push(final);
  if (!games.length) return null;

  const label = `${entry.title}`;

  /*
    ★★**`koshien-tournaments.ts` を「落とす検算」に使わないこと**（2026-08-23）。

    あちらは大会記事の別の場所から作った生成物だが、**数字が信用できない。**
    ★**199大会のうち43件で「出場校数 − 1 ≠ 試合数」**になっている。
    2025年春（第97回）は `30校・31試合` で、**そもそも算数が合わない**
    （32校なら31試合。**出場校数のほうが誤り**とみられる）。
    2026年夏（第108回）は `49校・22試合`（記事が書きかけ）。

    ★**ずれは警告として出すだけにして、落とす判断は下の「内部で導ける不変条件」でやる。**
    そちらは**紙の外の数字に頼らない**ので、参照データの誤りに巻き込まれない。
  */
  const teams = new Set(games.flatMap((g) => g.teams.map((x) => x.display)));
  if (summary && (games.length !== summary.gameCount || teams.size !== summary.schoolCount)) {
    console.log(
      `  （${label}: 読んだ ${teams.size}校/${games.length}試合 と ` +
        `koshien-tournaments.ts の ${summary.schoolCount}校/${summary.gameCount}試合 が違う。**参照側を疑うこと**）`,
    );
  }

  /*
    ---- ★★検算1: 勝ち抜き戦の不変条件（負けは1回だけ） ----

    **勝ち抜き戦では、優勝校以外のすべての学校がちょうど1回だけ負ける。**
    ★**紙の外の数字を一切使わない**ので、参照データが誤っていても効く。
    ★**対戦相手の取り違え・試合の重複・読み落としが、ここでほぼ全部落ちる。**

    ★**不戦勝で敗退した学校は0敗**（試合をせずに消える）。その学校だけ許す。
  */
  const forfeited = new Set(
    [...t.matchAll(/\|\s*'''[^']+'''（不戦勝）\s*\|\|\s*([^|\n]+)\s*\|/g)].map((m) => cleanName(m[1])),
  );
  const losses = new Map([...teams].map((x) => [x, 0]));
  for (const g of games) {
    for (const x of g.teams) if (!x.won) losses.set(x.display, (losses.get(x.display) ?? 0) + 1);
  }
  const unbeaten = [...losses].filter(([, n]) => n === 0).map(([x]) => x);
  const manyLosses = [...losses].filter(([, n]) => n > 1);
  /*
    ★**負けなしは「優勝校1つ」だけのはず。**
    ★**不戦勝で敗退した学校も0敗**になるので、そのぶんを見込む。
    ★**引き分け再試合があると両校が0敗の試合になる**が、再試合で決着するので数は変わらない。
  */
  const extraUnbeaten = unbeaten.filter((x) => !forfeited.has(x));
  if (extraUnbeaten.length !== 1) {
    console.log(
      `  ⚠️ ${label}: 負けていない学校が ${extraUnbeaten.length} 校いる（優勝校の1校だけのはず）` +
        `: ${extraUnbeaten.join("・")}。1試合も出さない`,
    );
    return null;
  }
  if (manyLosses.length) {
    console.log(
      `  ⚠️ ${label}: 2回以上負けている学校がいる` +
        `: ${manyLosses.map(([x, n]) => `${x}(${n})`).join("・")}。1試合も出さない`,
    );
    return null;
  }

  /*
    ---- ★★検算2: 勝ち上がりが繋がる ----
    **2回戦以降に出てくる学校は、前の回戦の勝者でなければならない。**
    ★**これが「対戦相手が入れ替わる」を捕まえる。**
    ★**不戦勝で上がった学校は前の回戦の勝者に居ない**ので、その名前だけ許す。
  */
  const byRound = new Map();
  for (const g of games) {
    const k = g.round ?? "";
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(g);
  }
  const rounds = ROUND_ORDER.filter((r) => byRound.has(r));
  const walkoverWinners = new Set(
    [...t.matchAll(/'''([^']+)'''（不戦勝）/g)].map((m) => cleanName(m[1])),
  );
  for (let i = 1; i < rounds.length; i++) {
    const prevWinners = new Set(
      byRound.get(rounds[i - 1]).flatMap((g) => g.teams.filter((x) => x.won).map((x) => x.display)),
    );
    /*
      ★**シードは「前の回戦に出ていない」ので、そこは咎めない。**
      **前の回戦に名前があるのに勝っていない**学校が次に出てきたら誤り。
    */
    const prevAll = new Set(
      byRound.get(rounds[i - 1]).flatMap((g) => g.teams.map((x) => x.display)),
    );
    for (const g of byRound.get(rounds[i])) {
      for (const x of g.teams) {
        if (prevWinners.has(x.display) || walkoverWinners.has(x.display)) continue;
        if (!prevAll.has(x.display)) continue; // シード
        console.log(
          `  ⚠️ ${label}: ${rounds[i]} に出ている ${x.display} が ${rounds[i - 1]} の勝者ではない。1試合も出さない`,
        );
        return null;
      }
    }
  }

  const year = entry.year;
  return games.map((g) => ({
    year,
    season: entry.season,
    no: entry.no,
    tournament: entry.title,
    round: g.round,
    date: g.md ? `${year}-${String(g.md[0]).padStart(2, "0")}-${String(g.md[1]).padStart(2, "0")}` : null,
    note: g.note,
    teams: g.teams.map((x) => ({
      display: x.display,
      score: x.score,
      won: x.won,
      ...(x.walkOff ? { walkOff: true } : {}),
    })),
  }));
}

async function main() {
  // 大会ごとの出場校数・試合数（別の生成物。検算に使う）
  const summarySrc = readFileSync(path.join(ROOT, "src", "lib", "data", "koshien-tournaments.ts"), "utf8");
  const summary = new Map();
  for (const m of summarySrc.matchAll(
    /year:\s*(\d+),\s*season:\s*"(spring|summer)",\s*no:\s*(\d+),\s*schoolCount:\s*(\d+),\s*gameCount:\s*(\d+)/g,
  )) {
    summary.set(`${m[2]}-${m[3]}`, {
      year: Number(m[1]),
      schoolCount: Number(m[4]),
      gameCount: Number(m[5]),
    });
  }

  const files = readdirSync(CACHE).filter((f) => /^(spring|summer)-\d+\.json$/.test(f));
  const out = [];
  let ok = 0;
  let ng = 0;
  for (const f of files.sort()) {
    const entry = JSON.parse(readFileSync(path.join(CACHE, f), "utf8"));
    const key = `${entry.season}-${entry.no}`;
    const sum = summary.get(key);
    if (!sum) continue;
    if (fromYear && sum.year < fromYear) continue;
    const games = readTournament({ ...entry, year: sum.year }, sum);
    if (!games) {
      ng++;
      continue;
    }
    ok++;
    console.log(`  （${entry.title}: ${games.length} 試合 / ${new Set(games.flatMap((g) => g.teams.map((x) => x.display))).size} 校）`);
    out.push(...games);
  }

  console.log(`\n読めた大会 ${ok} / 読めなかった大会 ${ng} ／ 試合 ${out.length} 件`);
  if (!out.length) {
    console.log("⚠️ 1試合も読めなかった。書き換えない");
    return;
  }

  const file =
    `// このファイルは scripts/build-koshien-games.mjs が生成する。直接編集しない。\n` +
    `// 甲子園（春の選抜・夏の選手権）の試合単位の結果。\n` +
    `// 出典: ja.wikipedia.org の大会別記事（CC BY-SA 4.0）の wikitext。事実データのみ。\n\n` +
    `import type { KoshienGame } from "@/lib/koshien-games";\n\n` +
    `export const KOSHIEN_GAMES: readonly KoshienGame[] = ${JSON.stringify(out, null, 2)};\n`;
  writeFileSync(OUT, file, "utf8");
  console.log(`書き出した: ${path.relative(ROOT, OUT)}（${Math.round(file.length / 1024)}KB）`);
}

await main();
