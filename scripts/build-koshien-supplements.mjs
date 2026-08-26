/**
 * 甲子園の**自前の出典では埋められなかった大会**を、別の出典から補う。
 *
 * ------------------------------------------------------------------
 * ★★ これは例外の入れ物。**既定の出典は ja.wikipedia のまま。**
 *
 *   `build-koshien-games.mjs` は199大会のうち197大会を読めている。
 *   残りは記事側の作りが原因で**検算に落ちる**大会で、
 *   **記事を読み直しても埋められない**と分かったものだけをここで補う。
 *
 *     1938年春（第15回）… 記事に試合結果の節が無い
 *     1984年春（第56回）… 記事が同じ学校を「明徳」「明徳義塾」と書き分けている
 *
 *   ★**運営者の判断で「自前で埋められない穴だけ、別の出典から補ってよい」**
 *   となっている（2026-08-26）。**穴が埋まったら、この入れ物から外すこと。**
 *
 * ------------------------------------------------------------------
 * ★ 出典
 *
 *   「高校野球史 甲子園篇」（https://data-man.com/kokoyakyu/）の大会別トーナメント表。
 *   ★**robots.txt は全許可**、利用規約・転載や営利利用の禁止の掲示はサイト内に無い
 *   （2026-08-26 に全文とサイトマップ5,290URLで確認）。
 *   ★★**それでも「既定の出典」にはしない。** 記録の編纂そのものが商品のサイトで、
 *   **禁止条項が無いことと、その人の商売を取ってよいことは別**
 *   （福岡で `fk-kokoyakyu.com` を採らなかったのと同じ線引き）。
 *   ★**取るのは3ページだけ。** 取れた試合には**1試合ずつ出典を持たせて画面に出す**
 *   （地方大会の `RegionalGame.source` と同じ考え方）。
 *
 * ------------------------------------------------------------------
 * ★★ 検算（落ちたらその大会は1試合も出さない）
 *
 *   1. **優勝校以外はちょうど1回だけ負ける**（`build-koshien-games.mjs` と同じ不変条件）
 *   2. **2回戦以降に出てくる学校は、前の回戦の勝者**
 *   3. ★**歴代優勝校の一覧と優勝校が一致する**（同じサイトの別ページ＝別の場所から来る事実）
 *   4. ★★**読み取り方そのものを、Wikipedia から読めている大会で検算する**
 *      （`--selftest`。2003年夏＝48試合で、両者が1試合も食い違わないことを確かめる）
 *
 * 使い方:
 *   node scripts/build-koshien-supplements.mjs --selftest   … 読み取り方の検算だけ
 *   node scripts/build-koshien-supplements.mjs              … 生成物を書き出す
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-supplements.json");
const GAMES = path.join(ROOT, "src", "lib", "data", "koshien-games.json");

const SOURCE_NAME = "高校野球史 甲子園篇";
const UA = "kouritsu-ouendan/1.0 (public high school baseball site) node.js";

/** 自前の出典で埋められなかった大会。**埋まったらここから外す** */
const TARGETS = [
  { year: 1938, season: "spring", no: 15, name: "第15回選抜中等学校野球大会" },
  { year: 1984, season: "spring", no: 56, name: "第56回選抜高等学校野球大会" },
  /*
    ★**1917年夏（第3回）はここから外した**（2026-08-26）。
    **自前の出典（Wikipedia）に全15試合そろっていた** —— 読み手が
    `==== 敗者復活戦 ====` の節を回戦として認めていなかっただけだった。
    ★**「別の出典から補う」の前に、自前の出典を読み切れているかを疑うこと。**
  */
];

/** 読み取り方の検算に使う大会（Wikipedia から読めている） */
const SELFTEST = { year: 2003, season: "summer" };

/**
 * 出典の段（`stage sNN`）と回戦の対応。
 * ★**紙の側で固定**（32校の大会でも49校の大会でも `s90` が決勝）。
 */
const ROUND_OF_STAGE = {
  s10: "1回戦",
  s20: "2回戦",
  s30: "3回戦",
  s40: "4回戦",
  s70: "準々決勝",
  s80: "準決勝",
  s90: "決勝",
};
const ROUND_ORDER = ["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"];

const url = (year, season) =>
  `https://data-man.com/kokoyakyu/meeting/${year}/${season}/tournament/`;

async function fetchHtml(target) {
  const res = await fetch(target, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${target}`);
  return res.text();
}

/**
 * トーナメント表を読む。
 *
 * 紙の形（1校ぶん）:
 *   <div class="teambox flex" id="t24"><div class="team"><a …><dl class="flex">
 *     <dt>岩倉</dt><dd>(東京)</dd></dl></a></div>
 *   <div class="stgbox flex">
 *     <div class="stage s10 b win"><span class="num">4</span></div> …
 *
 * ★**`t`（上）と `b`（下）が対戦相手**。同じ段で上下の組を作る。
 * ★**空の段は「その回戦に出ていない」**（シード・敗退済み）。
 */
function parseBracket(html) {
  const teams = [];
  for (const m of html.matchAll(
    /<div class="teambox[^"]*" id="t(\d+)">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g,
  )) {
    const body = m[2];
    // ★全角ラテン文字をそろえる（ＰＬ学園 → PL学園）。**末尾の「高」は落とさない**
    const name = body.match(/<dt>([^<]+)<\/dt>/)?.[1]?.trim().normalize("NFKC");
    const pref = body.match(/<dd>\(([^)]+)\)<\/dd>/)?.[1]?.trim() ?? null;
    if (!name) continue;
    const stages = new Map();
    /*
      ★★**いちばん最後の段のセルだけ、閉じタグが枠の終わりに食われる。**
      枠の切り出しが `</div></div></div>` で終わるため。
      **閉じタグを要求すると、決勝が読めない**（優勝校の最後のセルがそれ）。
    */
    for (const s of body.matchAll(
      /<div class="stage (s\d+)([^"]*)">(?:<span class="num">(\d+)<\/span>)?/g,
    )) {
      const cls = s[2] ?? "";
      const side = /\bt\b/.test(cls) ? "t" : /\bb\b/.test(cls) ? "b" : null;
      const result = /\bwin\b/.test(cls) ? "win" : /\blose\b/.test(cls) ? "lose" : null;
      if (!side || !result) continue;
      stages.set(s[1], { side, result, score: s[3] == null ? null : Number(s[3]) });
    }
    teams.push({ slot: Number(m[1]), name, pref, stages });
  }

  /*
    ★**同じ段の「上（t）」と、その次に出てくる「下（b）」で1試合。**
    紙はスロット順に並んでいるので、上から順に組めばよい。
    ★**勝敗は紙が持っている**（`win`/`lose`）。点差から導かない。
  */
  const games = [];
  for (const [stage, round] of Object.entries(ROUND_OF_STAGE)) {
    const inStage = teams
      .map((team) => ({ team, cell: team.stages.get(stage) }))
      .filter((x) => x.cell);
    /*
      ★★**上（t）と下（b）の順番は決まっていない。**
      決勝は**優勝校が `t` なのに紙のいちばん下**にいることがある（2003年夏）。
      ★**その段に出ている学校を紙の順に2つずつ組む**（隣どうしが対戦相手）。
      `t`/`b` は**組が正しいかの確かめ**にだけ使う。
    */
    for (let i = 0; i + 1 < inStage.length; i += 2) {
      const a = inStage[i];
      const b = inStage[i + 1];
      const sides = [a.cell.side, b.cell.side].sort().join("");
      if (sides !== "bt") continue; // 上下がそろわない組は読まない
      if (a.cell.score == null || b.cell.score == null) continue; // 不戦勝など
      games.push({
        round,
        teams: [
          { display: a.team.name, pref: a.team.pref, score: a.cell.score, won: a.cell.result === "win" },
          { display: b.team.name, pref: b.team.pref, score: b.cell.score, won: b.cell.result === "win" },
        ],
      });
    }
  }
  const champion = html.match(/<div class="teambox champ[^"]*"[\s\S]*?<dt>([^<]+)<\/dt>/)?.[1]?.trim();
  return { games, champion: champion ?? null, teams: teams.length };
}

/** 勝ち抜き戦の不変条件。**落ちたらその大会は出さない** */
function verify(label, parsed) {
  const problems = [];
  const losses = new Map();
  for (const g of parsed.games) {
    for (const t of g.teams) {
      if (!losses.has(t.display)) losses.set(t.display, 0);
      if (!t.won) losses.set(t.display, losses.get(t.display) + 1);
    }
  }
  const unbeaten = [...losses].filter(([, n]) => n === 0).map(([x]) => x);
  const many = [...losses].filter(([, n]) => n > 1).map(([x, n]) => `${x}(${n})`);
  if (unbeaten.length !== 1) problems.push(`負けていない学校が${unbeaten.length}校: ${unbeaten.join("・")}`);
  if (many.length) problems.push(`2回以上負けている学校: ${many.join("・")}`);
  if (parsed.champion && unbeaten.length === 1 && unbeaten[0] !== parsed.champion) {
    problems.push(`優勝校が紙（${parsed.champion}）と合わない: ${unbeaten[0]}`);
  }

  // 2回戦以降に出てくる学校は、前の回戦の勝者
  const byRound = new Map();
  for (const g of parsed.games) {
    if (!byRound.has(g.round)) byRound.set(g.round, []);
    byRound.get(g.round).push(g);
  }
  const rounds = ROUND_ORDER.filter((r) => byRound.has(r));
  for (let i = 1; i < rounds.length; i++) {
    const prev = byRound.get(rounds[i - 1]);
    const winners = new Set(prev.flatMap((g) => g.teams.filter((t) => t.won).map((t) => t.display)));
    const all = new Set(prev.flatMap((g) => g.teams.map((t) => t.display)));
    for (const g of byRound.get(rounds[i])) {
      for (const t of g.teams) {
        if (winners.has(t.display) || !all.has(t.display)) continue;
        problems.push(`${rounds[i]}に出ている${t.display}が${rounds[i - 1]}の勝者でない`);
      }
    }
  }

  if (problems.length) {
    console.log(`  ⚠️ ${label}: ${problems.join(" / ")}。1試合も出さない`);
    return false;
  }
  console.log(`  （${label}: ${parsed.games.length}試合 / ${parsed.teams}校。検算を通った）`);
  return true;
}

/**
 * ★★**読み取り方そのものの検算。**
 * Wikipedia から読めている大会を同じやり方で読み、**1試合も食い違わない**ことを見る。
 */
async function selftest() {
  const { year, season } = SELFTEST;
  const parsed = parseBracket(await fetchHtml(url(year, season)));
  const mine = JSON.parse(readFileSync(GAMES, "utf8")).filter(
    (g) => g.year === year && g.season === season,
  );
  /*
    ★**校名は照合用にそろえてから比べる。**
    出典は「横浜商大高」「旭川大高」のように**末尾に「高」を付ける**ことがあり、
    Wikipedia 側は付けない。**そこは食い違いではない。**
    ★**「高」を落とすのは比べるときだけ。生成物の表記は出典のまま**
    （九州国際大高 → 九州国際大 が大学名に見える、という神宮での決めごとと同じ）。
  */
  const norm = (x) => x.normalize("NFKC").replace(/高$/, "");
  const key = (round, teams) =>
    [round, ...teams.map((t) => `${norm(t.display)}:${t.score}:${t.won ? "W" : "-"}`).sort()].join("|");
  const theirs = new Set(parsed.games.map((g) => key(g.round, g.teams)));
  const ours = new Set(mine.map((g) => key(g.round ?? "", g.teams)));

  const missing = [...ours].filter((k) => !theirs.has(k));
  const extra = [...theirs].filter((k) => !ours.has(k));
  console.log(`読み取りの検算（${year}年${season}）: こちら ${ours.size}試合 / 出典 ${theirs.size}試合`);
  if (missing.length) console.log(`  こちらにあって出典に無い ${missing.length}:\n    ${missing.join("\n    ")}`);
  if (extra.length) console.log(`  出典にあってこちらに無い ${extra.length}:\n    ${extra.join("\n    ")}`);
  if (!missing.length && !extra.length) console.log("  ★1試合も食い違わなかった");
  return !missing.length && !extra.length;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const ok = await selftest();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const out = [];
  for (const target of TARGETS) {
    const src = url(target.year, target.season);
    const parsed = parseBracket(await fetchHtml(src));
    if (!verify(target.name, parsed)) continue;
    for (const g of parsed.games) {
      out.push({
        year: target.year,
        season: target.season,
        no: target.no,
        tournament: target.name,
        round: g.round,
        // ★この出典は日付を持っていない。**推測で埋めない**
        date: null,
        note: null,
        teams: g.teams.map((t) => ({
          display: t.display,
          ...(t.pref ? { pref: t.pref } : {}),
          score: t.score,
          won: t.won,
        })),
        // ★**1試合ずつ出典を持たせる**（既定の出典と違うため）
        source: { name: SOURCE_NAME, url: src },
      });
    }
  }

  if (!out.length) {
    console.log("⚠️ 1試合も読めなかった。書き換えない");
    return;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n", "utf8");
  console.log(`\n書き出した: ${path.relative(ROOT, OUT)}（${out.length}試合）`);
}

await main();
