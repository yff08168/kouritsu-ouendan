/**
 * 「やぐら表」から試合を組み立てる。**大阪のPDFのため**（2026-08-25）。
 *
 * ------------------------------------------------------------------
 * ★ これは `slot-bracket.mjs` とも `vector-bracket.mjs` とも別物
 *
 *   - `slot-bracket.mjs` … スロット番号の行と、スロット中心に置かれた得点から
 *     **座標で組み立てる**（京都・広島・三重・鹿児島ほか）
 *   - `vector-bracket.mjs` … 紙に**線として描かれた枝**を読む（富山・福岡）
 *   - **これ** … 紙が**勝ち上がりをそのまま刷っている**表を読む
 *
 *   ★**大阪の紙は「勝った学校を次の列にもう一度刷る」。**
 *   だから枝を推測する必要がない —— **どの学校がどこまで勝ったかが紙に書いてある。**
 *   組み立てで要るのは「同じ列の隣どうしが対戦相手」ということだけ。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（2025年夏で実測）
 *
 *   左半分は左端から中央へ、右半分は右端から中央へ勝ち上がる。
 *
 *       堺西        0 ┐
 *       岸和田産    4 ┴ 岸和田産  0 ┐
 *                      東大阪大柏原 10 ┴ 東大阪大柏原 8 …
 *
 *   - **得点はその学校がその列の試合で取った点**
 *   - 校名は得点に向かって寄せて組まれる（左半分は右寄せ・右半分は左寄せ）
 *   - **列＝回戦**。外側から 1回戦・2回戦…と数える
 *   - ★**いちばん内側の列は左右とも1件**で、その2件が決勝
 *
 * ------------------------------------------------------------------
 * ★★ なぜこの形が信用できるか（検算）
 *
 *   1. ★**勝った学校は次の列に必ず現れ、負けた学校は現れない。**
 *      **紙の外の数字を使わない不変条件**なので、参照データの誤りに巻き込まれない。
 *      組を1つでも取り違えれば、必ずどこかで破れる。
 *   2. **列の件数が2で割り切れる**（いちばん内側を除く）。
 *   3. ★**紙に「チーム数」が刷ってある。** 勝ち抜き戦なので **試合数 = チーム数 − 1**。
 *   4. ★**紙に「優勝」の校名が刷ってある**年がある。決勝の勝者と突き合わせる。
 *
 *   ★**1つでも合わなければ、その大会は1試合も出さないこと**（このリポジトリ共通）。
 */

/** 数字だけの断片か */
const isNum = (t) => /^\d+$/.test(String(t).trim());

/**
 * やぐら表を組み立てる。
 *
 * @param {{y:number,items:{x:number,width:number,text:string}[]}[]} lines
 *   `pdfPages()` が返す1ページぶんの行。
 *   ★★**行は `pdf-text.mjs` の組み分け（3pt）をそのまま使うこと。**
 *   **大阪の紙は行送りが 6.1pt だが、3.6pt しか離れていない行もある**ので、
 *   「同じ y の幅」を広げて組み直すと**別の行の校名が隣に来て側の判定が狂う**
 *   （実際に左半分の 34 件が落ちた）。
 * @param {object} [opts]
 * @param {number} [opts.orphanY=4.5] 得点と校名が別の行に割れているときに、
 *   となりの行まで探しにいく y の差。
 *   ★**紙のいちばん下で、校名だけが 3.2pt 下の行に落ちている**ことがある。
 *   **既定は「行送り 6.1 は拾わず 3.2 は拾う」値。** 探すのは
 *   **校名の見つからなかった得点だけ**なので、正しく読めている行には影響しない。
 * @param {number} [opts.nameGap=60] 得点と校名のあいだに許す隙間。
 *   離れた文字（中央の凡例など）を校名として拾わないための歯止め。
 *   ★★**きつくしすぎないこと。** 校名は列に合わせて組まれるが**得点は桁数で位置が動く**ので、
 *   **短い校名ほど隙間が広くなる**（大阪の1回戦は `堺西` で31pt・`柴島…` で9pt）。
 *   30 にしていたときは**左半分の34件が落ちた。**
 *   ★中央の凡例までは300pt以上あるので、60でも巻き込まない。
 * @param {number} [opts.columnGap=5] 同じ列とみなす端の差。
 * @param {number} [opts.center] 左右の境目。省くと断片の x の中点。
 * @param {boolean} [opts.debug]
 * @returns {{games:Array,rounds:number,teams:string[],errors:string[]}}
 */
export function assembleYaguraBracket(lines, opts = {}) {
  const orphanY = opts.orphanY ?? 4.5;
  const nameGap = opts.nameGap ?? 60;
  const colGap = opts.columnGap ?? 5;
  const errors = [];
  const log = (...a) => opts.debug && console.log("   [yagura]", ...a);

  /*
    ★★**見出しの行を落とす**（2026-08-25）。
    `（参加校数 168　チーム数 155）…（7月6日～7月28日）` の **168 と 155 が
    試合として読まれ**、`チーム数 165 - 0 上宮` という決勝が出た（実際に出た）。
    ★**行ごと落とす。文字で消さない**（千葉で「宣」を巻き込んだのと同じ轍）。
  */
  const skip = opts.ignoreLines ?? /参加校|チーム数|主催|後援/;
  const rows = lines
    .filter((l) => !skip.test(String(l.text ?? l.items.map((i) => i.text).join(""))))
    .map((l) => ({
      y: l.y,
      items: l.items
        .filter((i) => String(i.text).trim() !== "")
        .map((i) => ({ x: i.x, width: i.width ?? 0, text: String(i.text).trim(), y: l.y }))
        .sort((a, b) => a.x - b.x),
    }))
    .filter((r) => r.items.length);
  const all = rows.flatMap((r) => r.items);
  if (!all.length) return { games: [], rounds: 0, teams: [], errors: ["断片が1つも無い"] };
  const xs = all.map((i) => i.x);
  const center = opts.center ?? (Math.min(...xs) + Math.max(...xs)) / 2;

  /* ------------------------------------------------------------------
     1. 得点ごとに「どちら側か」と「その校名」を決める

     ★**中央で左右を割るだけでは決勝が読めない。**
     決勝は `東大阪大柏原 6 | 5 大阪桐蔭` と**中央をまたいで並ぶ**ので、
     左の得点（x=587）が中点（585）より右に来る。

     ★**校名と得点の並び順で決める。**
     左半分は「校名→得点」、右半分は「得点→校名」なので、
     **となりが数字かどうか**を見れば、中点を使わずに決まる。
     どちらもとなりが校名のときだけ中点で決める。
  ------------------------------------------------------------------ */
  /** 得点 n から `dir` の向きへ、数字に当たるまで校名の断片を集める */
  const nameFrom = (n, dir, pool) => {
    const line = pool
      .filter((i) => i !== n && (dir < 0 ? i.x + i.width <= n.x : i.x >= n.x + n.width))
      .sort((a, b) => (dir < 0 ? b.x - a.x : a.x - b.x));
    const parts = [];
    let edge = dir < 0 ? n.x : n.x + n.width;
    for (const i of line) {
      if (isNum(i.text)) break;
      const gap = dir < 0 ? edge - (i.x + i.width) : i.x - edge;
      if (gap > nameGap) break;
      parts.push(i);
      edge = dir < 0 ? i.x : i.x + i.width;
    }
    if (!parts.length) return null;
    if (dir < 0) parts.reverse();
    return parts.map((p) => p.text).join("").replace(/\s+/g, "");
  };

  const entries = [];
  const orphans = [];
  for (const row of rows) {
    for (const n of row.items) {
      if (!isNum(n.text)) continue;
      const leftNb = row.items.filter((i) => i.x < n.x).at(-1);
      const rightNb = row.items.filter((i) => i.x > n.x)[0];
      const leftIsNum = leftNb ? isNum(leftNb.text) : null;
      const rightIsNum = rightNb ? isNum(rightNb.text) : null;

      let side;
      if (leftIsNum === false && rightIsNum === true) side = "L";
      else if (leftIsNum === true && rightIsNum === false) side = "R";
      else side = n.x < center ? "L" : "R";

      const dir = side === "L" ? -1 : 1;
      const name = nameFrom(n, dir, row.items);
      if (name) {
        entries.push({ y: n.y, score: Number(n.text), name, edge: side === "L" ? n.x + n.width : n.x, side });
      } else {
        orphans.push({ n, side, dir });
      }
    }
  }

  /*
    ★**校名だけが別の行に落ちている得点を拾い直す**（2025年夏の紙で1件）。
    **となりの行まで見るのは、この「校名が見つからなかった得点」だけ。**
    正しく読めた行には触れないので、既に組めている表は1件も変わらない。
  */
  let rescued = 0;
  /** 校名の見つからなかった数字。★決勝の得点がここに残る（下の「決勝」） */
  const leftovers = [];
  for (const o of orphans) {
    const near = all.filter((i) => i !== o.n && Math.abs(i.y - o.n.y) <= orphanY);
    const name = nameFrom(o.n, o.dir, near);
    if (!name) {
      leftovers.push(o);
      continue;
    }
    entries.push({
      y: o.n.y,
      score: Number(o.n.text),
      name,
      edge: o.side === "L" ? o.n.x + o.n.width : o.n.x,
      side: o.side,
    });
    rescued += 1;
  }
  if (rescued) log(`校名が別の行に落ちていた得点を ${rescued} 件拾い直した`);
  if (leftovers.length) log(`校名の付かない数字が ${leftovers.length} 件`);

  /* ------------------------------------------------------------------
     2. 列に束ねる。★**外側から内側の順に並べる**（それが回戦の順）
  ------------------------------------------------------------------ */
  const columnsOf = (side) => {
    const es = entries.filter((e) => e.side === side).sort((a, b) => a.edge - b.edge);
    const cols = [];
    for (const e of es) {
      const last = cols.at(-1);
      if (last && Math.abs(e.edge - last.at(-1).edge) <= colGap) last.push(e);
      else cols.push([e]);
    }
    // 左は左端が1回戦、右は右端が1回戦
    return side === "L" ? cols : cols.reverse();
  };
  const cols = { L: columnsOf("L"), R: columnsOf("R") };
  log(
    "列 L:",
    cols.L.map((c) => `x${c[0].edge.toFixed(0)}:${c.length}`).join(" "),
    "／ R:",
    cols.R.map((c) => `x${c[0].edge.toFixed(0)}:${c.length}`).join(" "),
  );

  if (cols.L.length !== cols.R.length)
    errors.push(`左右の列数が違う（左 ${cols.L.length} 列・右 ${cols.R.length} 列）`);
  const rounds = Math.max(cols.L.length, cols.R.length);
  if (rounds < 2) errors.push(`列が ${rounds} つしかない`);

  /* ------------------------------------------------------------------
     3. 列ごとに、紙の上から隣どうしを組にする

     ★**いちばん内側の列は左右とも1件**で、その2件が決勝。
  ------------------------------------------------------------------ */
  const games = [];
  for (const side of ["L", "R"]) {
    cols[side].forEach((col, k) => {
      const sorted = [...col].sort((a, b) => b.y - a.y);
      /*
        ★**1件だけの列は「決勝に出た校の得点」**で、その列に試合は無い（形 (a)）。
        下の「決勝」で組む。
      */
      if (k === cols[side].length - 1 && sorted.length === 1) return;
      if (sorted.length % 2)
        errors.push(`${side} の ${k + 1} 列目が ${sorted.length} 件（偶数のはず）`);
      for (let i = 0; i + 1 < sorted.length; i += 2)
        games.push({ round: k + 1, side, a: sorted[i], b: sorted[i + 1] });
    });
  }
  /* ------------------------------------------------------------------
     4. 決勝

     ★★**決勝の組まれ方が年で2通りある。**

       (a) 校名が横に組まれている（2025年夏）
             … 東大阪大柏原 6 │ 5 大阪桐蔭 …
           **いちばん内側の列が左右とも1件**になり、その2件がそのまま決勝。

       (b) ★**校名が中央に縦書き**で、決勝の行には得点しか無い（2025年春）
             … 大体大浪商 10 │ 6   2 │ 4 履正社 …
                              大 履
                              阪 正
                              桐 社
                              蔭
           **いちばん内側の列は左右とも2件**（＝準決勝）になり、
           中央の `6` と `2` は**校名の付かない数字**として余る。

     ★★**縦書きの校名は読まない。** 準決勝の勝者が決勝に出るのは
     **勝ち抜き戦の定義そのもの**なので、**両者は列から決まる。**
     中央に余った数字を、その2校の得点として左右で割り当てるだけでよい。
     ★**縦書きを読みにいくと、字の並べ方の当て推量が入る**（このリポジトリの他の県で
     何度も踏んでいる）。**読まずに済むなら読まない。**
  ------------------------------------------------------------------ */
  const innerL = cols.L.at(-1);
  const innerR = cols.R.at(-1);
  if (!innerL || !innerR) {
    errors.push("決勝が読めない（中央の列が無い）");
  } else if (innerL.length === 1 && innerR.length === 1) {
    games.push({ round: rounds, side: "F", a: innerL[0], b: innerR[0] });
  } else if (innerL.length === 2 && innerR.length === 2) {
    // (b) 準決勝の勝者どうし。得点は中央に余った数字から
    const winnerOf = (col) => {
      const [a, b] = [...col].sort((x, y2) => y2.y - x.y);
      return a.score === b.score ? null : a.score > b.score ? a : b;
    };
    const wl = winnerOf(innerL);
    const wr = winnerOf(innerR);
    const spare = leftovers
      .filter((o) => o.n.x > innerL[0].edge && o.n.x + o.n.width < innerR[0].edge)
      .sort((a, b) => a.n.x - b.n.x);
    /*
      ★**同じ行に並ぶ2つだけを決勝とみなす。** 中央には「優勝」の見出しや
      年度の一覧も刷られているので、**離れた数字を拾うと嘘の決勝が出る。**
    */
    const pair =
      spare.length >= 2
        ? spare.find(
            (o, i) => spare[i + 1] && Math.abs(spare[i + 1].n.y - o.n.y) <= orphanY,
          )
        : null;
    const second = pair ? spare[spare.indexOf(pair) + 1] : null;
    if (!wl || !wr) errors.push("準決勝の勝者が決まらない（同点）");
    else if (!pair || !second) errors.push("決勝の得点が中央に見つからない");
    else
      games.push({
        round: rounds + 1,
        side: "F",
        a: { ...wl, score: Number(pair.n.text) },
        b: { ...wr, score: Number(second.n.text) },
      });
  } else {
    errors.push(
      `決勝が読めない（中央の列が 左${innerL.length}件・右${innerR.length}件。1件ずつか2件ずつのはず）`,
    );
  }

  /* ------------------------------------------------------------------
     4. ★★検算: 勝った学校は次の列に現れ、負けた学校は現れない

     ★**紙の外の数字を使わない。** 組を1つでも取り違えれば必ず破れる。
  ------------------------------------------------------------------ */
  for (const side of ["L", "R"]) {
    cols[side].forEach((col, k) => {
      const next = cols[side][k + 1];
      if (!next) return;
      const nextNames = new Set(next.map((e) => e.name));
      const sorted = [...col].sort((a, b) => b.y - a.y);
      for (let i = 0; i + 1 < sorted.length; i += 2) {
        const [a, b] = [sorted[i], sorted[i + 1]];
        if (a.score === b.score) {
          errors.push(`${side}${k + 1}回戦: ${a.name} と ${b.name} が同点（勝者が決まらない）`);
          continue;
        }
        const win = a.score > b.score ? a : b;
        const lose = a.score > b.score ? b : a;
        if (!nextNames.has(win.name))
          errors.push(`${side}${k + 1}回戦: 勝った ${win.name} が次の列にいない`);
        if (nextNames.has(lose.name))
          errors.push(`${side}${k + 1}回戦: 負けた ${lose.name} が次の列にいる`);
      }
    });
  }

  const teams = [...new Set(cols.L.flatMap((c) => c.map((e) => e.name)).concat(cols.R.flatMap((c) => c.map((e) => e.name))))];
  /*
    出場チーム数は「1回戦に出た校＋2回戦から出た校」。
    ★**シード（不戦）があるので、1回戦の数からは出ない。**
    次の列に「前の列の勝者でない名前」がいれば、それがその回戦からの出場。
  */
  let entrants = 0;
  for (const side of ["L", "R"]) {
    cols[side].forEach((col, k) => {
      if (k === 0) {
        entrants += col.length;
        return;
      }
      const prev = [...cols[side][k - 1]].sort((a, b) => b.y - a.y);
      const winners = new Set();
      for (let i = 0; i + 1 < prev.length; i += 2) {
        const [a, b] = [prev[i], prev[i + 1]];
        winners.add((a.score > b.score ? a : b).name);
      }
      entrants += col.filter((e) => !winners.has(e.name)).length;
    });
  }

  return { games, rounds, teams, entrants, errors, columns: cols };
}
