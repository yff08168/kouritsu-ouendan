/**
 * PDFのトーナメント表を「**描いてある枝の線**」から読む。
 *
 * ------------------------------------------------------------------
 * ★★ これは「座標から組み立てる」話ではない
 *
 *   このリポジトリはトーナメント表を原則として出典にしないと決めている
 *   （石川で「検算を通ったのに決勝の相手が違う」を作った）。
 *   例外にした県（京都・広島・三重・鹿児島・滋賀・和歌山・兵庫・沖縄）は
 *   `slot-bracket.mjs` で**座標から枝の形を推測して**組み立てていて、
 *   **そこが危ないところだった。**
 *
 *   ★**この読み方は違う。枝が線として紙に描いてある。**
 *   福岡（`svg-bracket.mjs`）がSVGでやっていることの、PDF版。
 *
 *     赤の縦線 … 勝った側の枝
 *     黒の縦線 … 負けた側の枝
 *     2本が合流するところが、その試合の「次の回戦へ出ていく線」
 *
 *   ★**縦線が「どの枝とどの枝が1試合になるか」をそのまま書いている。**
 *   推測が要らないので、**シードが何回戦にいても関係がない。**
 *   `slot-bracket.mjs` は「毎回全員が組になる」を前提にしていて、
 *   **2回戦以降のシードがあると必ず落ちる**（富山は実際にそうなっている）。
 *
 * ------------------------------------------------------------------
 * ★★ 実データで踏んだところ（2026-08-24。富山の選手権で確かめた）
 *
 *   1. ★★**線は `stroke` ではなく `eoFill`**（塗りつぶし図形）で描かれている。
 *      `setStrokeRGBColor` を見ても色が取れない。**`setFillRGBColor` を追うこと。**
 *   2. ★★**線の太さは 2.52pt。** 「太さ 2pt 未満」で絞ると**1本も当たらない。**
 *   3. ★★**赤と黒はぴったり接するとは限らない。**
 *      **合流点に横線が入ると、線の太さぶん（2.52）空く**（富山は右半分がこれ）。
 *      許容を 1.2pt にすると**右半分の8試合が1つも組めない。**
 *      同じ列で試合どうしは 13pt 以上離れているので 3.0 でも取り違えない。
 *   4. ★★**左右の校名は同じ行に並ぶ。** 行をそのままつなぐと
 *      `高岡` ＋ `富山いずみ` ＝ `高岡富山いずみ` になる。**列で分けてから読む。**
 *   5. ★★**回戦は「試合の深さ」ではなく列の位置で決まる。**
 *      不戦勝（抽選シード）があるので深さで数えると
 *      **「2回戦から出た2校の対戦」が1回戦になる**（実際になった）。
 *   6. ★★**連合チームは校名が2行に組まれる**（`富山西` の下に `富山南`）。
 *      **2行目には枝の横線が無い**ので、そこで見分けられる。
 *      ★**行の間隔で決めないこと** —— 連合の2行目と隣のスロットは同じ間隔で並ぶ。
 *
 * ------------------------------------------------------------------
 * ★ 呼ぶ側は必ず検算すること
 *
 *   返り値の `games` を、**枝とは別の場所から来る事実**と突き合わせる。
 *   富山では次の4つが効いた（**4つとも通ってから採用した**）:
 *
 *     - 出場校数（Wikipedia「全国高等学校野球選手権富山大会」の `校数`）
 *     - 回戦ごとの試合数の算数（1回戦の校数から導ける）
 *     - **優勝校と決勝スコア**（同上の `優勝校` / `決勝スコア`）
 *     - 勝ち抜きの不変条件（**優勝校以外はちょうど1回だけ負ける**）
 *
 *   ★**1つでも合わなければ、その大会を1試合も出さないこと。**
 */
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/** 線の太さの上限（実測 2.52）。★2 にすると1本も当たらない */
const THICK = 3;
/** 合流点とみなす隙間の上限。★線の太さぶん空くことがある */
const JOIN_GAP = 3.0;
/** 同じ列とみなす x の差（赤と黒は 0.8 ずれて描かれる） */
const COL = 2.5;

/**
 * PDFから「塗りつぶしで描かれた図形」を色つきで取り出す。
 *
 * ★**`constructPath` の第1引数が描画命令そのもの。**
 * `endPath`（28）はクリップなので捨てる。線は `eoFill` で来る。
 */
export async function readFilledShapes(bytes, { pageNumber = 1 } = {}) {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const names = new Map(Object.entries(OPS).map(([k, v]) => [v, k]));

  let fill = null;
  const shapes = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const n = names.get(ops.fnArray[i]);
    const a = ops.argsArray[i];
    if (n === "setFillRGBColor") fill = Array.isArray(a) ? a[0] : a;
    if (n !== "constructPath" || names.get(a[0]) !== "eoFill") continue;
    // args[2] は minMax（[minX, minY, maxX, maxY]）
    const [x1, y1, x2, y2] = Array.from(Object.values(a[2])).map(Number);
    shapes.push({ color: String(fill).toLowerCase(), x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 });
  }
  return shapes;
}

/**
 * 枝の線から対戦を組み立てる。
 *
 * @param shapes        `readFilledShapes` の結果
 * @param page          `pdfPages` の1ページぶん（校名とスコアを読むのに使う）
 * @param winnerColor   勝った側の色（既定 `#ff0000`）
 * @param nameXLeft     これより左が「左half の校名の列」
 * @param nameXRight    これより右が「右half の校名の列」
 * @param centerX       左half と右half の境目
 * @param roundNames    回戦の呼び名（外側から順に）
 */
export function assembleVectorBracket({
  shapes,
  page,
  winnerColor = "#ff0000",
  nameXLeft,
  nameXRight,
  centerX,
  roundNames = ["1回戦", "2回戦", "3回戦", "準々決勝", "準決勝", "決勝"],
}) {
  const isWin = (s) => s.color === winnerColor;
  const horiz = shapes.filter((s) => s.h < THICK && s.w >= 4);
  const vert = shapes.filter((s) => s.w < THICK && s.h >= 4);

  // --- 縦線を列にまとめる（赤と黒は 0.8pt ずれる） ---
  const columns = [];
  for (const v of vert) {
    let c = columns.find((c) => Math.abs(c.x - v.x1) < COL);
    if (!c) columns.push((c = { x: v.x1, items: [] }));
    c.items.push(v);
  }
  columns.sort((a, b) => a.x - b.x);

  // --- 同じ列で合流点を共有する「勝ち色」と「負け色」の対 ＝ 1試合 ---
  const matches = [];
  for (const c of columns) {
    const wins = c.items.filter(isWin);
    const loses = c.items.filter((s) => !isWin(s));
    const used = new Set();
    for (const w of wins) {
      for (const l of loses) {
        if (used.has(l)) continue;
        const variants = [
          [w.y1, l.y2, w.y2, l.y1],
          [w.y2, l.y1, w.y1, l.y2],
        ];
        const hit = variants.find(([a, b]) => Math.abs(a - b) < JOIN_GAP);
        if (!hit) continue;
        const [ja, jb, winY, loseY] = hit;
        matches.push({ x: c.x, join: (ja + jb) / 2, winY, loseY });
        used.add(l);
        break;
      }
    }
  }

  const sideOf = (m) => (m.x < centerX ? "L" : "R");

  /**
   * ★★**決勝だけは描き方が違う。**
   *
   *   他の回戦は「縦線で2つの枝をつなぐ」形だが、**決勝は左右の山から
   *   伸びてきた2本の横線が中央で出会う**（縦線の対にならない）。
   *   ★**勝った側の横線が赤。**
   *
   *     赤 y=342.3 x=271.7→298.3   ← 左の山の代表（この年の優勝校）
   *     黒 y=343.3 x=298.3→322.3   ← 右の山の代表
   *
   *   ★**2026年の紙では決勝が未実施**（枝が黒のまま）だったので、
   *   **この経路を一度も通していなかった。**
   *   過去の年（決着した大会）を読んで初めて出てきた。
   */
  function findFinal() {
    const pageX = shapes.reduce((m, s) => Math.max(m, s.x2), 0);
    // 中央の三分の一だけを見る。ふつうの回戦の枝を拾わないため
    const lo = pageX * 0.4;
    const hi = pageX * 0.6;
    for (const a of horiz) {
      for (const b of horiz) {
        if (a === b) continue;
        // 左の右端と右の左端が接している
        if (Math.abs(a.x2 - b.x1) > 1.5) continue;
        if (a.x2 < lo || a.x2 > hi) continue;
        if (Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > JOIN_GAP) continue;
        // 勝ち色と負け色が1本ずつ。**両方同じ色なら決勝ではない**
        if (isWin(a) === isWin(b)) continue;
        return { meet: a.x2, y: (a.y1 + a.y2) / 2, left: a, right: b };
      }
    }
    return null;
  }

  /**
   * 1行ぶんの断片を校名にする。
   *
   * ★★**紙の隙間を潰さないこと。** 校名は枠の幅いっぱいに**均等割り付け**
   *   されるので、**字送りは文字数で決まる**（4文字なら狭く、2文字なら広い）。
   *   **その字送りより広い隙間は「区切り」**で、連合チームを意味する。
   *
   *     `富 山` ＋ `雄 山`  … 隙間 11.5 / 字の幅 8.1 → **区切り**（富山・雄山の連合）
   *     `富|山|第|一`       … 隙間 7.2  / 字の幅 9.6 → 区切りではない（富山第一）
   *     `高` ＋ `岡`        … 隙間 40.9 / 字の幅 9.6 → 隙間は広いが**1文字ずつ**
   *
   *   ★**ここでは空白を入れるだけにして、連合かどうかの判断はしない。**
   *   呼ぶ側の `isCombinedTeam` が「空白区切りで各語が2文字以上なら連合」で
   *   決める（神奈川の「寒川 藤沢総合 深沢 厚木清南」と同じ規則）。
   *   **`高 岡` は1文字ずつなので連合にならず、空白は表示前に詰められる。**
   *   ★**「・」を補わないこと**（どこが切れ目かを字間から推測することになる。
   *   三重で決めた規則）。**空白のまま渡して、既にある判定に委ねる。**
   */
  function readName(items) {
    if (!items.length) return "";
    // 字送り。★**断片の中の空白も1文字ぶんの枠を持つ**ので、文字数で割る
    const charW = Math.max(...items.map((i) => i.width / Math.max(1, i.text.length)));
    // ★**断片の中の飾りの空白は落とす**（`富 山` → `富山`）。
    //   残すのは**断片と断片のあいだの、字送りより広い隙間**だけ
    let out = items[0].text.replace(/\s+/g, "");
    for (let k = 1; k < items.length; k++) {
      const gap = items[k].x - (items[k - 1].x + items[k - 1].width);
      out += (gap > charW ? " " : "") + items[k].text.replace(/\s+/g, "");
    }
    out = out.trim();
    /*
      ★**残した空白が「区切り」に見えないなら、それも飾りだった。**
      2文字の校名は枠いっぱいに広げて組まれるので（`高　　岡`）、
      隙間だけ見ると区切りと区別が付かない。
      **`isCombinedTeam` と同じ規則**（各語が2文字以上なら区切り）でふるいにかけ、
      当たらなければ詰める。**`上 市` が `上市` に戻るのはここ。**
    */
    const parts = out.split(" ");
    if (parts.length >= 2 && !parts.every((p) => p.length >= 2)) return parts.join("");
    return out;
  }

  // --- 校名（★左右は同じ行に並ぶので列で分ける） ---
  const teams = [];
  for (const line of page.lines) {
    for (const [side, items] of [
      ["L", line.items.filter((i) => i.x < nameXLeft)],
      ["R", line.items.filter((i) => i.x > nameXRight)],
    ]) {
      const t = readName(items);
      if (!/^[一-龥ぁ-んァ-ヶー々Ａ-ＺA-Z・\s]+$/.test(t) || !t) continue;
      teams.push({ y: line.y, name: t, side });
    }
  }

  // --- ★連合チーム: 枝の横線が無い行は、すぐ上の行の続き ---
  const hasSlotLine = (t) =>
    horiz.some(
      (h) =>
        Math.abs((h.y1 + h.y2) / 2 - t.y) < 4 &&
        (t.side === "L" ? h.x1 < nameXLeft + 10 : h.x2 > nameXRight - 10),
    );
  for (const t of teams) {
    if (hasSlotLine(t)) continue;
    const host = teams
      .filter((o) => o.side === t.side && o.y > t.y && hasSlotLine(o))
      .sort((a, b) => a.y - b.y)[0];
    if (host) host.name += `・${t.name}`;
  }

  // --- スコア（数字） ---
  const digits = [];
  for (const line of page.lines) {
    for (const it of line.items) {
      const t = it.text.trim();
      if (/^\d{1,2}$/.test(t)) digits.push({ y: line.y, x: it.x, n: Number(t) });
    }
  }

  /**
   * ★**縦線は横線の上端まで伸びるので、校名までの許容は線の太さぶん広く要る**
   * （富山の右half は 4.3 ずれた）。行の間隔は 13pt 以上あるので隣は拾わない。
   */
  const NAME_TOL = 5.5;
  const teamAt = (y, side) =>
    teams
      .filter((t) => t.side === side && Math.abs(t.y - y) < NAME_TOL)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0] ?? null;

  /**
   * その y に合流する、いまの列より外側の試合（＝前の回戦から上がってきた）。
   *
   * ★★**いちばん近い列を選ぶこと。「最初に見つかったもの」ではない。**
   *
   *   同じ y に**別の回戦の枝が並ぶ**ことがある。実際に2025年の富山で、
   *   決勝の行（y=342.3）に3回戦の枝（x=163〜185）が重なっており、
   *   **決勝の左の代表が「不二越工業」になった**（正しくは未来富山）。
   *   ★**検算（チーム数−試合数=1）は通ってしまう。**
   *   石川で踏んだ「構造は合うのに相手が違う」と同じ壊れ方で、
   *   **Wikipediaの決勝スコアと突き合わせて初めて分かった。**
   */
  const feeding = (y, x, side) => {
    const cands = matches.filter(
      (m) => Math.abs(m.join - y) < JOIN_GAP && (side === "L" ? m.x < x - COL : m.x > x + COL),
    );
    if (!cands.length) return null;
    // 左half なら x が大きいほど内側、右half なら小さいほど内側
    return cands.sort((a, b) => (side === "L" ? b.x - a.x : a.x - b.x))[0];
  };

  function nameAt(y, x, side, depth = 0) {
    if (depth > 12) return null;
    const fed = feeding(y, x, side);
    if (fed) return nameAt(fed.winY, fed.x, side, depth + 1);
    return teamAt(y, side)?.name ?? null;
  }

  // --- ★回戦は列の位置で決まる（深さではない） ---
  const colsOf = (side) => {
    const xs = [...new Set(matches.filter((m) => sideOf(m) === side).map((m) => m.x))];
    return side === "L" ? xs.sort((a, b) => a - b) : xs.sort((a, b) => b - a);
  };
  const cols = { L: colsOf("L"), R: colsOf("R") };

  /** 合流点と相手の線のあいだ、列のすぐ内側にある数字 */
  function scoreBetween(m, y) {
    const lo = Math.min(m.join, y);
    const hi = Math.max(m.join, y);
    const side = sideOf(m);
    const cand = digits.filter(
      (d) =>
        d.y > lo - 1 &&
        d.y < hi + 1 &&
        (side === "L" ? d.x > m.x && d.x < m.x + 32 : d.x < m.x && d.x > m.x - 32),
    );
    if (!cand.length) return null;
    cand.sort((a, b) => Math.abs(a.y - (lo + hi) / 2) - Math.abs(b.y - (lo + hi) / 2));
    return cand[0].n;
  }

  const games = matches.map((m) => {
    const side = sideOf(m);
    const round = cols[side].findIndex((x) => Math.abs(x - m.x) < COL) + 1;
    return {
      round,
      roundName: roundNames[round - 1] ?? null,
      winner: nameAt(m.winY, m.x, side),
      loser: nameAt(m.loseY, m.x, side),
      winnerScore: scoreBetween(m, m.winY),
      loserScore: scoreBetween(m, m.loseY),
    };
  });

  /*
    ★決勝を足す。**左右それぞれの山をここまで辿って校名を出す。**
    スコアは中央の左右に置かれている（左の得点は合流点より左、右は右）。
  */
  const final = findFinal();
  if (final) {
    const round = Math.max(0, ...games.map((g) => g.round)) + 1;
    const near = (from, to) =>
      digits
        .filter((d) => Math.abs(d.y - final.y) < 8 && d.x > from && d.x < to)
        .sort((p, q) => Math.abs(p.y - final.y) - Math.abs(q.y - final.y))[0]?.n ?? null;
    const leftName = nameAt(final.y, final.meet, "L");
    const rightName = nameAt(final.y, final.meet, "R");
    const leftScore = near(final.meet - 34, final.meet);
    const rightScore = near(final.meet, final.meet + 34);
    const leftWon = isWin(final.left);
    games.push({
      round,
      roundName: roundNames[round - 1] ?? null,
      winner: leftWon ? leftName : rightName,
      loser: leftWon ? rightName : leftName,
      winnerScore: leftWon ? leftScore : rightScore,
      loserScore: leftWon ? rightScore : leftScore,
    });
  }

  games.sort((a, b) => a.round - b.round);

  const names = new Set(games.flatMap((g) => [g.winner, g.loser]).filter(Boolean));
  return {
    games,
    teamCount: names.size,
    /** 組み立てられなかった（校名かスコアが欠けた）試合 */
    broken: games.filter(
      (g) => !g.winner || !g.loser || g.winnerScore == null || g.loserScore == null,
    ),
  };
}
