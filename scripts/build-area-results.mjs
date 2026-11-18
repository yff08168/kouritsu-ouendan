// 秋季地区大会の本大会（東北・北信越・東海・近畿・中国・四国・九州）の試合結果を、
// その年の「開催県の高野連」が公開しているファイルから取り込む。
// 出力は `src/lib/data/regional-area.json`（開催県の slug → 地区大会の試合の配列）。
//
// ★★★ なぜ別スクリプト・別の生成物にしたか（2026-11-18）
//   地区大会の本大会は**その年の開催県が出す**（東北＝宮城・北信越＝新潟 …と**毎年替わる**）ので、
//   県を単位にした `build-regional-results.mjs`（1県＝1出典）には載せにくい。
//   ★**県のファイル（`regional/<県>.json`）の `games` には入れない** —— 県の最新の大会・進捗・記録・
//   勝ち上がり・直接対決に**他県の学校が混ざる**ため（神奈川の出典が載せていた関東大会で実際に起きた。
//   そちらは `areaGames` に分けてある）。
//   ★**こちらは年に1回、地区大会が終わってから手で走らせる**（CIには載せない）。
//   開催県の公開ファイルは**大会が終わったあとに差し替わらない**ので、毎日取り直す必要が無い。
//   ★**`regional-results.ts` の `RegionalGame` と同じ形**で書き出すので、`autumn-summary.ts` は
//   `district.areaGames` と同じ読み方でこのファイルを読める。
//
// ★★ 出典の規約（運営者の判断 2026-11-18 「開催都道府県のサイトから取る。規約は原文で確かめる」）
//   - 2026年秋の開催県: 東北＝宮城／関東＝群馬／北信越＝新潟／東海＝三重／近畿＝京都／中国＝鳥取／四国＝香川／九州＝熊本
//   - **使う**: 新潟県高野連（北信越）・三重県高野連（東海）・京都府高野連（近畿）・熊本県高野連（九州）。
//     どのサイトも転載・複製・営利の禁止の記載が無いことを、トップページとサイトの案内ページで確かめた。
//   - **使わない**: 宮城（サイトポリシーが「記事やドキュメント…の無断の引用・転載・加工」を禁止）・
//     鳥取（「画像・文章・データの無断転用及び転載」を禁止）。**規約で外している12連盟**に入る。
//     HSB flash の開催県サイトにも地区大会の本戦は無い（県大会だけ）ことを確かめてある。
//   - 四国（香川）は連盟のサイトが一球速報（omyutech）の画面で、結果の文書を公開していることを確かめられなかった。
//   - 関東（群馬）は連盟サイトが日程の1行しか出していない。**関東は神奈川の出典が載せた試合から読んでいる**
//     （`areaGames`）ので、そちらを使う。
//
// ★ 検算（1つでも合わなければ、その大会は1試合も書き出さない。前の内容を残す）
//   ① 各回の得点の和＝印刷された合計（箱スコアの出典）
//   ② 優勝校以外はちょうど1回負け、負けたあとには出ていない
//   ③ 出場校数 − 1 ＝ 試合数。決勝は1試合
//   ④ **優勝校＝明治神宮大会の出場校**（日本学生野球協会。**出典がまったく別**で、各地区の優勝校が並ぶ）
//
// 使い方:
//   node scripts/build-area-results.mjs              全部取り直して書き出す
//   node scripts/build-area-results.mjs --dry        書き出さずに報告だけ
//   node scripts/build-area-results.mjs --only hokushinetsu
//
// ★**取ってきたファイルは `data/` や `src/` に置かない**（メモリ上だけで読む）。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { xlsxSheets } from "./lib/xlsx-rows.mjs";
import { fetchPdfPages } from "./lib/pdf-text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/lib/data/regional-area.json");
const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DEBUG = args.includes("--debug");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 全角の英数字・括弧・空白をそろえる（NFKC） */
const normalize = (s) => String(s ?? "").normalize("NFKC");

// ------------------------------------------------------------------
// 取得
// ------------------------------------------------------------------

async function fetchBytes(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000), redirect: "follow" });
      if (!res.ok) continue;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      // 次の試行へ
    }
  }
  return null;
}

async function fetchText(url) {
  const bytes = await fetchBytes(url);
  return bytes ? new TextDecoder("utf-8").decode(bytes) : null;
}

// ------------------------------------------------------------------
// 検算
// ------------------------------------------------------------------

/** 回戦の並び（浅い→深い）。数字の回戦は数、準々決勝・準決勝・決勝はそれより後ろ */
function roundRank(round) {
  if (round === "決勝") return 70;
  if (round === "準決勝") return 60;
  if (round === "準々決勝") return 50;
  const m = String(round ?? "").match(/^(\d+)回戦$/);
  return m ? Number(m[1]) : -1;
}

/**
 * 勝ち抜き戦（トーナメント）として成り立っているかを見る。**1つでも違えば null を返し、理由を出す。**
 * @returns { champion, runnerUp, semifinalists, teams } | null
 */
function verifyKnockout(label, games, year) {
  const fail = (why) => {
    console.log(`  ⚠️ ${label}: ${why}。1試合も出さない`);
    return null;
  };
  if (!games.length) return fail("試合が1つも読めなかった");
  // ★秋季地区大会は9月下旬〜11月上旬。**その年の日付であること**（年の取り違え・日付の読み違いを止める）
  for (const g of games) {
    if (!g.date || g.date < `${year}-09-15` || g.date > `${year}-11-30`) {
      return fail(`日付が秋季大会の時期の外（${g.date}）`);
    }
  }
  for (const g of games) {
    if (!g.round || roundRank(g.round) < 0) return fail(`回戦が読めない試合がある（${g.round}）`);
    if (g.teams.length !== 2 || g.teams.some((t) => !t.display || !Number.isInteger(t.score))) {
      return fail("校名か得点が読めない試合がある");
    }
    if (g.teams[0].score === g.teams[1].score) {
      return fail(`同点の試合がある（${g.teams.map((t) => t.display).join(" - ")}）`);
    }
  }

  const finals = games.filter((g) => g.round === "決勝");
  if (finals.length !== 1) return fail(`決勝が ${finals.length} 試合ある`);
  const final = finals[0];
  const champion = final.teams.find((t) => t.won);
  const runnerUp = final.teams.find((t) => !t.won);

  const teams = new Set(games.flatMap((g) => g.teams.map((t) => t.display)));
  // ③ 出場校数 − 1 ＝ 試合数
  if (games.length !== teams.size - 1) {
    return fail(`出場校 ${teams.size} に対して試合が ${games.length}（${teams.size - 1} のはず）`);
  }

  // ② 優勝校以外はちょうど1回負け、負けたあとには出ていない
  for (const name of teams) {
    const played = games
      .filter((g) => g.teams.some((t) => t.display === name))
      .sort((a, b) => roundRank(a.round) - roundRank(b.round) || String(a.date).localeCompare(String(b.date)));
    const results = played.map((g) => g.teams.find((t) => t.display === name).won);
    const losses = results.filter((w) => !w).length;
    if (name === champion.display) {
      if (losses !== 0) return fail(`優勝校 ${name} に負けがある`);
    } else {
      if (losses !== 1) return fail(`${name} の負けが ${losses} 回（1回のはず）`);
      if (results.at(-1) !== false) return fail(`${name} が負けたあとに試合をしている`);
    }
    // 同じ回戦に2度出ていない
    const rounds = played.map((g) => g.round);
    if (new Set(rounds).size !== rounds.length) return fail(`${name} が同じ回戦に2度出ている`);
  }

  // 準決勝で負けた学校（準決勝がちょうど2試合のときだけ）
  const semis = games.filter((g) => g.round === "準決勝");
  const semifinalists = semis.length === 2 ? semis.map((g) => g.teams.find((t) => !t.won).display) : [];
  return { champion: champion.display, runnerUp: runnerUp.display, semifinalists, teams: teams.size };
}

/**
 * ★★ 優勝校＝明治神宮大会の出場校（日本学生野球協会。**出典がまったく別**）。
 * `teams.php` に「北信越地区 帝京長岡高校 新潟県 …」と各地区の優勝校が並ぶ。
 * 校名は紙が略称・神宮が正式名なので、**略称が正式名の部分列なら同じ**とみなす（兵庫・京都と同じ）。
 */
const jinguCache = new Map();
async function jinguChampions(year) {
  if (jinguCache.has(year)) return jinguCache.get(year);
  const html = await fetchText(
    `https://www.student-baseball.or.jp/system/prog/teams.php?m=pc&e=jingu&s=${year}&k=all`,
  );
  const map = new Map();
  if (html) {
    const text = normalize(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " "))
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
    // 高校の部だけ（大学の部の前まで）
    // ★**「大学」は校名の中にも出る**（二松学舎大学附属）。**単語として独立した「大学」で区切る**
    const start = text.indexOf("出場校 高校");
    const rest = start >= 0 ? text.slice(start) : "";
    const cut = rest.search(/ 大学 /);
    const part = cut > 0 ? rest.slice(0, cut) : rest;
    for (const m of part.matchAll(/(北海道|東北|関東|東京|北信越|東海|近畿|中国|四国|九州)地区\s+(\S+?)\s+(\S+?[都道府県])\s/g)) {
      map.set(m[1], m[2]);
    }
  }
  jinguCache.set(year, map);
  return map;
}

const subsequence = (short, long) => {
  let i = 0;
  for (const c of long) if (c === short[i]) i++;
  return i === short.length;
};
const bareSchool = (s) =>
  normalize(s).replace(/\s+/g, "").replace(/（.*?）|\(.*?\)/g, "").replace(/高等学校$|高校$/, "");

async function checkAgainstJingu(label, area, year, champion) {
  const map = await jinguChampions(year);
  const official = map.get(area);
  if (!official) {
    console.log(`  ⚠️ ${label}: 神宮の出場校一覧から ${area} 地区の優勝校が読めない。突き合わせられないので1試合も出さない`);
    return false;
  }
  const a = bareSchool(champion);
  const b = bareSchool(official);
  if (!(a === b || subsequence(a, b) || subsequence(b, a))) {
    console.log(`  ⚠️ ${label}: 優勝校が神宮の出場校と合わない（紙「${champion}」/ 神宮「${official}」）。1試合も出さない`);
    return false;
  }
  return true;
}

// ------------------------------------------------------------------
// 北信越大会（開催県＝新潟）。新潟県高野連の結果ファイル（xlsx）の「本大会」シート
// ------------------------------------------------------------------

/**
 * ★新潟県高野連は、県大会と北信越大会の本大会を**同じ1冊のブックの別シート**で出している。
 * 既存の新潟アダプタ（build-regional-results.mjs）は「本大会」シートを**意図的に外している**
 * （他県の学校が新潟の地方大会に出てくるため）。**ここはそのシートだけを読む。**
 *
 * シートの形（箱スコア）:
 *   `大会 第 N 日目 令和 8 年 10 月 10 日 （ 土 ）`
 *   `第１試合 | 球場 | １回戦      第２試合 | 球場 | １回戦`   ← 左と右に1試合ずつ（右は21列目から）
 *   `校 名 | 1..9 | … | 計`
 *   `帝京長岡 | 0 | 0 … | 5 | （ | 回コールド）`            ← 数字が入っていれば「N回コールド」
 *   `星稜     | … | 3 | （ | 回タイブレーク）`
 * ★**注記のセルは雛形の文字が常に入っている**（`（ 回コールド）`）。**数字が入っているときだけ注記になる。**
 * ★**サヨナラは `2X`（得点つき）、打たなかった回は `X`。**
 */
function readNiigataHonTaikai(rows) {
  const games = [];
  let date = null;
  const BLOCKS = [0, 21];
  const cell = (r, c) => (rows[r]?.[c] ?? "").toString().trim();

  for (let r = 0; r < rows.length; r++) {
    // 日付行
    const head = normalize((rows[r] ?? []).join(" "));
    const dm = head.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (dm && /日目/.test(head)) {
      date = `${2018 + Number(dm[1])}-${String(dm[2]).padStart(2, "0")}-${String(dm[3]).padStart(2, "0")}`;
      continue;
    }
    // 試合の見出し行（`第N試合` が左右どちらかの先頭にある）
    for (const base of BLOCKS) {
      if (!/^第[0-9０-９]+試合$/.test(normalize(cell(r, base)).replace(/\s/g, ""))) continue;
      const venue = cell(r, base + 2) || null;
      // 「１回戦」→「1回戦」、「決勝戦」→「決勝」（他県の生成物と表記をそろえる）
      const round = normalize(cell(r, base + 5)).replace(/\s/g, "").replace(/(決勝)戦$/, "$1");
      // この見出しの下にある「校名」見出し行と、その次の2行（チーム）
      let h = r + 1;
      while (h < r + 4 && normalize(cell(h, base)).replace(/\s/g, "") !== "校名") h++;
      if (normalize(cell(h, base)).replace(/\s/g, "") !== "校名") continue;

      const teams = [];
      const totals = [];
      let note = null;
      let broken = false;
      for (const tr of [h + 1, h + 2]) {
        const name = normalize(cell(tr, base)).replace(/\s+/g, "");
        if (!name) {
          broken = true;
          break;
        }
        // 各回。**空欄を 0 と読まない**（打たなかった回は `X`、空欄は「その回が無い」）
        const innings = [];
        let sum = 0;
        for (let c = base + 1; c <= base + 15; c++) {
          const v = normalize(cell(tr, c)).replace(/\s/g, "").toUpperCase();
          if (!v) continue;
          if (v === "X") continue; // 打たなかった回
          const m = v.match(/^(\d+)X?$/);
          if (!m) {
            broken = true;
            break;
          }
          innings.push(Number(m[1]));
          sum += Number(m[1]);
        }
        if (broken) break;
        const totalCell = normalize(cell(tr, base + 16)).replace(/\s/g, "");
        if (totalCell !== "" && !/^\d+$/.test(totalCell)) {
          broken = true;
          break;
        }
        // ★各回の和 ＝ 印刷された合計（試合ごとの検算）
        if (totalCell !== "" && Number(totalCell) !== sum) {
          console.log(`  ⚠️ 北信越: ${name} の各回の和 ${sum} が合計 ${totalCell} と合わない（${date} ${round}）`);
          return null;
        }
        totals.push(totalCell);
        teams.push({ display: name, name, slug: null, score: sum, won: false, innings });
        // 注記（数字が入っているときだけ。雛形の文字は常に入っている）
        const n = normalize(cell(tr, base + 18)).replace(/\s/g, "");
        const label = normalize([cell(tr, base + 17), cell(tr, base + 19)].join("")).replace(/\s/g, "");
        if (/^\d+$/.test(n)) {
          if (/コールド/.test(label)) note = `${n}回コールド`;
          else if (/タイブレーク/.test(label)) note = `延長${n}回タイブレーク`;
        }
      }
      if (broken || teams.length !== 2) continue;
      /*
        ★★**「計」の欄が両チームとも空の試合がある**（2026年の北信越大会 2回戦 小松大谷―富山商業）。
        各回は読めているので和を使う。**片方だけ空なら信用しない**（落とす）。
        ★その勝敗が合っているかは、大会全体の検算（負けたあとに出ていない・準決勝に勝者がいる）が見る。
      */
      if ((totals[0] === "") !== (totals[1] === "")) {
        console.log(`  ⚠️ 北信越: 片方だけ合計が空の試合がある（${date} ${round}）`);
        return null;
      }
      if (totals[0] === "") {
        console.log(
          `  （合計が空の試合: ${date} ${round} ${teams[0].display} ${teams[0].score}-${teams[1].score} ${teams[1].display}。各回の和を使う）`,
        );
      }
      teams[0].won = teams[0].score > teams[1].score;
      teams[1].won = teams[1].score > teams[0].score;
      games.push({
        date,
        season: "autumn",
        tournament: null, // 後で埋める
        round: round || null,
        venue,
        teams,
        ...(note ? { note } : {}),
      });
    }
  }
  return games;
}

async function collectHokushinetsu() {
  const file = "https://niigata-hbf.jp/wp/wp-content/uploads/2026/10/155aki_kekka1018.xlsx";
  const bytes = await fetchBytes(file);
  if (!bytes) {
    console.log("  ⚠️ 北信越: 結果ファイル（xlsx）が取れなかった");
    return null;
  }
  const sheets = await xlsxSheets(bytes);
  const sheet = sheets.find((s) => s.name === "本大会");
  if (!sheet) {
    console.log("  ⚠️ 北信越: 「本大会」シートが無い。ファイルの作りが変わった可能性がある");
    return null;
  }
  const games = readNiigataHonTaikai(sheet.rows);
  if (!games) return null;
  for (const g of games) g.tournament = "第155回北信越地区高等学校野球大会";
  return {
    games,
    sourceName: "新潟県高等学校野球連盟",
    sourceUrl: "https://niigata-hbf.jp/",
  };
}

// ------------------------------------------------------------------
// 近畿大会（開催県＝京都）。京都府高野連が公開している結果入りの組合せ表（PDF）
// ------------------------------------------------------------------

/**
 * ★**文字が入ったPDFで、出場校が縦に並ぶ16校の1段組**（左に1〜16の番号、右へ回戦が伸びる）。
 *
 *   `1  大 阪 桐 蔭  (大阪1位)`      ← 番号・校名（字間が空く）・（府県＋順位）
 *   `10月17日   9`                    ← 1回戦。日付と**上の学校の得点**（x=344）
 *   `９：００   0`                    ← 開始時刻と**下の学校の得点**
 *   … 2回戦は x=398・準々決勝は x=441・決勝は x=472
 *
 * ★★**枝は読まない。** 校名が並ぶ順（1〜16）と、**各回戦の得点の列を上から下へ並べたもの**だけで、
 * 対戦は決まる —— **回戦ごとに「隣どうしの勝者」が当たる**（標準の勝ち抜き表）。
 * ★**組み合わせを推測しているのではなく、紙が「同じ列の隣どうしが対戦相手」と書いている**。
 * その裏付けは検算（優勝・準優勝が紙の下部の印字と一致・負けたあとに出ていない・神宮の出場校）。
 *
 * ★**スコアの後ろの `(5C)` は5回コールド、`(10T)` は延長10回タイブレーク。**
 * ★**日付と時刻は別のトークン**。日付は**上の得点と同じ行**にある。
 */
function readSlotColumnBracket(page, { tournament, venue, year, season, labelOf }) {
  const fail = (why) => {
    console.log(`  ⚠️ ${tournament}: ${why}`);
    return null;
  };
  // ---- 出場校（番号順）----
  const slots = [];
  for (const l of page.lines) {
    const it = l.items;
    if (it.length < 3 || !/^\d{1,2}$/.test(it[0].text) || it[0].x > 70) continue;
    const name = [];
    let i = 1;
    for (; i < it.length && !/^[(（]$/.test(it[i].text); i++) name.push(it[i].text);
    const lab = [];
    for (i += 1; i < it.length && !/^[)）]$/.test(it[i].text); i++) lab.push(it[i].text);
    const display = normalize(name.join("")).replace(/\s+/g, "");
    if (!display) continue;
    slots.push({ n: Number(it[0].text), display, label: normalize(lab.join("")).replace(/\s+/g, ""), y: l.y });
  }
  slots.sort((a, b) => a.n - b.n);
  const N = slots.length;
  if (N < 4 || (N & (N - 1)) !== 0) return fail(`出場校が ${N} 校（2の累乗でない）。この形ではない`);
  if (slots.some((s, k) => s.n !== k + 1)) return fail("校名の番号が1から続いていない");
  const R = Math.log2(N);

  // ---- 得点（x が同じ列に並ぶ。回戦の数だけ列がある）----
  const nums = [];
  const dates = [];
  for (const l of page.lines) {
    for (const t of l.items) {
      const text = normalize(t.text).replace(/\s+/g, "");
      if (t.x >= 300 && /^\d+(\(\d+[CT]\))?$/.test(text)) {
        const m = text.match(/^(\d+)(?:\((\d+)([CT])\))?$/);
        nums.push({ x: t.x, y: l.y, score: Number(m[1]), noteN: m[2] ? Number(m[2]) : null, noteK: m[3] ?? null });
      }
      const dm = text.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (dm) dates.push({ x: t.x, y: l.y, month: Number(dm[1]), day: Number(dm[2]) });
    }
  }
  const xs = [...new Set(nums.map((n) => Math.round(n.x)))].sort((a, b) => a - b);
  const cols = [];
  for (const x of xs) {
    const last = cols.at(-1);
    if (last && x - last.x <= 8) last.members.push(x);
    else cols.push({ x, members: [x] });
  }
  if (cols.length !== R) return fail(`得点の列が ${cols.length} 本（${R} 本のはず）`);
  const colOf = (n) => cols.findIndex((c) => c.members.includes(Math.round(n.x)));

  const roundNames = Array.from({ length: R }, (_, r) => {
    const fromEnd = R - 1 - r;
    return fromEnd === 0 ? "決勝" : fromEnd === 1 ? "準決勝" : fromEnd === 2 ? "準々決勝" : `${r + 1}回戦`;
  });

  let alive = slots.map((s) => ({ ...s }));
  const games = [];
  for (let r = 0; r < R; r++) {
    const col = nums.filter((n) => colOf(n) === r).sort((a, b) => b.y - a.y);
    const want = alive.length; // その回戦の得点の数＝残っている学校の数
    if (col.length !== want) return fail(`${roundNames[r]}の得点が ${col.length} 個（${want} 個のはず）`);
    const next = [];
    for (let k = 0; k < alive.length; k += 2) {
      const a = alive[k];
      const b = alive[k + 1];
      const sa = col[k];
      const sb = col[k + 1];
      if (sa.score === sb.score) return fail(`${roundNames[r]}で同点の試合がある`);
      /*
        日付: **たいていは上の得点と同じ行**（決勝だけ下の得点と同じ行にある）。
        ★行の間隔は 9 ポイント以上あるので、±4 なら隣の試合の日付は拾わない。
        ★**同じ回戦の列のすぐ左（130ポイント以内）にあるものだけ**見る。
      */
      const d = dates.find(
        (x) => (Math.abs(x.y - sa.y) <= 4 || Math.abs(x.y - sb.y) <= 4) && x.x < sa.x && sa.x - x.x < 130,
      );
      if (!d) return fail(`${roundNames[r]}の日付が読めない試合がある`);
      const noteOf = (n) =>
        n.noteK === "C" ? `${n.noteN}回コールド` : n.noteK === "T" ? `延長${n.noteN}回タイブレーク` : null;
      const note = noteOf(sa) ?? noteOf(sb);
      const show = (s) => (labelOf && s.label ? `${s.display} （${s.label}）` : s.display);
      const ta = { display: show(a), name: show(a), slug: null, score: sa.score, won: sa.score > sb.score };
      const tb = { display: show(b), name: show(b), slug: null, score: sb.score, won: sb.score > sa.score };
      games.push({
        date: `${year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        season,
        tournament,
        round: roundNames[r],
        venue,
        teams: [ta, tb],
        ...(note ? { note } : {}),
      });
      next.push(ta.won ? a : b);
    }
    alive = next;
  }
  return { games, slots };
}

/** 紙の下部にある「優勝◯◯」「準優勝◯◯」。**ラベルのすぐ下の行**に校名がある */
function printedFinalists(page) {
  const out = {};
  const lines = page.lines;
  for (let i = 0; i < lines.length; i++) {
    for (const it of lines[i].items) {
      const t = normalize(it.text).replace(/\s+/g, "");
      if (t === "優勝" || t === "準優勝") {
        // ラベルと同じ x のあたりで、次の行以降にある校名（括弧・数字でないもの）
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
          const cand = lines[j].items.find(
            (c) => Math.abs(c.x - it.x) <= 40 && /[぀-ヿ一-鿿]{2,}/.test(c.text) && !/^[（(]/.test(c.text),
          );
          if (cand) {
            out[t] = normalize(cand.text).replace(/\s+/g, "");
            break;
          }
        }
      }
    }
  }
  return out;
}

async function collectKinki() {
  const id = "1gPHM3Wmxme7j6qtNRHlrcEHsHfX9p394";
  const pages = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${id}`, { headers: UA });
  if (!pages?.length) {
    console.log("  ⚠️ 近畿: PDFが取れなかった");
    return null;
  }
  const page = pages[0];
  const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
  if (!flat.some((t) => /令和8年度秋季近畿地区高等学校野球大会/.test(t))) {
    console.log("  ⚠️ 近畿: 表題が違う（別の大会のPDFを掴んだ可能性）");
    return null;
  }
  const venue = (() => {
    for (const l of page.lines) {
      const i = l.items.findIndex((t) => normalize(t.text).replace(/\s/g, "") === "会場");
      if (i >= 0 && l.items[i + 1]) return normalize(l.items[i + 1].text).trim();
    }
    return null;
  })();
  const built = readSlotColumnBracket(page, {
    tournament: "第79回秋季近畿地区高等学校野球大会",
    venue,
    year: 2026,
    season: "autumn",
    labelOf: true,
  });
  if (!built) return null;

  // ---- 検算: 紙の下部に印字された優勝校・準優勝校 ----
  const printed = printedFinalists(page);
  const final = built.games.find((g) => g.round === "決勝");
  const champ = final.teams.find((t) => t.won).display.replace(/\s*（.*?）$/, "");
  const runner = final.teams.find((t) => !t.won).display.replace(/\s*（.*?）$/, "");
  const same = (a, b) => {
    const x = bareSchool(a);
    const y = bareSchool(b);
    return x === y || subsequence(x, y) || subsequence(y, x);
  };
  if (!printed["優勝"] || !same(champ, printed["優勝"])) {
    console.log(`  ⚠️ 近畿: 組み立てた優勝校が紙の印字と合わない（紙「${printed["優勝"]}」/ 組み立て「${champ}」）。1試合も出さない`);
    return null;
  }
  if (!printed["準優勝"] || !same(runner, printed["準優勝"])) {
    console.log(`  ⚠️ 近畿: 組み立てた準優勝校が紙の印字と合わない（紙「${printed["準優勝"]}」/ 組み立て「${runner}」）。1試合も出さない`);
    return null;
  }
  return {
    games: built.games,
    sourceName: "京都府高等学校野球連盟",
    sourceUrl: "https://kyoto-hsbf.sakura.ne.jp/khsbf/",
  };
}

// ------------------------------------------------------------------
// 東海大会（開催県＝三重）。三重県高野連が公開している結果入りのトーナメント表（PDF）
// ------------------------------------------------------------------

/**
 * ★**12校（シード4校）のトーナメント表。番号は刷られていない。** 校名が上から並ぶ順で決まる。
 *
 *   名前の行（x≈67）の下の行に `（愛知１位）` 。**3校ずつ4つの山**で、
 *   **各山の先頭がシード校**（1回戦が無い）、2校目と3校目が1回戦を戦う。
 *   得点は列ごと（x≈203 が1回戦／273 が2回戦／342 が準決勝／412 が決勝）に
 *   **上から下へ**並び、**2つずつが1試合（上＝上の学校）**。
 *   日付は**上の得点と同じ行**（`10/17`）。**注記（`７回コールド` `延長10回タイブレーク`）は下の得点と同じ行**。
 *
 * ★**山の構成（先頭がシード）は紙に書いていない。** これは**検算で確かめる**
 *   （優勝校が紙の印字「優勝◯◯」と一致・負けたあとに出ていない・神宮の出場校）。
 *   **山の構成が違えば、得点の列が合わず（1回戦8・2回戦8・準決勝4・決勝2個）落ちる。**
 */
function readSeededTwelve(page, { tournament, year, season }) {
  const fail = (why) => {
    console.log(`  ⚠️ ${tournament}: ${why}`);
    return null;
  };
  // ---- 出場校（上から）----
  const names = [];
  const L = page.lines;
  for (let i = 0; i < L.length; i++) {
    const it = L[i].items;
    if (!it.length || it[0].x < 60 || it[0].x > 75 || /^[（(]/.test(it[0].text)) continue;
    const next = L[i + 1]?.items[0];
    if (!next || !/^[（(]/.test(next.text)) continue;
    const display = normalize(
      it
        .filter((t) => t.x < 200)
        .map((t) => t.text)
        .join(""),
    ).replace(/\s+/g, "");
    const label = normalize(next.text).replace(/[()（）]/g, "").replace(/\s+/g, "");
    if (!display) continue;
    names.push({ display: `${display} （${label}）`, y: L[i].y });
  }
  if (names.length !== 12) return fail(`出場校が ${names.length} 校（12校のはず）`);

  // ---- 得点（列ごと）----
  const nums = [];
  const dates = [];
  const notes = [];
  for (const l of L) {
    for (const t of l.items) {
      const text = normalize(t.text).replace(/\s+/g, "");
      if (t.x >= 190 && t.x < 440 && /^\d+$/.test(text)) nums.push({ x: t.x, y: l.y, score: Number(text) });
      const dm = text.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dm) dates.push({ x: t.x, y: l.y, month: Number(dm[1]), day: Number(dm[2]) });
      const cm = text.match(/(\d+)回コールド/);
      const tm = text.match(/延長(\d+)回タイブレーク/);
      if (cm) notes.push({ x: t.x, y: l.y, note: `${cm[1]}回コールド` });
      else if (tm) notes.push({ x: t.x, y: l.y, note: `延長${tm[1]}回タイブレーク` });
    }
  }
  const xs = [...new Set(nums.map((n) => Math.round(n.x)))].sort((a, b) => a - b);
  const cols = [];
  for (const x of xs) {
    const last = cols.at(-1);
    if (last && x - last.x <= 8) last.members.push(x);
    else cols.push({ x, members: [x] });
  }
  if (cols.length !== 4) return fail(`得点の列が ${cols.length} 本（4 本のはず）`);
  const col = cols.map((c) => nums.filter((n) => c.members.includes(Math.round(n.x))).sort((a, b) => b.y - a.y));
  const want = [8, 8, 4, 2];
  for (let r = 0; r < 4; r++) {
    if (col[r].length !== want[r]) return fail(`${["1回戦", "準々決勝", "準決勝", "決勝"][r]}の得点が ${col[r].length} 個（${want[r]} 個のはず）`);
  }

  const roundNames = ["1回戦", "準々決勝", "準決勝", "決勝"];
  const games = [];
  const play = (r, k, a, b) => {
    const sa = col[r][2 * k];
    const sb = col[r][2 * k + 1];
    if (sa.score === sb.score) return null;
    const d = dates.find((x) => Math.abs(x.y - sa.y) <= 4 && x.x < sa.x && sa.x - x.x < 150);
    if (!d) return null;
    const n = notes.find((x) => Math.abs(x.y - sb.y) <= 3 && x.x < sb.x && sb.x - x.x < 200);
    const ta = { display: a, name: a, slug: null, score: sa.score, won: sa.score > sb.score };
    const tb = { display: b, name: b, slug: null, score: sb.score, won: sb.score > sa.score };
    games.push({
      date: `${year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
      season,
      tournament,
      round: roundNames[r],
      venue: null,
      teams: [ta, tb],
      ...(n ? { note: n.note } : {}),
    });
    return ta.won ? a : b;
  };

  // 1回戦（各山の2校目と3校目）→ 2回戦（シードと勝者）→ 準決勝 → 決勝
  const quarter = [0, 1, 2, 3].map((q) => names.slice(q * 3, q * 3 + 3).map((n) => n.display));
  const w1 = quarter.map(([, a, b], k) => play(0, k, a, b));
  if (w1.some((w) => !w)) return fail("1回戦の得点か日付が読めない試合がある");
  const w2 = quarter.map(([seed], k) => play(1, k, seed, w1[k]));
  if (w2.some((w) => !w)) return fail("準々決勝の得点か日付が読めない試合がある");
  const w3 = [0, 1].map((k) => play(2, k, w2[2 * k], w2[2 * k + 1]));
  if (w3.some((w) => !w)) return fail("準決勝の得点か日付が読めない試合がある");
  const champion = play(3, 0, w3[0], w3[1]);
  if (!champion) return fail("決勝の得点か日付が読めない");
  return { games };
}

async function collectTokai() {
  const url = "https://mie-kouyaren.com/wp-content/uploads/2026/10/3b6c16b3eaf26a918cb92b1214b0dc4e.pdf";
  const pages = await fetchPdfPages(url, { headers: UA });
  if (!pages?.length) {
    console.log("  ⚠️ 東海: PDFが取れなかった");
    return null;
  }
  const page = pages[0];
  const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
  if (!flat.some((t) => /第79回秋季東海地区高等学校野球大会/.test(t))) {
    console.log("  ⚠️ 東海: 表題が違う（別の大会のPDFを掴んだ可能性）");
    return null;
  }
  const built = readSeededTwelve(page, { tournament: "第79回秋季東海地区高等学校野球大会", year: 2026, season: "autumn" });
  if (!built) return null;

  // ---- 検算: 紙に印字された優勝校（「優勝」の右の列に校名が縦に分かれて刷られている）----
  const final = built.games.find((g) => g.round === "決勝");
  const champ = final.teams.find((t) => t.won).display.replace(/\s*（.*?）$/, "");
  const lines = page.lines;
  let printed = "";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].items.some((t) => normalize(t.text).replace(/\s/g, "") === "優勝" && t.x > 440)) {
      printed = lines
        .slice(i, i + 5)
        .flatMap((l) => l.items.filter((t) => t.x > 440).map((t) => t.text))
        .filter((t) => normalize(t).replace(/\s/g, "") !== "優勝")
        .join("");
      break;
    }
  }
  const bare = bareSchool(printed);
  const b = bareSchool(champ);
  if (!bare || !(subsequence(b, bare) || subsequence(bare, b))) {
    console.log(`  ⚠️ 東海: 組み立てた優勝校が紙の印字と合わない（紙「${printed}」/ 組み立て「${champ}」）。1試合も出さない`);
    return null;
  }
  return {
    games: built.games,
    sourceName: "三重県高等学校野球連盟",
    sourceUrl: "https://mie-kouyaren.com/",
  };
}

// ------------------------------------------------------------------
// 九州大会（開催県＝熊本）。熊本県高野連が公開している結果入りの組合せ表（PDF）
// ------------------------------------------------------------------

/**
 * ★**出場校が横に1〜16と並び、校名が縦書き（1字ずつ積む）の16校の表。**
 *
 *   `1 2 3 … 16`                 ← 番号の行（y≈196）。**番号の x が、その学校の列の位置**
 *   番号の下に、**同じ x の列に字が1つずつ積まれる**:
 *     祐 / 誠 / ( / 福 / 岡 / 1 / 位 / )   → 「祐誠」＋（福岡1位）
 *   得点は**回戦ごとに横一列**（1回戦 y≈316・2回戦 y≈369・準決勝 y≈423・決勝 y≈473）。
 *   **左から2つずつが1試合（左＝左の学校）**。日付は得点の行のすぐ下（`10月24日`）。
 *
 * ★★**丸数字（⑬）は NFKC で数字（13）に化ける。** 得点の数字は**正規化の前の生の字**で
 *   `^\d{1,2}$` を見ること（正規化すると試合番号が得点の列に混ざる）。
 * ★**縦書きの校名は、番号の x に最も近い列に属させる**（列の間隔は約30、ずれは8以内）。
 * ★**紙に「優勝」の印字は無い。** 検算は 勝ち抜きの整合・神宮の出場校・熊本県高野連の試合速報の決勝。
 */
function readVerticalSixteen(page, { tournament, venue, year, season }) {
  const fail = (why) => {
    console.log(`  ⚠️ ${tournament}: ${why}`);
    return null;
  };
  // ---- 番号の行（1〜16 が同じ y に並ぶ）----
  const rowsByY = new Map();
  for (const l of page.lines) {
    const nums = l.items.filter((t) => /^\d{1,2}$/.test(t.text));
    // ★**1回戦の得点の行も16個の数字**。**左から 1,2,3…16 と並ぶ行だけ**が番号の行
    if (nums.length === 16 && nums.slice().sort((a, b) => a.x - b.x).every((t, k) => Number(t.text) === k + 1)) {
      rowsByY.set(l.y, nums);
    }
  }
  if (rowsByY.size !== 1) return fail(`番号の行が ${rowsByY.size} 本（1本のはず）`);
  const [slotY, slotNums] = [...rowsByY.entries()][0];
  const slotX = slotNums.map((t) => ({ n: Number(t.text), x: t.x })).sort((a, b) => a.x - b.x);
  if (slotX.some((s, k) => s.n !== k + 1)) return fail("番号が左から1〜16の順に並んでいない");

  // ---- 校名（番号の下の列）----
  const cols = slotX.map(() => []);
  for (const l of page.lines) {
    if (l.y >= slotY - 2) continue;
    for (const t of l.items) {
      let best = 0;
      for (let k = 1; k < slotX.length; k++) if (Math.abs(slotX[k].x - t.x) < Math.abs(slotX[best].x - t.x)) best = k;
      if (Math.abs(slotX[best].x - t.x) > 12) continue;
      cols[best].push({ y: l.y, text: t.text });
    }
  }
  const slots = [];
  for (const col of cols) {
    const chars = col.sort((a, b) => b.y - a.y).map((c) => normalize(c.text));
    const open = chars.findIndex((c) => c === "(");
    const close = chars.findIndex((c) => c === ")");
    if (open < 1 || close < open) return fail("校名の列の形が違う（括弧が無い）");
    const display = chars.slice(0, open).join("").replace(/\s+/g, "");
    const label = chars.slice(open + 1, close).join("").replace(/\s+/g, "");
    if (!display) return fail("校名が読めない列がある");
    slots.push({ display: `${display} （${label}）` });
  }

  // ---- 得点の行（y が同じ数字が 16・8・4・2 個ある行が4本）----
  const rows = new Map();
  for (const l of page.lines) {
    if (l.y <= slotY + 5) continue;
    const nums = l.items.filter((t) => /^\d{1,2}$/.test(t.text) && t.x > 50 && t.x < 540);
    if (nums.length) rows.set(l.y, nums);
  }
  const scoreRows = [...rows.entries()].filter(([, v]) => [16, 8, 4, 2].includes(v.length)).sort((a, b) => a[0] - b[0]);
  if (scoreRows.length !== 4 || scoreRows.some(([, v], k) => v.length !== 16 / 2 ** k)) {
    return fail(`得点の行が見つからない（${scoreRows.map(([y, v]) => `${y.toFixed(0)}:${v.length}`).join(" ")}）`);
  }
  const dates = [];
  for (const l of page.lines) {
    for (const t of l.items) {
      const dm = normalize(t.text).replace(/\s/g, "").match(/^(\d{1,2})月(\d{1,2})日$/);
      if (dm) dates.push({ x: t.x, y: l.y, month: Number(dm[1]), day: Number(dm[2]) });
    }
  }

  const roundNames = ["1回戦", "準々決勝", "準決勝", "決勝"];
  const games = [];
  let alive = slots.map((s) => s.display);
  for (let r = 0; r < 4; r++) {
    const [rowY, row] = scoreRows[r];
    const sorted = row.slice().sort((a, b) => a.x - b.x);
    const next = [];
    for (let k = 0; k < alive.length; k += 2) {
      const sa = sorted[k];
      const sb = sorted[k + 1];
      const A = Number(sa.text);
      const B = Number(sb.text);
      if (A === B) return fail(`${roundNames[r]}で同点の試合がある`);
      // 日付: 得点の行のすぐ下で、2つの得点のあいだ（±20）にあるもの
      const cand = dates
        .filter((d) => d.y < rowY - 2 && d.y > rowY - 14 && d.x > sa.x - 20 && d.x < sb.x + 20)
        .sort((a, b) => Math.abs(a.x - (sa.x + sb.x) / 2) - Math.abs(b.x - (sa.x + sb.x) / 2));
      const d = cand[0];
      if (!d) return fail(`${roundNames[r]}の日付が読めない試合がある`);
      const ta = { display: alive[k], name: alive[k], slug: null, score: A, won: A > B };
      const tb = { display: alive[k + 1], name: alive[k + 1], slug: null, score: B, won: B > A };
      games.push({
        date: `${year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        season,
        tournament,
        round: roundNames[r],
        venue,
        teams: [ta, tb],
      });
      next.push(ta.won ? alive[k] : alive[k + 1]);
    }
    alive = next;
  }
  return { games };
}

async function collectKyushu() {
  const url = "http://www.kumamoto-kouyaren.com/tournament-other/pdf/2026_kyusyu_159th_re.pdf";
  const pages = await fetchPdfPages(url, { headers: UA });
  if (!pages?.length) {
    console.log("  ⚠️ 九州: PDFが取れなかった");
    return null;
  }
  const page = pages[0];
  const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
  if (!flat.some((t) => /第159回九州地区高等学校野球大会/.test(t))) {
    console.log("  ⚠️ 九州: 表題が違う（別の大会のPDFを掴んだ可能性）");
    return null;
  }
  const venue = (() => {
    for (const t of flat) {
      const m = t.match(/・{2,}\s*(\S+球場)/);
      if (m) return m[1];
    }
    return null;
  })();
  const built = readVerticalSixteen(page, {
    tournament: "第159回九州地区高等学校野球大会",
    venue,
    year: 2026,
    season: "autumn",
  });
  if (!built) return null;
  return {
    games: built.games,
    sourceName: "熊本県高等学校野球連盟",
    sourceUrl: "http://www.kumamoto-kouyaren.com/",
  };
}

// ------------------------------------------------------------------
// 大会の一覧
// ------------------------------------------------------------------

const SOURCES = [
  {
    key: "hokushinetsu",
    area: "北信越",
    slug: "niigata",
    year: 2026,
    season: "autumn",
    label: "北信越",
    collect: collectHokushinetsu,
  },
  {
    key: "kinki",
    area: "近畿",
    slug: "kyoto",
    year: 2026,
    season: "autumn",
    label: "近畿",
    collect: collectKinki,
  },
  {
    key: "tokai",
    area: "東海",
    slug: "mie",
    year: 2026,
    season: "autumn",
    label: "東海",
    collect: collectTokai,
  },
  {
    key: "kyushu",
    area: "九州",
    slug: "kumamoto",
    year: 2026,
    season: "autumn",
    label: "九州",
    collect: collectKyushu,
  },
  /*
    ★★**確かめるだけ（書き出さない）: 関東大会**。開催県（群馬）の連盟サイトは日程の1行しか出しておらず、
    **関東大会は神奈川の出典が載せた試合（`kanagawa.json` の `areaGames`）から読んでいる**。
    その45試合のうち今年の秋の試合が、**同じ検算（勝ち抜きの整合・神宮の出場校）を通るか**を見る。
  */
  {
    key: "kanto-check",
    area: "関東",
    slug: "kanagawa",
    year: 2026,
    season: "autumn",
    label: "関東（神奈川の出典・確認のみ）",
    verifyOnly: true,
    async collect() {
      const d = JSON.parse(readFileSync(resolve(ROOT, "src/lib/data/regional/kanagawa.json"), "utf8"));
      const games = (d.areaGames ?? [])
        .filter((g) => g.season === "autumn" && (g.date ?? "").startsWith("2026"))
        // ★出典は順位の注記の空白・全角半角が試合ごとに揺れる（`群馬 1位` / `群馬1位`）。そろえてから数える
        .map((g) => ({
          ...g,
          teams: g.teams.map((t) => ({ ...t, display: normalize(t.display).replace(/\s+/g, "") })),
        }));
      return { games, sourceName: d.sourceName, sourceUrl: d.sourceUrl };
    },
  },
];

function readPrevious() {
  if (!existsSync(OUT)) return {};
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const out = readPrevious();
  let wrote = 0;
  for (const src of SOURCES) {
    if (ONLY && src.key !== ONLY) continue;
    console.log(`\n=== ${src.year}年 秋季${src.area}大会（開催県 ${src.slug}） ===`);
    const got = await src.collect();
    await sleep(1500);
    if (!got) {
      console.log("  → 前の内容を残す");
      continue;
    }
    if (DEBUG) {
      for (const g of got.games) {
        console.log(
          `    ${g.date} ${g.round} ${g.venue ?? ""} ${g.teams.map((t) => `${t.display} ${t.score}`).join(" - ")}${g.note ? ` (${g.note})` : ""}`,
        );
      }
    }
    const summary = verifyKnockout(src.label, got.games, src.year);
    if (!summary) continue;
    if (!(await checkAgainstJingu(src.label, src.area, src.year, summary.champion))) continue;

    console.log(
      `  ✓ ${got.games.length} 試合 / ${summary.teams} 校 / 優勝 ${summary.champion} / 準優勝 ${summary.runnerUp}` +
        (summary.semifinalists.length ? ` / 準決勝敗退 ${summary.semifinalists.join("・")}` : ""),
    );

    if (src.verifyOnly) {
      console.log("  （確認のみ。書き出さない）");
      continue;
    }
    // 同じ開催県・同じ年・同じ季節だけ置き換える（ほかの年は残す）
    const prev = out[src.slug] ?? { area: src.area, games: [] };
    const keep = (prev.games ?? []).filter(
      (g) => !(g.season === src.season && (g.date ?? "").startsWith(String(src.year))),
    );
    out[src.slug] = {
      area: src.area,
      sourceName: got.sourceName,
      sourceUrl: got.sourceUrl,
      games: [...keep, ...got.games],
    };
    wrote += 1;
  }

  if (DRY) {
    console.log(`\n（--dry: 書き出さない。通った大会 ${wrote} 件）`);
    return;
  }
  if (wrote === 0) {
    console.log("\n通った大会が無いので書き出さない");
    return;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`\n書き出した: ${OUT}（通った大会 ${wrote} 件）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
