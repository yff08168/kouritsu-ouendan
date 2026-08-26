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
/*
  ★★**JSON で書き出す**（2026-08-24）。
  TypeScript のリテラル配列にすると、**2,972件で TS2590**
  （"union type that is too complex to represent"）になり型検査が通らない。
  ★**JSON なら型を推論させずに済む**（読む側で1回だけ型を与える）。
*/
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-games.json");

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

/**
 * 行に混ざった**注釈テンプレート**を丸ごと落とす。
 *
 * ★★**注釈はパイプを含む**ので、落とさずに `split("|")` するとセルが1つずれ、
 * **その試合が丸ごと読めなくなる**（1試合欠けるだけで大会がまるごと落ちる）。
 * ★**種類を名指ししない** —— `{{Efn|…}}` `{{Refnest|group="注"|…}}` のように
 * 記事ごとに違う。**内側から順に `{{…}}` を消す**ので、入れ子でも効く
 * （2019年春の啓新は `Refnest` で落ちていた）。
 */
/**
 * 脚注（`<ref>…</ref>`）を丸ごと落とす。**記事を読む前に1回。**
 *
 * ★★**脚注の中に `{{Linescore}}` が入っている記事がある**（2003年夏）。
 * ブラケットの塊は `{{Round…|…
}}` で切り出しているので、
 * **脚注の中の `}}` で塊が途中で終わり、そこから先の試合が全部消える**
 * （2003年夏は2回戦以降が丸ごと落ち、大会ごと出せなくなっていた）。
 * ★**脚注の中の試合は「ノーゲーム」など、そもそも出してはいけないもの。**
 */
/**
 * ★★**複数行にまたがる注釈テンプレート（`{{Efn|…}}` `{{Refnest|…}}`）を丸ごと落とす。**
 *
 * 2026年春の記事は、**注釈の中に `{{Linescore}}` が入っている**（試合の行の途中）。
 * ブラケットの塊は `{{Round…|…
}}` で切り出しているので、
 * **注釈の中の `}}` で塊が途中で終わり、準決勝以降が丸ごと落ちる。**
 * ★**行ごとの掃除（`stripTemplates`）では届かない**ので、記事全体に先にかける。
 * ★**閉じ括弧は数えて探す**（入れ子があるため）。
 */
const stripNotes = (text) => {
  let out = String(text ?? "");
  for (;;) {
    const at = out.search(/{{(Efn|Refnest)[|}]/i);
    if (at < 0) return out;
    let depth = 0;
    let end = -1;
    for (let i = at; i < out.length - 1; i++) {
      if (out[i] === "{" && out[i + 1] === "{") { depth++; i++; continue; }
      if (out[i] === "}" && out[i + 1] === "}") {
        depth--;
        i++;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    // ★閉じていない注釈は触らない（触ると記事の残りを壊す）
    if (end < 0) return out;
    out = out.slice(0, at) + out.slice(end);
  }
};

const stripRefs = (s) =>
  String(s ?? "")
    /*
      ★★**閉じない脚注（`<ref name="x"/>`）を先に落とすこと。**
      後回しにすると `<ref[^>]*>` がそれに当たり、**次の `</ref>` まで
      まるごと消える**（2015年夏・2016年夏で実際に試合が31件消えた）。
    */
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");

const stripTemplates = (s) => {
  let out = String(s ?? "");
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, "");
    if (next === out) break;
    out = next;
  }
  return out;
};

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
      /*
        ★★**ブロックの最初の `RD1=` にはパイプが付いていない**（2026-08-26）。
        `{{Round16 no third|RD1=1回戦` と**テンプレート名と同じ行から始まる**ため。
        ★**パイプを必須にすると、その回戦の試合が全部「回戦なし」になる。**
        1988年春は**1回戦2試合と準々決勝4試合**がそうなっており、
        トーナメント表が2回戦から始まって全員がシードに見えていた。
      */
      const rd = line.match(/^\s*\|?\s*RD\d+\s*=\s*(.*)$/);
      if (rd) {
        round = rd[1].trim() === "-" ? null : rd[1].trim();
        continue;
      }
      /*
        ★★**パイプで割る前に注釈を落とす**（2026-08-26）。

          |8月13日（3）：{{Efn|8回表の途中で降雨…}}|'''花巻東'''|'''2'''|クラーク国際|1
          |4月1日<ref>3月31日第4試合 2-2 …</ref>：延長10回（[[…引き分け再試合|詳細]]）|…

        ★**`{{Efn|…}}` と `[[記事名|表示]]` はパイプを含む。**
        そのまま `split("|")` すると**セルが1つずれて試合が丸ごと落ちる**
        （第105回選手権のクラーク国際、第75回選抜の花咲徳栄が実際にこれ。
        **1試合欠けるだけで大会がまるごと落ちる**）。
      */
      const cleaned = stripTemplates(line)
        .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
        .replace(/<ref[^>]*\/>/g, "")
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
      // |日付|チームA|点A|チームB|点B
      const cells = cleaned.split("|").slice(1);
      if (cells.length < 5) continue;
      /*
        ★★**回戦の切り替えが、前の試合の行の末尾に紛れている記事がある**
        （2026年春の `|3月25日（2）|…|日本文理|0|RD3=準々決勝`）。
        ★**その試合はいまの回戦のまま読み、次の行から新しい回戦にする。**
        落とすと**準々決勝が2回戦として画面に出る。**
      */
      const inlineRd = cells
        .slice(5)
        .map((c) => c.match(/^\s*RD\d+\s*=\s*(.*)$/)?.[1]?.trim())
        .find((x) => x);
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
      if (inlineRd) round = inlineRd === "-" ? null : inlineRd;
    }
  }
  return games;
}

/**
 * 勝敗表（`wikitable`）を読む。★**「勝利」「敗戦」の列**なので、左が勝者。
 *
 * ------------------------------------------------------------------
 * ★★**回戦の出どころは2つある**（2026-08-26 に1つ足した）。
 *
 *   1. 節の見出し …… `=== 準々決勝 ===` の下に表が1つ（近年の記事）
 *   2. ★**表の中の帯** …… `=== 1回戦 - 準決勝 ===` の下に**1つの表**があり、
 *      その中で `!colspan="6"|2回戦` と回戦が切り替わる（1985年夏）
 *
 *   ★**行ごとに読む**（節を丸ごと切り出して正規表現に渡さない）。
 *   節を `[\s\S]*?\n\|\}` で切ると、**表の無い節が次の節の表まで飲み込み**、
 *   別の回戦の試合を取り込む。
 *
 * ------------------------------------------------------------------
 * ★★**同点は引き分け**（2026-08-26）。
 *
 *   列の見出しが「勝利」でも、**中身が `0 - 0` なら引き分け**である
 *   （1958年夏の準々決勝 徳島商 0-0 魚津・延長18回。翌日に再試合）。
 *   **列の名前だけを信じて勝者を決めると、引き分けが「勝ち」になり、
 *   再試合と合わせて相手が2敗**になって大会がまるごと落ちる。
 */
function readRoundTables(text) {
  const games = [];
  let round = null;
  let inTable = false;
  let winnerLeft = true;
  let md = null;

  for (const line of text.split("\n")) {
    // 節の見出し。回戦の名前ならその回戦、そうでなければ「回戦の外」
    const h = line.match(/^={2,4}\s*(.+?)\s*={2,4}\s*$/);
    if (h) {
      const name = h[1].replace(/\s/g, "");
      round = ROUND_ORDER.includes(name) || EXTRA_ROUNDS.has(name) ? name : null;
      md = null;
      continue;
    }
    if (/^\{\|/.test(line)) {
      inTable = true;
      winnerLeft = true;
      md = null;
      continue;
    }
    if (/^\|\}/.test(line)) {
      inTable = false;
      continue;
    }
    if (!inTable) continue;

    // 表の中の回戦の帯（表全体に渡る見出しセル）
    const band = line.match(/^!\s*colspan="?\d+"?\s*\|\s*(.+?)\s*$/);
    if (band) {
      const name = band[1].replace(/\s/g, "");
      if (ROUND_ORDER.includes(name) || EXTRA_ROUNDS.has(name)) round = name;
      md = null;
      continue;
    }
    // 列の見出し。★「勝利」が「敗戦」より左にあることを確かめる
    if (line.startsWith("!") && /勝利/.test(line) && /敗戦/.test(line)) {
      winnerLeft = line.indexOf("勝利") < line.indexOf("敗戦");
      continue;
    }
    if (!round || !winnerLeft || !line.startsWith("|")) continue;

    // rowspan の行に日付が入っている。以降の行はその日付を引き継ぐ
    const d = line.match(/(\d{1,2})月(\d{1,2})日/);
    if (d) md = [Number(d[1]), Number(d[2])];

    /*
      ★**セルの端のパイプを落とす。** 記事側に**パイプが1つ多い行**がある
      （第106回の準決勝は `|第1試合|||関東第一||2 - 1||…` で、
      そのままだと校名が `|関東第一` になり、**優勝校が2校いる**ことになって落ちた）。
    */
    const cells = line
      .replace(/^\|-?/, "")
      .split("||")
      .map((c) =>
        c
          .trim()
          // ★セルの端のパイプと、`style="…"|` のような属性を落とす
          .replace(/^[a-z-]+="[^"]*"\s*\|/i, "")
          .replace(/^\|+|\|+$/g, "")
          .trim(),
      );
    const at = cells.findIndex((c) => /^\d{1,2}x?\s*[-−–]\s*\d{1,2}x?$/.test(c.replace(/\s/g, "")));
    if (at < 1) continue;
    const sc = cells[at].replace(/\s/g, "").split(/[-−–]/);
    const win = parseScore(sc[0]);
    const lose = parseScore(sc[1]);
    const winner = cleanName(cells[at - 1]);
    const loser = cleanName(cells[at + 1] ?? "");
    if (!win || !lose || !winner || !loser) continue;

    // ★同点は引き分け（どちらも勝者にしない）
    const drawn = win.score === lose.score;
    games.push({
      round,
      md,
      note: cleanName(cells[at + 2] ?? "") || null,
      teams: [
        { display: winner, score: win.score, won: !drawn, walkOff: win.walkOff },
        { display: loser, score: lose.score, won: false, walkOff: lose.walkOff },
      ],
    });
  }
  return games;
}

/**
 * 決勝の `{{Linescore}}` を読む。**決勝の節の中にあるものを全部。**
 *
 * ★★**決勝が引き分けだと、その年は Linescore が2つある**（2026-08-26）。
 * 1917年・1969年（松山商 0-0 三沢）・2006年（駒大苫小牧 1-1 早稲田実）がこれで、
 * **1つ目しか読んでいなかったため、決勝が引き分けのまま終わり**、
 * 「負けていない学校が2校いる」で**大会がまるごと落ちていた。**
 *
 * ★★**節の外の Linescore は読まない。** 「1回戦 - 3回戦」の節に
 * 名勝負のスコアを1つだけ載せている記事があり（2003年夏・2026年春）、
 * **それを決勝として読むと嘘になる。**
 */
function readFinals(text) {
  // 決勝の節の範囲を出す（`=== 決勝 ===` / `=== 決勝戦スコア ===`）
  const heads = [...text.matchAll(/^={2,4}\s*(.+?)\s*={2,4}\s*$/gm)];
  let from = -1;
  let to = text.length;
  for (let i = 0; i < heads.length; i++) {
    if (/^決勝/.test(heads[i][1].replace(/\s/g, ""))) {
      from = heads[i].index;
      to = heads[i + 1] ? heads[i + 1].index : text.length;
      break;
    }
  }
  // ★決勝の節が無い記事は、今までどおり最初の1つだけを決勝として読む
  const scope = from >= 0 ? text.slice(from, to) : text;

  const games = [];
  for (const m of scope.matchAll(/\{\{Linescore([\s\S]*?)\n\}\}/g)) {
    const get = (k) =>
      m[1].match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n]*)`))?.[1]?.trim() ?? null;
    const road = cleanName(get("Road") ?? "");
    const home = cleanName(get("Home") ?? "");
    const rr = parseScore(get("RR"));
    const hr = parseScore(get("HR"));
    if (!road || !home || !rr || !hr) continue;
    const d = (get("Date") ?? "").match(/(\d{1,2})月(\d{1,2})日/);
    games.push({
      round: "決勝",
      md: d ? [Number(d[1]), Number(d[2])] : null,
      // ★同点なら引き分け（再試合が続く）
      note: rr.score === hr.score ? "引き分け" : null,
      teams: [
        { display: road, score: rr.score, won: rr.score > hr.score, walkOff: rr.walkOff },
        { display: home, score: hr.score, won: hr.score > rr.score, walkOff: hr.walkOff },
      ],
    });
    if (from < 0) break;
  }
  return games;
}

/**
 * ★★**古い大会記事は「箇条書き」で試合を書いている**（2026-08-26 追加）。
 *
 *   === 1回戦 ===
 *   3月29日
 *   * 日大三 7 - 1 平安
 *   * 鎌倉学園 5 - 4 豊浦（延長11回）
 *
 * ★**左が勝者**（記事の書き方が全大会でそろっている）。
 * ★**ただし「左が勝者」を信じるだけにしない** —— **点数の大小と食い違ったら
 * その大会を1試合も出さない**（下の `readTournament` で落とす）。
 * 2つの手掛かりが一致することを要求するので、片方だけが壊れても気づける。
 *
 * ★**引き分けがある**（`岐阜商 1 - 1 愛知商（5回裏途中降雨引き分け）`）。
 * **同点は「勝者なし」**で出す。**0対0の引き分けも実在する**
 * （1962年選抜の 作新学院 0 - 0 八幡商・延長18回）ので、
 * **0を「空欄の読み落とし」と混同しないこと**（島根で87件やった轍）。
 *
 * ★**日付は2通り**。行として先に書かれている（`3月29日`）か、
 * 箇条書きの中に入っている（第1回の `* 8月18日  鳥取中 14 - 7 広島中`）。
 * ★**無ければ null のまま**。推測で埋めない。
 */
function readRoundLists(text) {
  const games = [];
  let round = null;
  let md = null;

  for (const raw of text.split("\n")) {
    // 節の見出しで回戦が切り替わる。回戦でない節に入ったら読むのをやめる
    const h = raw.match(/^={2,4}\s*(.+?)\s*={2,4}\s*$/);
    if (h) {
      const name = h[1].replace(/\s/g, "");
      round = ROUND_ORDER.includes(name) || EXTRA_ROUNDS.has(name) ? name : null;
      md = null;
      continue;
    }
    if (!round) continue;

    // 「3月29日」だけの行。以降の試合はこの日付
    const dateOnly = raw.trim().match(/^(\d{1,2})月(\d{1,2})日$/);
    if (dateOnly) {
      md = [Number(dateOnly[1]), Number(dateOnly[2])];
      continue;
    }

    // ★入れ子の箇条書き（`**`）は注記。試合ではない
    if (!raw.startsWith("*") || raw.startsWith("**")) continue;

    /*
      ★**先に注釈を落とす。** `（延長15回）<ref>試合時間4時間35分…</ref>` のように
      **括弧の外に脚注が続く行がある**（第38回選抜の準決勝）。
      落とさないと行の形が合わず、**本物の試合を1つ取りこぼす。**
    */
    const line = stripTemplates(raw)
      .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
      .replace(/<ref[^>]*\/>/g, "")
      /*
        ★★**試合がまるごとリンクの中に書かれている行がある**（2026-08-26）。
          * [[鹿児島実業対東海大相模延長15回|鹿児島実 5 - 4 東海大相模（延長15回）]]
        ★**ほどかないとその1試合だけ落ち、大会がまるごと出せなくなる**
        （第56回選手権＝1974年夏が実際にこれだった）。
      */
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .trim();

    /*
      ★★**成立しなかった試合は「括弧でくくって」書かれている**（2026-08-26）。

        * （岐阜商 1 - 0 甲陽中）（1回裏終了・降雨ノーゲーム）

      ★**ノーゲームは無効試合**なので、**試合として出さない**
      （出すと勝った学校が1つ増え、勝ち抜きの検算が落ちる。
      実際に第24回・第52回がこれで大会ごと落ちていた）。
      ★**校名で消さない。** 記事の書き方（先頭の括弧・注記のノーゲーム）で見る。
    */
    if (/^\*\s*[（(]/.test(line)) continue;
    if (/ノーゲーム|無効試合/.test(line)) continue;

    const m = line.match(
      /^\*\s*(?:(\d{1,2})月(\d{1,2})日\s+)?(\S+?)\s*(\d{1,2})(x|X|ｘ)?\s*[-－‐–—]\s*(\d{1,2})(x|X|ｘ)?\s*(\S+?)\s*(?:[（(](.+?)[)）])?\s*$/,
    );
    if (!m) continue;

    /*
      ★★**校名の後ろの括弧は2種類ある**（2026-08-26）。

        * 海星（長崎）2 - 0 海星（三重）   …… **同名の学校の書き分け（校名の一部）**
        * 今治西 4 - 3 静岡商（延長10回）  …… **試合の注記**

      ★**実データを数えて決めた**（全記事の行末の括弧は33種類）。
      注記は**必ず数字を含むか「再試合・敗者復活・引き分け・ノーゲーム・コールド」**で、
      校名側は都道府県名（長崎・三重）だけだった。
      ★**取り違えても嘘は出ない** —— どちらに倒しても**校名がずれて
      勝ち上がりの検算に落ち、その大会が出なくなる**だけで、
      **別の学校の戦績として出ることはない。**
    */
    const tail = m[9] ?? null;
    /*
      ★**校名の一部と見なすのは「4文字以内で、注記の語を含まないもの」だけ。**
      都道府県名（長崎・三重）はここに収まる。
      **長さで切らないと、「海草中の嶋清一が無安打無得点試合」のような
      文章まで校名に足してしまう**（第25回選手権で実際に起きた）。
    */
    const tailIsNote =
      tail !== null &&
      (tail.length > 4 || /[0-9０-９]|再試合|敗者復活|引き分け|ノーゲーム|コールド/.test(tail));
    const nameA = cleanName(m[3]);
    const nameB = cleanName(tailIsNote || tail === null ? m[8] : `${m[8]}（${tail}）`);
    /*
      ★**校名の長さで文章の行を弾く。** 箇条書きの節には
      「*1回戦、大宮と対戦した報徳学園は…」のような**文章**も混ざる。
      ★**文字で消さない**（別の記事で別の文が出たときに効かない）。
      実データの校名はいちばん長いもので8文字。
    */
    if (!nameA || !nameB || nameA.length > 10 || nameB.length > 10) continue;

    const scoreA = Number(m[4]);
    const scoreB = Number(m[6]);
    games.push({
      round,
      md: m[1] ? [Number(m[1]), Number(m[2])] : md,
      note: tailIsNote ? cleanName(tail) : null,
      teams: [
        // ★左が勝者。**同点は引き分け**（どちらも勝者にしない）
        { display: nameA, score: scoreA, won: scoreA > scoreB, walkOff: Boolean(m[5]) },
        { display: nameB, score: scoreB, won: scoreB > scoreA, walkOff: Boolean(m[7]) },
      ],
      // ★下の検算用。**「左が勝者」と点数が食い違っていないか**を見る
      leftFirst: true,
    });
  }
  return games;
}

/** 回戦の深さ。浅い順 */
const ROUND_ORDER = ["1回戦", "2回戦", "3回戦", "準々決勝", "準決勝", "決勝"];

/**
 * 勝ち抜きの列には入らないが、**試合としては行われた**回戦。
 *
 * ★★**初期の大会には敗者復活戦がある**（1917年夏・1916年夏）。
 * **節の見出しが `==== 敗者復活戦 ====`** で、ここを回戦として認めないと
 * **その2試合が丸ごと落ち**、勝ち上がった学校が「前の回戦の勝者でない」ことになって
 * **大会がまるごと出せなくなる**（1917年夏が実際にこれだった）。
 * ★**3位決定戦も同じ扱い**（勝ち抜きの枝ではないが試合はある）。
 */
const EXTRA_ROUNDS = new Set(["3位決定戦", "敗者復活戦"]);

/**
 * 不戦勝・不戦敗の学校を読む。
 *
 * ★★**並びは記事によって逆になる**（2026-08-26）。
 *
 *   |'''津田学園'''（不戦勝）||広陵|      …… 勝者が先（第107回選手権）
 *   ||広島商||'''大阪桐蔭'''（不戦勝）|   …… **辞退した側が先**（第94回選抜）
 *
 * ★**「（不戦勝）が付いているほうが勝者、もう片方が辞退した側」**として読む。
 * 並びを決め打ちすると、**辞退した学校が「1度も負けていない学校」として残り、
 * 大会がまるごと落ちる**（第94回選抜＝2022年春が実際にこれだった）。
 *
 * ★**行の形で絞る**（パイプで始まり、セルが4つ以内）。
 * 本文の文章にも「不戦勝」は出てくるので、そこを拾わないため。
 */
function forfeitsOf(text) {
  const won = new Set();
  const lost = new Set();
  for (const line of text.split("\n")) {
    if (!line.startsWith("|") || !line.includes("（不戦勝）")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length > 4) continue;
    for (const c of cells) {
      const name = cleanName(c.replace("（不戦勝）", ""));
      if (!name || name.length > 10) continue;
      if (c.includes("（不戦勝）")) won.add(name);
      else lost.add(name);
    }
  }
  return { won, lost };
}


/**
 * その大会の「代表校」の表から **校名 → 都道府県** を読む。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-08-26）
 *
 *   大会記事の校名は略称なので、**別の県の同名校に当たる。**
 *   実際に **2003年夏の「金沢」（石川・私立）が、学校マスタの
 *   「金沢高校」＝横浜市立金沢（神奈川）に結び付いていた。**
 *   ★**画面に「この大会に出場した公立高校」として嘘が出るところだった。**
 *
 *   ★**代表校の表には都道府県が書いてある**ので、それを持っておけば
 *   「県が違うなら結び付けない」と言える。
 *   ★**取れない大会もある**（古い大会は「奥羽」「南関東」のような地区名）。
 *   **取れないときは今までどおり**（校名の完全一致だけ）。**推測で埋めない。**
 */
const PREFECTURE_NAMES = new Set(
  (
    "北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 " +
    "新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 " +
    "鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄 " +
    "北北海道 南北海道 東東京 西東京"
  ).split(" "),
);

function prefectureOfTeams(text, teams) {
  const found = new Map();
  for (const line of text.split("\n")) {
    if (!line.startsWith("|") || !line.includes("||")) continue;
    const cells = line.replace(/^\|-?/, "").split("||").map(cleanName);
    const school = cells.find((c) => teams.has(c));
    const pref = cells.find((c) => PREFECTURE_NAMES.has(c));
    if (school && pref && !found.has(school)) found.set(school, pref);
  }
  /*
    ★**出場校が箇条書きの記事もある**（1994年春など）。
      * [[金沢高等学校|金沢]]（[[石川県|石川]]、2年連続6回目）
    ★**表と同じで、県が取れる行だけ拾う。**
  */
  for (const line of text.split("\n")) {
    if (!line.startsWith("*")) continue;
    const cleaned = cleanName(line.replace(/^[*\s]+/, ""));
    const at = cleaned.indexOf("（");
    if (at <= 0) continue;
    const school = cleaned.slice(0, at);
    if (!teams.has(school) || found.has(school)) continue;
    const inside = cleaned.slice(at + 1).split(/[、,）]/)[0];
    if (PREFECTURE_NAMES.has(inside)) found.set(school, inside);
  }
  return found;
}


/** 1大会を読む。**検算に落ちたら null**（その大会は1試合も出さない） */
function readTournament(entry, summary) {
  // ★脚注を先に落とす（中に {{Linescore}} が入っている記事がある）
  const t = stripNotes(stripRefs(entry.wikitext ?? ""));
  /*
    ★★**紙の形は4つある**（2026-08-26 に2つ足した）。
    どれか1つの記事に2つ以上の形が同居しているので、**全部読んでから重ねを落とす。**

      1. `{{Round8 seed}}` などのブラケット …… 近年の記事
      2. `=== 準々決勝 ===` の節や**表の中の帯**で回戦が分かる勝敗表（`readRoundTables`）
      3. ★**箇条書き** ………………………………… 1930〜1990年代の記事（`readRoundLists`）

    ★**重ねの判定は「回戦＋両校＋点数」**。校名の並びは読み手によって違う
    （ブラケットは紙の順・勝敗表は勝者が先）ので、**並べ替えてから比べる。**
    ★**点数を鍵に入れる**のは、**引き分け再試合が「同じ回戦・同じ顔合わせ」**に
    なるため。点数を外すと再試合が重ねと見なされて消える。
  */
  const seen = new Set();
  const games = [];
  const keyOf = (g) =>
    [
      g.round ?? "",
      ...g.teams.map((x) => `${x.display}:${x.score}`).sort(),
    ].join("|");
  for (const g of [
    ...readBracketTemplates(t),
    ...readRoundTables(t),
    ...readRoundLists(t),
  ]) {
    const k = keyOf(g);
    if (seen.has(k)) continue;
    seen.add(k);
    games.push(g);
  }
  // ★決勝は引き分け再試合があるので**複数返る**
  for (const final of readFinals(t)) {
    if (!seen.has(keyOf(final))) {
      seen.add(keyOf(final));
      games.push(final);
    }
  }
  if (!games.length) return null;

  /*
    ★**詰まったら `KOSHIEN_DEBUG=<大会名の一部>`。**
    読めた試合を回戦つきで全部出す（地方大会の `BRACKET_DEBUG` と同じ役割）。
  */
  if (process.env.KOSHIEN_DEBUG && entry.title.includes(process.env.KOSHIEN_DEBUG)) {
    console.log(`---- ${entry.title}: 読めた ${games.length} 試合`);
    for (const g of games) {
      console.log(
        `    [${g.round ?? '回戦なし'}] ${g.md ? g.md.join('/') : '日付なし'} ` +
          g.teams.map((x) => `${x.display} ${x.score}${x.won ? '○' : ''}`).join(' - ') +
          (g.note ? ` （${g.note}）` : ''),
      );
    }
  }

  /*
    ★★**回戦名は記事から取る。推測で埋めない**（2026-08-26）。

    以前は「名前の無い試合は1回戦だろう」と当てるつもりでいたが、
    **`RD1=` を読み落としていただけ**だった（上の `readBracketTemplates` の注記）。
    直したら**1,134試合に本物の回戦名が付き、回戦なしは0件**になった。
    ★**当てにいく前に、まず読めていない場所が無いかを疑うこと。**
    1988年春では、名前の無い試合の中に**1回戦と準々決勝が混ざっていた** ——
    「1回戦だろう」と当てていたら、**準々決勝が1回戦として画面に出ていた。**
  */

  /*
    ---- ★★検算0: 「左が勝者」と点数の大小が食い違わないこと ----

    箇条書きの記事は**勝った学校を左に書く**が、それを信じるだけにしない。
    **2つの手掛かり（並びと点数）が一致することを要求する**ので、
    片方が壊れている記事に当たったときに気づける。
    ★**同点は引き分け**なので咎めない（実在する。1962年選抜の 作新学院 0-0 八幡商）。
  */
  const reversed = games.filter(
    (g) => g.leftFirst && g.teams[0].score < g.teams[1].score,
  );
  if (reversed.length) {
    console.log(
      `  ⚠️ ${entry.title}: 箇条書きで負けた側が左に書かれている試合が ${reversed.length} 件ある。1試合も出さない`,
    );
    return null;
  }

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
  const forfeited = forfeitsOf(t).lost;
  const losses = new Map([...teams].map((x) => [x, 0]));
  for (const g of games) {
    /*
      ★★**引き分けは「負け」ではない**（2026-08-26）。
      勝者のいない試合で両校に1敗を付けると、**再試合で負けた側が2敗**になり、
      **大会がまるごと落ちる**（第1回選手権の 京都二中 1-1 和歌山中 がこれ）。
      ★**3位決定戦も数えない**（準決勝で負けた2校の試合なので、必ず2敗目になる）。
    */
    if (!g.teams.some((x) => x.won)) continue;
    if (g.round === "3位決定戦") continue;
    for (const x of g.teams) if (!x.won) losses.set(x.display, (losses.get(x.display) ?? 0) + 1);
  }
  const unbeaten = [...losses].filter(([, n]) => n === 0).map(([x]) => x);
  /*
    ★★**初期の大会には敗者復活戦がある**（2026-08-26。第2回・第3回選手権）。
    1回戦で負けた学校がもう一度出てくるので、**その学校は2敗しうる。**
    ★**「敗者復活」と紙に書いてある試合に出た学校だけ**2敗を許す
    （全体を緩めない。緩めると読み違えを見逃す）。
  */
  const revival = new Set(
    games
      // ★節の見出しが「敗者復活戦」の大会もあれば、注記に書いてある大会もある
      .filter((g) => /敗者復活/.test(g.round ?? "") || /敗者復活/.test(g.note ?? ""))
      .flatMap((g) => g.teams.map((x) => x.display)),
  );
  const manyLosses = [...losses].filter(([x, n]) => n > (revival.has(x) ? 2 : 1));
  /*
    ★**負けなしは「優勝校1つ」だけのはず。**
    ★**不戦勝で敗退した学校も0敗**になるので、そのぶんを見込む。
    ★**引き分け再試合があると両校が0敗の試合になる**が、再試合で決着するので数は変わらない。
  */
  const extraUnbeaten = unbeaten.filter((x) => !forfeited.has(x));
  /*
    ★★**敗者復活戦のある大会は、優勝校が1敗していることがある**（1917年夏の愛知一中）。
    1回戦で負けたあと敗者復活戦を勝ち上がって優勝しているので、**負けなしの学校は0校**になる。
    ★**緩めるのは「優勝校が敗者復活戦に出ている」ときだけ。**
  */
  const championName = games.find((g) => g.round === "決勝")?.teams.find((x) => x.won)?.display;
  const wantUnbeaten = championName && revival.has(championName) ? 0 : 1;
  if (extraUnbeaten.length !== wantUnbeaten) {
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
    // ★3位決定戦は勝ち抜きの枝ではない。回戦の連なりに混ぜない
    if (g.round === "3位決定戦") continue;
    const k = g.round ?? "";
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(g);
  }
  const rounds = ROUND_ORDER.filter((r) => byRound.has(r));
  const walkoverWinners = forfeitsOf(t).won;
  /*
    ★**敗者復活戦の勝者も「前の回戦の勝者ではない」形で次に出てくる**
    （第2回選手権の鳥取中。1回戦で負けたあと敗者復活戦を勝って準々決勝へ）。
    ★**不戦勝と同じ扱いで、その学校だけ許す。**
  */
  // ★敗者復活戦に出た2校とも、前の回戦の勝者ではない形で出てくる
  for (const x of revival) walkoverWinners.add(x);
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
  // ★代表校の表から都道府県を拾って添える（同名の別校に当てないため）
  const prefs = prefectureOfTeams(t, teams);

  return games.map((g) => ({
    // ★`leftFirst` は検算用の内部の印。生成物には出さない
    year,
    season: entry.season,
    no: entry.no,
    tournament: entry.title,
    round: g.round,
    date: g.md ? `${year}-${String(g.md[0]).padStart(2, "0")}-${String(g.md[1]).padStart(2, "0")}` : null,
    note: g.note,
    teams: g.teams.map((x) => ({
      display: x.display,
      ...(prefs.get(x.display) ? { pref: prefs.get(x.display) } : {}),
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
    /*
      ★★**参照表に無い大会も読む**（2026-08-26）。

      `koshien-tournaments.ts` は**別の生成物**（DBの種を作る流れで作られる）で、
      **199大会ぶんしか無い。** ここで「無ければ飛ばす」にしていたため、
      **第1回・第2回・第6回の選抜が、警告も出ないまま3大会欠けていた。**
      ★**参照表は警告に使うだけ**という決めごと（AGENTS.md）に、
      **存在の判定まで任せていたのが誤り。**
      ★**年は記事の Infobox（`|year = 1924`）から取れる。**
    */
    const year = sum?.year ?? Number(String(entry.wikitext ?? "").match(/\|\s*year\s*=\s*(\d{4})/)?.[1]);
    if (!year) {
      console.log(`  ⚠️ ${entry.title}: 年が分からない。1試合も出さない`);
      ng++;
      continue;
    }
    if (fromYear && year < fromYear) continue;
    const games = readTournament({ ...entry, year }, sum ?? null);
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

  // ★JSON。型は読む側（`src/lib/koshien-games.ts`）で1回だけ与える
  const file = JSON.stringify(out, null, 1) + "\n";
  writeFileSync(OUT, file, "utf8");
  console.log(`書き出した: ${path.relative(ROOT, OUT)}（${Math.round(file.length / 1024)}KB）`);
}

await main();
