/**
 * 地方大会の「抜けている年」を洗い出して、取りに行く。
 *
 *   node --env-file=.env.local scripts/sweep-regional-gaps.mjs --pref gunma
 *   node --env-file=.env.local scripts/sweep-regional-gaps.mjs --pref ishikawa --from 1995
 *   node --env-file=.env.local scripts/sweep-regional-gaps.mjs --pref aichi --dry
 *
 * ------------------------------------------------------------------
 * ★★ これは何をするものか
 *
 *   `build-regional-results.mjs --pref <県> --year <年>` を**年ごとに呼ぶだけ**。
 *   読み手も検算も1つも増やしていない。**やっているのは3つ:**
 *
 *     1. 生成物から「収録している年」を出し、**その範囲の中で1試合も無い年**を拾う
 *     2. その年を1つずつ取りに行く（`--dry` を付けなければ**書き込む**）
 *     3. 落ちた年について、**出典が出した警告をそのまま**並べる
 *
 *   ★**「取れなかった理由」を人が読める形で残すのが本体。**
 *   47県ぶんの穴は、**1枚ずつ紙を開いて直すしかない**（このリポジトリの他の県が
 *   全部そうだった）。**その作業の入口を機械で作る**のがこのスクリプト。
 *
 * ------------------------------------------------------------------
 * ★★ 気をつけること
 *
 *   ★**出典に優しくすること。** 1年につき索引とPDFを取りに行くので、
 *   **`--pref` を必ず付ける**（全県まとめて走らせる口はわざと用意していない）。
 *   ★**`--year` を受け取らないアダプタがある**（千葉・静岡・山口・宮崎ほか）。
 *   そういう県は何年を指定しても同じ紙を取り直すだけなので、
 *   **警告も出ないまま「取れなかった」になる**（下のまとめでそう書く）。
 *   ★**書き込みは既存の引き継ぎに守られている** —— その年が取れなくても、
 *   前の生成物にある大会はそのまま残る（`previousDistrict`）。
 *   ★★**それでも、遡る前に README の「遡る前に『その県は遡っても壊れないか』を
 *   確かめること」を読むこと。** `tournament: null` の県と、出典が1年ずれた
 *   名前を返す県は、**遡ると静かに上書きされる。**
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src/lib/data/regional");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const pref = flag("--pref");
const from = Number(flag("--from") ?? NaN);
const DRY = args.includes("--dry");

if (!pref) {
  console.log("使い方: node --env-file=.env.local scripts/sweep-regional-gaps.mjs --pref <slug> [--from <年>] [--dry]");
  console.log("★出典に優しくするため、全県まとめて走らせる口はありません。1県ずつ。");
  process.exit(1);
}

const file = path.join(OUT_DIR, `${pref}.json`);
if (!existsSync(file)) {
  console.log(`${file} が無い。--pref のスラッグを確かめること。`);
  process.exit(1);
}

/**
 * ★**`src/lib/regional-tournaments.ts` の `yearOfTournament` と同じ規則。**
 * 試合に日付があればその年、無ければ大会名から。
 * ★**規則はあちらが本体。** 変えるときは3か所（あちら・ビルド・ここ）を必ず揃えること。
 */
function yearOfTournament(name, games) {
  const dated = games.map((g) => g.date).filter(Boolean).sort();
  if (dated.length) return Number(dated.at(-1).slice(0, 4));
  const t = (name ?? "").normalize("NFKC");
  const seireki = t.match(/[(（](\d{4})[)）]/);
  if (seireki) return Number(seireki[1]);
  const bare = t.match(/(?:^|[^\d])(\d{4})年/);
  if (bare) return Number(bare[1]);
  const senshuken = t.match(/第(\d+)回.*選手権/);
  if (senshuken) return Number(senshuken[1]) + 1918;
  const gengo = t.match(/(令和|平成)(元|\d+)年/);
  if (gengo) return (gengo[1] === "令和" ? 2018 : 1988) + (gengo[2] === "元" ? 1 : Number(gengo[2]));
  return null;
}

/** その県の生成物から「年 → その年の大会」を作る */
function yearsOf(json) {
  const byT = new Map();
  for (const g of json.games) {
    if (!byT.has(g.tournament)) byT.set(g.tournament, []);
    byT.get(g.tournament).push(g);
  }
  const years = new Map();
  for (const [name, gs] of byT) {
    const y = yearOfTournament(name, gs);
    if (!y) continue;
    if (!years.has(y)) years.set(y, []);
    years.get(y).push({ name, n: gs.length });
  }
  return years;
}

const json = JSON.parse(readFileSync(file, "utf8"));
const before = yearsOf(json);
const have = [...before.keys()].sort((a, b) => a - b);
if (!have.length) {
  console.log(`${pref}: 生成物に年の分かる大会が1つも無い。--year では遡れない県かもしれない`);
  process.exit(1);
}

const lo = have[0];
const hi = have.at(-1);
/** 収録している年の範囲の中で、1試合も無い年 */
const gaps = [];
for (let y = lo; y <= hi; y++) if (!before.has(y)) gaps.push(y);
/** `--from` を付けたときだけ、いちばん古い年より前も試す */
const older = [];
if (Number.isFinite(from)) for (let y = Math.max(from, 1900); y < lo; y++) older.push(y);

const wanted = [...older, ...gaps];

console.log(`=== ${json.district}（${pref}）`);
console.log(`   収録している年: ${lo}〜${hi} の ${have.length} 年 / ${json.games.length} 試合`);
console.log(`   範囲の中で抜けている年: ${gaps.length ? gaps.join(", ") : "なし"}`);
if (older.length) console.log(`   ★--from ${from} なので ${from}〜${lo - 1} も試す（${older.length} 年）`);
if (!wanted.length) {
  console.log("   取りに行く年が無い。");
  process.exit(0);
}
console.log(`   取りに行く: ${wanted.join(", ")}${DRY ? "（--dry。書き込まない）" : ""}`);
console.log("");

/** ビルドを1年ぶん走らせて、出た行を拾う */
function runYear(year) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--env-file=.env.local",
        path.join(ROOT, "scripts/build-regional-results.mjs"),
        "--pref",
        pref,
        "--year",
        String(year),
        ...(DRY ? ["--dry"] : []),
      ],
      { cwd: ROOT, env: process.env },
    );
    let out = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (out += b));
    child.on("close", () => {
      const lines = out.split(/\r?\n/);
      /*
        ★**出典が出した警告をそのまま残す。言い換えない。**
        ★**落とすのは2種類だけ**:
          - 季節ごとの「前は N 試合あったのに…」（**その年の話ではない**）
          - 県ぜんたいの取りこぼし検査（`⚠️ <slug> / <大会名>: …`）——
            **どの年を掃いても同じものが出る**ので、年ごとの理由には混ぜない
        ★**同じ警告が季節ごとに何度も出る**ので、重なりは畳む。
      */
      const wide = new RegExp("⚠️\\s*" + pref + "\\s*/");
      const warns = [
        ...new Set(
          lines
            .filter((l) => l.includes("⚠️"))
            .filter((l) => !/⚠️\s*(spring|summer|autumn):/.test(l))
            .filter((l) => !wide.test(l))
            .map((l) => l.trim()),
        ),
      ];
      resolve({
        // ★**成功した大会の行**（`  （◯◯大会: N 試合 …）`）
        got: lines.filter((l) => /^\s*（.+[:：]\s*\d+\s*試合/.test(l)).map((l) => l.trim()),
        warns,
      });
    });
  });
}

const report = [];
for (const year of wanted) {
  process.stdout.write(`--- ${year} 年 … `);
  const { got, warns } = await runYear(year);
  /*
    ★★**その年の大会が本当に取れたかは、生成物を読み直して確かめる。**
    ログの「◯試合」は**引き継ぎで前から残っていた大会**のこともあるので、
    それだけでは「取れた」と言えない。
  */
  const after = DRY ? null : yearsOf(JSON.parse(readFileSync(file, "utf8")));
  const now = after ? (after.get(year) ?? null) : null;
  /*
    ★★**`--dry` では生成物が変わらない**ので、そこからは判定できない。
    **ログに出た大会名から年を出して、掃いている年と一致するものだけ**を「取れた」とする。
  */
  const dryHit = got
    .map((l) => l.replace(/^（/, "").split(/[:：]/)[0].trim())
    .filter((name) => yearOfTournament(name, []) === year);
  const ok = DRY ? dryHit.length > 0 : Boolean(now);
  console.log(
    ok
      ? now
        ? `取れた（${now.reduce((s, t) => s + t.n, 0)} 試合 / ${now.length} 大会）`
        : `取れた（${dryHit.length} 大会。--dry なので書き込んでいない）`
      : "取れなかった",
  );
  report.push({ year, ok, now, dryHit, warns });
}

console.log("\n================ まとめ ================");
const won = report.filter((r) => r.ok);
const lost = report.filter((r) => !r.ok);
console.log(`取れた ${won.length} 年 / 取れなかった ${lost.length} 年`);
for (const r of won) {
  console.log(`\n● ${r.year} 年`);
  if (r.now) for (const t of r.now) console.log(`    ${t.n} 試合  ${t.name}`);
  else for (const name of r.dryHit) console.log(`    ${name}`);
}
if (lost.length) {
  console.log("\n---------------- 取れなかった年と、その理由 ----------------");
  console.log("★出典が出した警告をそのまま並べている。**言い換えていない。**");
  for (const r of lost) {
    console.log(`\n○ ${r.year} 年`);
    if (!r.warns.length) {
      /*
        ★**警告が1つも無いのは「出典にその年の紙が無い」か
        「アダプタが `--year` を受け取らない」かのどちらか。**
        どちらも読み手を直しても増えないので、そう書いて分けておく。
      */
      console.log("    警告なし ＝ 出典にその年の紙が無いか、アダプタが --year を受け取らない");
    }
    for (const w of r.warns) console.log(`    ${w}`);
  }
}
/*
  ★★**同じ警告がどの年でも出るなら、アダプタは `--year` を受け取っていない。**
  そういう県は**何年を指定しても同じ紙を取り直すだけ**なので、
  読み手を直しても増えない。**足すには県ごとの実装が要る。**
  ★**警告が空どうしの一致は数えない**（それは「出典に紙が無い」のほう）。
*/
const sets = lost.map((r) => r.warns.join("\n")).filter(Boolean);
if (sets.length >= 2 && new Set(sets).size === 1) {
  console.log("\n★★どの年でも同じ警告しか出ていない ＝ このアダプタは --year を受け取っていない。");
  console.log("　 何年を指定しても同じ紙を取り直すだけなので、遡るには県ごとの実装が要る。");
}

console.log("\n★次にやること: 上の理由を1つずつ紙で確かめる。");
console.log("★「紙が壊れている」と結論するときは、数え上げで示すこと（README の 2026-09-01 その4）。");
