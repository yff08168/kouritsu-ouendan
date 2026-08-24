/**
 * 明治神宮野球大会（**高校の部**）の試合結果を作る。
 *
 * ------------------------------------------------------------------
 * ★ 出典: 公益財団法人 日本学生野球協会（`student-baseball.or.jp`）
 *
 *   `system/prog/schedule.php?m=pc&k=all&e=jingu&s=<年>`
 *   一覧は `/game/`（**1999年度以降**の各回へのリンクがある）。
 *
 *   **規約**: 転載・複製・無断・営利のいずれの記載も、
 *   トップページにも `/game/` にも**本文に無い**（2026-08-24 に確認）。
 *   `robots.txt` は**404**（制限なし）。
 *   ★**主催者自身が公開している大会結果**で、取るのは**数値と校名・日付・回戦だけ。**
 *
 * ------------------------------------------------------------------
 * ★★ 大学の部を混ぜないこと
 *
 *   明治神宮大会は**高校の部と大学の部**が同じ日程表に並ぶ。
 *   `高校` / `大学` の見出しが試合の前に出るので、**その区切りを持って読む。**
 *   ★**混ぜると「立命館大」「青山学院大」が高校の戦績に出る。**
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**その大会を1試合も出さない**）
 *
 *   ★**勝ち抜き戦の不変条件**（甲子園と同じ。**紙の外の数字を使わない**）:
 *     A. **優勝校以外のすべての学校がちょうど1回だけ負ける**
 *     B. **2回戦以降に出てくる学校は前の回戦の勝者**（シードは除く）
 *
 *   2025年（第56回）は **10校9試合**で、10 − 1 = 9 が合う。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "data", "jingu-games.ts");
const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };

const args = process.argv.slice(2);
const flagValue = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
/** 取る年。省略すると 1999〜今年 */
const onlyYear = Number(flagValue("--year") ?? 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(3000 * i);
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const cs =
        buf.toString("latin1").slice(0, 1500).match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
      return new TextDecoder(cs).decode(buf);
    } catch {
      /* 次の試行へ */
    }
  }
  return null;
}

/**
 * 画面に出す校名。**出典の表記をそのまま使う。**
 *
 * ★★**末尾の「高」を落とさないこと。** 出典は `九州国際大高` `神戸国際大高` と書き、
 * **「高」を落とすと `九州国際大` になって大学名に見える**
 * （この大会は大学の部と並んでいるので、なおさら紛らわしい）。
 * ★**落とすのは照合のときだけ**（`normalizeJinguName`）。
 */
const cleanName = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/\s+/g, "")
    .trim();

/** 照合用。**こちらでは「高」を落とす**（学校マスタと突き合わせるため） */
const matchName = (s) => cleanName(s).replace(/高等学校$|高校$|高$/, "");

/** 回戦の深さ。浅い順 */
const ROUND_ORDER = ["1回戦", "2回戦", "3回戦", "準々決勝", "準決勝", "決勝"];

/**
 * ★★**Wikipedia の「歴代結果（高校の部）」を検算材料に取る**（2026-08-24）。
 *
 * **出典（学生野球協会）の外から来る事実**なので、
 * 構造の検算（負けは1回だけ・勝ち上がりが繋がる）では捕まらない
 * 「大会をまるごと読み違えた」を止められる。
 *
 * 表の1行:
 *   `|{{By|2025年}}||[[…|56]]||10||[[…|九州国際大付]]（九州・福岡）||11 - 1||[[…|神戸国際大付]]（近畿・兵庫）||`
 *
 * ★**取れなければ null**（検算を飛ばすだけで、生成は止めない）。
 */
async function fetchWikiChampions() {
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&page=" +
    encodeURIComponent("明治神宮野球大会") +
    "&prop=wikitext&format=json&formatversion=2";
  const raw = await fetchText(url);
  if (!raw) return null;
  let t;
  try {
    t = JSON.parse(raw)?.parse?.wikitext ?? "";
  } catch {
    return null;
  }
  const a = t.indexOf("歴代結果（高校の部）");
  const b = t.indexOf("=== 実績累積 ===", a);
  if (a < 0 || b < 0) return null;
  /** リンクを外して表示名だけにする */
  const plain = (s) =>
    String(s ?? "")
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/（[^）]*）/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, "")
      .trim();

  const out = new Map();
  for (const line of t.slice(a, b).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|-?/, "").split("||");
    if (cells.length < 6) continue;
    const year = Number(cells[0].match(/(\d{4})年/)?.[1]);
    if (!year) continue;
    const schools = Number(plain(cells[2]));
    const champion = plain(cells[3]);
    const score = plain(cells[4]);
    const runnerUp = plain(cells[5]);
    if (!champion) continue;
    out.set(year, { schools: Number.isInteger(schools) ? schools : null, champion, score, runnerUp });
  }
  return out.size ? out : null;
}

/**
 * ★**略し方が違うので、部分列で比べる**（兵庫の「枚をまたぐ検算」と同じ）。
 * 出典は `九州国際大高`、Wikipedia は `九州国際大付`。**完全一致を求めると必ず落ちる。**
 * ★**緩いのはこの1組の比べ方だけ**で、要求（優勝・準優勝・スコアが揃うこと）は変えない。
 */
const sameSchool = (a, b) => {
  const x = matchName(a);
  const y = matchName(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
};

/**
 * 1年ぶんの日程表を読む。**高校の部だけ。**
 *
 * ★**平たくした本文を、順番に読む。**
 *   `11/14(金)の試合` … 日付
 *   `高校` / `大学`    … ここから下がどちらの部か
 *   `第1試合 8:30 [1回戦] 英明高 5 - 2 帝京長岡高 詳細`
 */
function readYear(html, year, wikiChampions) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const games = [];
  let md = null;
  let section = null;
  /*
    ★**区切りと試合を同じ順番で拾う。** 3つをまとめて1つの正規表現で流すことで、
    **どの試合がどの見出しの下にあるか**が順番だけで決まる。
  */
  const re =
    /(\d{1,2})\/(\d{1,2})\([月火水木金土日]\)の試合|(高校|大学)|第\d+試合\s*(\d{1,2}:\d{2})?\s*\[([^\]]+)\]\s*([^\s]+?)\s+(\d{1,2})\s*[-−–]\s*(\d{1,2})\s+([^\s]+?)\s+詳細/g;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      md = [Number(m[1]), Number(m[2])];
      continue;
    }
    if (m[3]) {
      section = m[3];
      continue;
    }
    // ★大学の部は取らない
    if (section !== "高校") continue;
    const a = cleanName(m[6]);
    const b = cleanName(m[9]);
    const sa = Number(m[7]);
    const sb = Number(m[8]);
    if (!a || !b || !Number.isInteger(sa) || !Number.isInteger(sb)) continue;
    games.push({
      round: m[5].trim(),
      md,
      teams: [
        { display: a, score: sa, won: sa > sb },
        { display: b, score: sb, won: sb > sa },
      ],
    });
  }
  if (!games.length) return null;

  /*
    ---- ★★検算A: 負けは1回だけ ----
    **優勝校以外のすべての学校がちょうど1回だけ負ける。**
    ★**紙の外の数字を一切使わない**ので、出典が出場校数を書いていなくても効く。
  */
  const teams = new Set(games.flatMap((g) => g.teams.map((t) => t.display)));
  const losses = new Map([...teams].map((t) => [t, 0]));
  for (const g of games) for (const t of g.teams) if (!t.won) losses.set(t.display, losses.get(t.display) + 1);
  const unbeaten = [...losses].filter(([, n]) => n === 0).map(([t]) => t);
  const many = [...losses].filter(([, n]) => n > 1);
  if (unbeaten.length !== 1 || many.length) {
    console.log(
      `  ⚠️ ${year}年: 負けていない学校が ${unbeaten.length} 校（${unbeaten.join("・")}）` +
        (many.length ? ` ／ 2回以上負けた学校 ${many.map(([t, n]) => `${t}(${n})`).join("・")}` : "") +
        "。1試合も出さない",
    );
    return null;
  }

  /*
    ---- ★★検算B: 勝ち上がりが繋がる ----
    **前の回戦に名前があるのに勝っていない学校**が次の回戦に出ていたら誤り。
    ★**シード（前の回戦に出ていない）は咎めない。**
  */
  const byRound = new Map();
  for (const g of games) {
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
        console.log(
          `  ⚠️ ${year}年: ${rounds[i]} に出ている ${t.display} が ${rounds[i - 1]} の勝者ではない。1試合も出さない`,
        );
        return null;
      }
    }
  }

  const champion = unbeaten[0];
  /*
    ---- ★★検算C: Wikipedia の歴代優勝校と突き合わせる ----
    ★**出典の外から来る事実**なので、A・Bの構造の検算では捕まらない
    「大会をまるごと読み違えた」を止められる。
    ★**記載が無ければ飛ばす**（古い回は表に無いことがある）。**飛ばしたらログに出す。**
  */
  const wiki = wikiChampions?.get(year) ?? null;
  if (wiki) {
    const finalGame = games.find((g) => g.round === "決勝");
    const runnerUp = finalGame?.teams.find((t) => !t.won)?.display ?? "";
    const score = finalGame
      ? [...finalGame.teams].sort((x, y) => y.score - x.score).map((t) => t.score).join("-")
      : "";
    const wikiScore = wiki.score.replace(/[x×]/gi, "").replace(/[-−–]/g, "-");
    const problems = [];
    if (!sameSchool(wiki.champion, champion)) problems.push(`優勝（記載「${wiki.champion}」/ 組み立て「${champion}」）`);
    if (wiki.runnerUp && !sameSchool(wiki.runnerUp, runnerUp))
      problems.push(`準優勝（記載「${wiki.runnerUp}」/ 組み立て「${runnerUp}」）`);
    if (wikiScore && wikiScore !== score) problems.push(`決勝のスコア（記載「${wikiScore}」/ 組み立て「${score}」）`);
    if (wiki.schools && wiki.schools !== teams.size)
      problems.push(`出場校数（記載 ${wiki.schools} / 読んだ ${teams.size}）`);
    if (problems.length) {
      console.log(`  ⚠️ ${year}年: Wikipedia と合わない ── ${problems.join(" ／ ")}。1試合も出さない`);
      return null;
    }
  } else {
    console.log(`  （${year}年: Wikipedia の歴代結果に記載が無く、優勝校は未検算）`);
  }

  console.log(
    `  （${year}年 明治神宮大会（高校の部）: ${games.length} 試合 / ${teams.size} 校 / 優勝 ${champion}` +
      `${wiki ? "（Wikipediaの優勝・準優勝・スコア・校数と一致）" : "（未検算）"}）`,
  );
  return games.map((g) => ({
    year,
    tournament: `${year}年 明治神宮野球大会 高校の部`,
    round: g.round,
    date: g.md
      ? `${year}-${String(g.md[0]).padStart(2, "0")}-${String(g.md[1]).padStart(2, "0")}`
      : null,
    teams: g.teams,
  }));
}

async function main() {
  const thisYear = new Date().getFullYear();
  const years = onlyYear ? [onlyYear] : [];
  if (!years.length) for (let y = 1999; y <= thisYear; y++) years.push(y);

  const wikiChampions = await fetchWikiChampions();
  if (!wikiChampions) console.log("  ⚠️ Wikipedia の歴代結果が取れない。優勝校の検算は全部飛ばす");
  else console.log(`  （Wikipedia の歴代結果を ${wikiChampions.size} 回ぶん読んだ）`);

  const out = [];
  let ok = 0;
  for (const y of years) {
    const url = `https://www.student-baseball.or.jp/system/prog/schedule.php?m=pc&k=all&e=jingu&s=${y}`;
    const html = await fetchText(url);
    await sleep(2000);
    if (!html) {
      console.log(`  ⚠️ ${y}年: ページが取れない`);
      continue;
    }
    const games = readYear(html, y, wikiChampions);
    if (!games) continue;
    ok++;
    out.push(...games);
  }

  console.log(`\n読めた大会 ${ok} ／ 試合 ${out.length} 件`);
  /*
    ★**1件も読めなかったら書き換えない**（他の生成物と同じ歯止め）。
    出典が落ちている回に、入っていた試合を消してしまわないため。
  */
  if (!out.length) {
    console.log("⚠️ 1試合も読めなかった。書き換えない");
    return;
  }
  if (onlyYear && existsSync(OUT)) {
    /*
      ★**1年だけの実行では、他の年を消さない。**
      いまのファイルを読み、その年だけ入れ替える。
    */
    const prev = readFileSync(OUT, "utf8").match(/=\s*(\[[\s\S]*\])\s*;\s*$/);
    if (prev) {
      const kept = JSON.parse(prev[1]).filter((g) => g.year !== onlyYear);
      out.unshift(...kept);
    }
  }
  out.sort((a, b) => b.year - a.year || (a.date ?? "").localeCompare(b.date ?? ""));

  const file =
    `// このファイルは scripts/build-jingu-games.mjs が生成する。直接編集しない。\n` +
    `// 明治神宮野球大会（高校の部）の試合結果。**大学の部は入っていない。**\n` +
    `// 出典: 公益財団法人 日本学生野球協会。数値・校名・日付・回戦のみ。\n\n` +
    `import type { JinguGame } from "@/lib/jingu-games";\n\n` +
    `export const JINGU_GAMES: readonly JinguGame[] = ${JSON.stringify(out, null, 2)};\n`;
  writeFileSync(OUT, file, "utf8");
  console.log(`書き出した: ${path.relative(ROOT, OUT)}（${Math.round(file.length / 1024)}KB）`);
}

await main();
