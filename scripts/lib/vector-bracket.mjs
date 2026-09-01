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
 *
 * ★★**`fill` で描いてある紙もある**（2026-08-30。愛知）。既定は `eoFill` だけ
 * （富山と同じ）で、**`ops` を渡した県だけが増える。**
 * ★**両方を既定にしないこと** —— 富山の紙は `fill` の図形も持っており、
 * 既定を広げると**その県の枝の読み方が変わる**（生成物が動く）。
 */
export async function readFilledShapes(bytes, { pageNumber = 1, ops: want = ["eoFill"] } = {}) {
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
    if (n !== "constructPath" || !want.includes(names.get(a[0]))) continue;
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
 *
 * @param teams ★★**校名を呼ぶ側が作って渡す**（2026-08-30。愛知）。既定は `null`
 *   （今までどおり、このファイルが枝の横線から校名の行を見つける）。
 *
 *   ★**横線から見つける作りは、連合チームの校名が2行に組まれた紙で落ちる。**
 *   愛知の紙は**スロット番号の行のちょうど上下に1行ずつ**校名が組まれることがあり
 *   （`緑丘・東海学園` ／ `・春日井泉`）、**どちらの行にも横線が無い**ので
 *   **その学校が丸ごと消え、2試合が「相手が読めない」で壊れた。**
 *
 *   ★**愛知の紙はスロット番号の列を持っている**ので、
 *   **どの高さが1校ぶんかは推測ではなく読み取りで決まる。**
 *   呼ぶ側がそれを使って `[{ y, name, side }]` を作って渡す。
 *   ★**渡されたときは、このファイルは校名を1文字も組み立てない**
 *   （連合チームの結合もしない。呼ぶ側の責任）。
 */
export function assembleVectorBracket({
  shapes,
  page,
  winnerColor = "#ff0000",
  nameXLeft,
  nameXRight,
  centerX,
  teams: givenTeams = null,
  /** 枝の線から校名の行までの許容（既定は富山で決めた 5.5）。下の `NAME_TOL` を読むこと */
  nameTol = 5.5,
  /**
   * ★**「その行に枝の横線があるか」を見るときの許容**（既定は富山で決めた 4）。
   * 連合チームの2行目（＝枝の線が無い行）を見分けるのに使う。
   * **下の `hasSlotLine` の説明を読むこと。**
   */
  slotLineTol = 4,
  /** 得点が枝の線に載っている紙のための、列より外側の許容（下の scoreBetween を読むこと） */
  scoreBack = 0,
  /*
    ★★★**得点が「列の外側」に右揃えで刷ってある紙がある**（2026-09-01 その4。愛知の2016年春季）。

        左half  列 123.8 / 152.6 / 181.6 / 210.9 / 240.0
                得点 119.7 / 148.8 / 177.6 / 205.4 / 234.4   ← **列より 4〜5.6 左**
        右half  列 450.2 / 420.9 / 391.9 / 362.8 / 334.0
                得点 451.2 / 422.1 / 393.3 / 364.5 / 335.5   ← **列より 1〜1.7 右**

    ★**どちらも「外側」** —— 得点は腕の先（＝列）に寄せて刷ってあり、
    断片の x は箱の左端なので、左half では列より左に出る。
    ★**既定（内側へ 32）のままだと左half の得点が1つも窓に入らず、
    代わりに1つ内側の回戦の得点を拾う**（実測：50試合中14試合が壊れ、
    読めた試合も中身が別の回戦の得点だった）。

    ★**内側へどこまで見るかを紙ごとに渡せるようにした。既定の 32 は変えていない。**
    ★**列の間隔は 29 あるので、8 にすれば隣の回戦の得点は絶対に入らない。**
  */
  scoreAhead = 32,
  /*
    ★★★**1試合の2つの得点は、合流点をはさんで同じだけ離して刷ってある**
    （2026-09-01 その4。愛知の春季・秋季で実測）。

        2016年春 準決勝  合流点 419.9 ｜ 3(y=270.9 → 149.0)  2(y=570.4 → 150.5)   ← 差 1.5
        2017年秋 3回戦   合流点 683.4 ｜ 10(y=686.3 → 2.9)   2(y=674.0 → 9.4)     ← 差 6.5

    ★★**「行のそば」でも「合流点のそば」でもない** —— **紙によってどちらにもなる**
    （2016年春の準決勝は行のそば、2017年秋の3回戦は合流点のそば）。
    **揃っているのは「2つの離れかたが同じ」ことだけ。**

    ★★★**これが要るのは、準決勝の枝が決勝の行まで伸びているから** ——
    **決勝の得点が準決勝の窓に入り、しかも x がほとんど同じ**
    （2016年春: 準決勝の得点 x=234.4／決勝の左の得点 x=234.7）。
    ★**離れかたで見ると必ず外れる** ——
    決勝の得点は合流点から 20.4 で、相手側の 150.5 と揃わない。
    ★**これを入れる前は「枝の中ほどに近いほう」で決まっており、
    2015年春は 0.4 ポイントの差でたまたま正しく読めていた。**

    ★**片側に候補が1つも無ければ、その試合は得点を出さない**
    （紙に刷られていない。当てない）。
    ★**既定は false。渡さなければこの道は一度も通らない**ので、富山も愛知の他の紙も変わらない。
  */
  scorePairs = false,
  /**
   * ★**得点を選ぶとき、列の近さを高さより先に見る**（下の `scoreBetween` を読むこと）。
   * ★**列の間隔が狭くて、窓が隣の回戦まで届く紙のためのもの**（富山）。既定は `false`。
   */
  scoreNearestColumn = false,
  /*
    ★**決勝の得点が線からどれだけ離れているか**（既定は富山で決めた 8）。
    愛知の春季・秋季は**出会う点から伸びる縦線のわきに 16.8 離して**置かれており、
    既定のままだと**決勝の得点が2つとも読めない。**
    ★**準決勝の得点は x で外れる**ので、広げても取り違えない。
  */
  finalScoreReach = 8,
  /*
    ★★**決勝の横線が左右とも勝ち色で、しかも真ん中が描かれていない紙がある**
    （2026-08-31。愛知の2017年春季）。**色でも接点でも勝った側が決まらない。**

        赤 406.1→484.4 ｜ ← 28.2 の空き → ｜ 赤 512.6→566.8      （y=680.2）
        赤の縦線 x=481.9 y=680.2→743.7                          ← 空きの左端に垂れている

    ★★**垂れている縦線（stem）が勝った側の目印。**
    ★**これは推測ではなく、読めている年の紙と同じ描き方**である ——
    2024年春の紙は `赤 251.8→296.3 ｜ 黒 296.3→310.0 ｜ 赤 310.0→340.8` と
    3本に分かれており、**縦線は色の変わり目（296.3）に垂れていて、
    そこへ届いているほうの赤（左）が優勝校**（享栄）だった。
    2017年春は**真ん中の黒が刷られていないだけ**で、縦線の役割は同じ。

    ★**既定は `false`。** 渡さなければこの道は一度も通らないので、
    富山も、色で決まる愛知の年も1バイトも変わらない。
    ★**色で決まる紙ではそちらが優先**（この道は `findFinal()` が空のときだけ）。
  */
  finalByStem = false,
  /** stem で読んだ決勝の得点だけ、線からの許容を変えたいとき（既定は finalScoreReach） */
  finalScoreReachStem = null,
  /** 左右の腕のあいだに許す空き（stem で読むときだけ使う） */
  finalGapMax = 40,
  /*
    ★★★**決勝が「左右とも勝ち色・真ん中が空いていて、そこに優勝校が縦書き」の紙**
    （2026-09-01。愛知の2016年秋）。

        赤 245.8→281.0 ｜ ← 34.4 の空き（`優勝 中京大中京` が縦書き）→ ｜ 赤 315.4→351.7
        得点は空きをまたいで  0(x=252)              5(x=339)

    ★**色でも stem でも勝った側が決まらない**（stem は1本も垂れていない）。
    ★★**しかも、この紙は3位決定戦のほうが「赤と黒が接している」**ので、
    **色で決まる `findFinal()` がそちらを決勝として拾う**（実際に拾った）。

    ★★**決め手は2つとも紙に描いてある**:
      ① **決勝の腕はいちばん内側の回戦の列から伸びている**（3位決定戦の腕は違う列）
      ② **勝った側は得点で決まる**

    ★**既定は `false`。渡さなければこの道は一度も通らない**ので、
    富山も、スロット番号の列がある愛知の年も1バイトも変わらない。
    ★**得点が同じ／読めないときは決勝を出さない** —— 当てると別の学校が優勝校になる。
    出さなければ呼ぶ側の「チーム数 − 試合数 = 1」に落ちて大会ごと出ないので、
    **嘘は画面に出ない。**
  */
  finalByScore = false,
  /*
    ★★★**決勝の左右が「勝ち色と負け色」なのに、真ん中が空いている紙がある**
    （2026-09-01 その4。愛知の2015・2016年の春季）。**4つ目の形。**

        2015年春  黒 244.5→273.0 ｜ ← 33.2 の空き（`中部大第一 初優勝` が縦書き）→ ｜ 赤 306.2→335.9
        2016年春  赤 240.4→269.2 ｜ ← 33.4 の空き（`優勝 享栄` が縦書き）→ ｜ 黒 302.6→333.8

    ★**色は刷ってあるので、勝った側は色で決まる**（`finalByStem` や `finalByScore` は要らない）。
    **足りないのは「接していること」を求めない、それだけ。**
    ★★**既定は 0。渡さなければこの道は一度も通らない**ので、
    富山も、接している紙（2018年以降の愛知・2016年秋）も1バイトも変わらない。
    ★**接している対が1つでもあれば、そちらを今までどおり使う**（後回しにする）。
    ★**空いている対が2つ以上あるときは決勝を出さない** —— 当てると別の学校が優勝校になる。
  */
  finalColorGap = 0,
  /*
    ★**決勝の得点を探す横の幅**（既定は富山・愛知で決めた 34）。
    ★**空きをまたいで置かれる紙では届かない** —— 2016年秋は
    合流点 298.2 に対し得点が 252 と 339（46.2 と 40.8 離れている）。
  */
  finalScoreSpan = 34,
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

  /*
    ★★**1本の枝が途中で切れて2本になっている紙がある**（2026-08-30。愛知の第106回Aブロック）。

    負けた側の黒い枝が `246.0〜216.3` と `216.3〜201.8` の2本に分かれて描かれており、
    **短いほうだけが赤と対になって、合流点が 216.3 だと読まれていた**
    （本当は 201.8 で、負けた学校の行は 246.0）。
    ★**その1試合が壊れるだけでなく、余った1本が別の試合として数えられ、
    大会の試合数まで増えていた。**

    ★**同じ列・同じ色で端が接している線は、もともと1本。** 先につないでおく。
    ★**別の試合の枝どうしが接することはない**（同じ列の試合は 13pt 以上離れている）。
    ★**富山は1本も分かれていないので、生成物は変わらない**（確認済み）。
  */
  for (const c of columns) {
    for (const color of new Set(c.items.map((s) => s.color))) {
      const same = c.items.filter((s) => s.color === color).sort((a, b) => a.y1 - b.y1);
      for (let i = 1; i < same.length; i++) {
        if (same[i].y1 - same[i - 1].y2 > JOIN_GAP) continue;
        const merged = { ...same[i - 1], y2: Math.max(same[i - 1].y2, same[i].y2) };
        merged.h = merged.y2 - merged.y1;
        c.items[c.items.indexOf(same[i - 1])] = merged;
        c.items.splice(c.items.indexOf(same[i]), 1);
        same[i] = merged;
      }
    }
  }

  // --- 同じ列で合流点を共有する「勝ち色」と「負け色」の対 ＝ 1試合 ---
  const matches = [];
  for (const c of columns) {
    const wins = c.items.filter(isWin);
    const loses = c.items.filter((s) => !isWin(s));
    const used = new Set();
    const paired = new Set();
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
        paired.add(w);
        break;
      }
    }
    /*
      ★★**相手の縦線の長さが 0 になる試合がある**（2026-08-30。愛知の第105回Dブロック）。

      合流点（勝った枝が次の回戦へ出ていく高さ）が、**負けた側の横線と
      ちょうど同じ高さ**のときは、負けた側の縦線が引かれない。
      愛知は**連合チームの校名が2行に組まれてスロットの行がずれた**ところで起きていた。

      ★**そのままだと、その試合が1つ見つからず**、勝ち上がりが途切れて
      **2試合が「相手が読めない」で壊れる**（実測でその大会が丸ごと落ちていた）。

      ★**2校の高さは、縦線の両端がそのまま指している。**
      **反対の色の横線が来ている端が負けた側**（横線の色は「その試合に勝ったか」を表す）。
      ★★**合流点は端ではない。** この紙では**勝った枝が次の回戦へ出ていく横線**が
      縦線の途中から伸びている（実測 317.1〜346.7 の縦線に対し、出ていくのは 331.9）。
      **端を合流点にすると、次の回戦がこの試合に繋がらず、そこも壊れる。**
      ★**推測ではなく、紙に描いてある「この列から右へ出ていく横線」を読んでいる。**
      ★**対になった縦線が見つかったものには触らない**ので、富山は1試合も変わらない。
    */
    for (const w of c.items) {
      if (paired.has(w) || used.has(w)) continue;
      const at = (y, want) =>
        horiz.some(
          (h) =>
            isWin(h) === want &&
            Math.abs((h.y1 + h.y2) / 2 - y) < JOIN_GAP &&
            Math.abs(h.x2 - c.x) < COL + 2,
        );
      // 負けた側 ＝ 「負け色の横線」が来ている端。両側・どちらも無しなら決められない
      const ends = [w.y1, w.y2].filter((y) => at(y, false));
      if (ends.length !== 1) continue;
      const loseY = ends[0];
      const winY = loseY === w.y1 ? w.y2 : w.y1;
      if (!at(winY, true)) continue;
      // この列から右へ出ていく横線（＝勝った枝）の高さが合流点
      const out = horiz
        .filter(
          (h) =>
            isWin(h) &&
            Math.abs(h.x1 - c.x) < COL + 2 &&
            (h.y1 + h.y2) / 2 > Math.min(winY, loseY) &&
            (h.y1 + h.y2) / 2 < Math.max(winY, loseY),
        )
        .map((h) => (h.y1 + h.y2) / 2);
      matches.push({ x: c.x, join: out.length === 1 ? out[0] : loseY, winY, loseY });
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
    const found = [];
    // ★**真ん中が空いている対**（`finalColorGap` を渡した紙だけ。上の説明を読むこと）
    const gapped = [];
    for (const a of horiz) {
      for (const b of horiz) {
        if (a === b) continue;
        // 左の右端と右の左端が接している
        const touching = Math.abs(a.x2 - b.x1) <= 1.5;
        const gap = b.x1 - a.x2;
        if (!touching && !(finalColorGap > 0 && gap > 1.5 && gap <= finalColorGap)) continue;
        if (a.x2 < lo || a.x2 > hi) continue;
        if (Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > JOIN_GAP) continue;
        // 勝ち色と負け色が1本ずつ。**両方同じ色なら決勝ではない**
        if (isWin(a) === isWin(b)) continue;
        const f = { meet: touching ? a.x2 : (a.x2 + b.x1) / 2, y: (a.y1 + a.y2) / 2, left: a, right: b };
        (touching ? found : gapped).push(f);
      }
    }
    // ★**空いている対は、接している対が1つも無いときだけ・1つに決まるときだけ使う**
    if (!found.length) return gapped.length === 1 ? gapped[0] : null;
    /*
      ★★★**決勝の横線が3本に分かれている紙がある**（2026-08-30。愛知の春季・秋季）。

          赤 247.5→278.3 ／ 黒 278.3→294.6 ／ 赤 294.6→340.5

      **色の変わり目が2つできる**ので、上の探し方だと**どちらが出会う点か決められない。**
      ★**先に見つかったほう（278.3）を採ると、勝った側が左右あべこべになる**
      （実際に、右の山の享栄が勝った決勝で「中部大春日丘が勝った」と読んだ）。

      ★★**優勝校の枝は、出会う点から縦に伸びている。**
      愛知は `x=293.4 y=430.3〜468.4` の赤い縦線がそれで、**294.6 のほうにだけ接している。**
      ★**推測ではなく、紙に描いてある線を見て決めている。**
      ★**縦線が無ければ今までどおり先に見つかったものを使う**ので、富山は変わらない
      （富山の決勝は横線が2本で、出会う点が1つしか無い）。
    */
    const withStem = found.filter((f) =>
      vert.some(
        (v) => Math.abs(v.x1 - f.meet) < COL && (Math.abs(v.y1 - f.y) < JOIN_GAP || Math.abs(v.y2 - f.y) < JOIN_GAP),
      ),
    );
    return withStem[0] ?? found[0];
  }

  /**
   * ★★**真ん中が描かれていない決勝を、垂れている縦線（stem）から読む。**
   *   上の `finalByStem` の説明を読むこと。**`finalByStem` のときだけ呼ぶ。**
   *
   * ★**勝った側は「stem に届いているほうの腕」。** 色は見ない（左右とも勝ち色なので）。
   * ★**両方に届く／どちらにも届かないときは決勝を出さない** ——
   *   当てると別の学校が優勝校になる。出さなければ
   *   「チーム数 − 試合数 = 1」に落ちて大会ごと出さないので、**嘘は画面に出ない。**
   */
  function findFinalByStem() {
    const pageX = shapes.reduce((m, s) => Math.max(m, s.x2), 0);
    const lo = pageX * 0.4;
    const hi = pageX * 0.6;
    const found = [];
    for (const a of horiz) {
      for (const b of horiz) {
        if (a === b) continue;
        const gap = b.x1 - a.x2;
        if (gap <= 1.5 || gap > finalGapMax) continue;
        if (a.x2 < lo || a.x2 > hi) continue;
        if (Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > JOIN_GAP) continue;
        // ★**両方とも勝ち色の腕だけ。** 片方が負け色なら上の色で決まる探し方が拾う
        if (!isWin(a) || !isWin(b)) continue;
        const y = (a.y1 + a.y2) / 2;
        const stemAt = (x) =>
          vert.some(
            (v) =>
              isWin(v) &&
              Math.abs(v.x2 - x) < COL &&
              (Math.abs(v.y1 - y) < JOIN_GAP || Math.abs(v.y2 - y) < JOIN_GAP),
          );
        const [l, r] = [stemAt(a.x2), stemAt(b.x1)];
        if (l === r) continue;
        found.push({ meet: l ? a.x2 : b.x1, y, left: a, right: b, leftWon: l });
      }
    }
    // ★**1つに決まらなければ出さない**（紙に複数の候補があるなら読み違えている）
    return found.length === 1 ? found[0] : null;
  }

  /**
   * ★★**左右とも勝ち色で、真ん中が空いている決勝**（`finalByScore`。上の説明を読むこと）。
   * ★**勝った側は下で得点から決める。** ここでは場所だけ返す。
   * ★**いちばん内側の列から伸びている腕だけ**を見るので、3位決定戦は当たらない。
   */
  function findFinalByScore() {
    const found = [];
    for (const a of horiz) {
      for (const b of horiz) {
        if (a === b) continue;
        const gap = b.x1 - a.x2;
        if (gap <= 1.5 || gap > finalGapMax) continue;
        if (Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) > JOIN_GAP) continue;
        if (!isWin(a) || !isWin(b)) continue;
        found.push({ meet: (a.x2 + b.x1) / 2, y: (a.y1 + a.y2) / 2, left: a, right: b, byScore: true });
      }
    }
    // ★**1つに決まらなければ出さない**（当てると別の学校が優勝校になる）
    return found.length === 1 ? found[0] : null;
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
  // ★呼ぶ側が作って渡したときは、そのまま使う（上の `teams` の説明を読むこと）
  const teams = givenTeams ?? [];
  if (!givenTeams) {
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
    /*
      ★★★**枝の線と校名の行のずれは紙で違う**（2026-09-01 その2。愛知の2016年春季）。
      既定の 4 に対し、この紙は **4.6〜4.8** ずれている。
      ★**そのままだと「枝の線が無い行」＝連合チームの2行目と見なされ、
      前の学校の校名にくっつく**（`横須賀・刈谷` `名経大高蔵・豊川・東海学園`）。
      **50試合のうち41試合が壊れていた。**
      ★**既定は 4 のまま**（富山・スロット番号のある愛知は1バイトも変わらない）。
      ★**行の間隔の半分より小さい値を渡すこと**（隣の行を拾う）。
    */
    const hasSlotLine = (t) =>
      horiz.some(
        (h) =>
          Math.abs((h.y1 + h.y2) / 2 - t.y) < slotLineTol &&
          (t.side === "L" ? h.x1 < nameXLeft + 10 : h.x2 > nameXRight - 10),
      );
    for (const t of teams) {
      if (hasSlotLine(t)) continue;
      const host = teams
        .filter((o) => o.side === t.side && o.y > t.y && hasSlotLine(o))
        .sort((a, b) => a.y - b.y)[0];
      if (host) host.name += `・${t.name}`;
    }
  }

  // --- スコア（数字） ---
  /*
    ★★★**得点が全角の紙がある**（2026-09-01 その2。愛知の2015・2016年の春季）。

        東邦(78.9)  ６(148.8)  ４(422.1)  愛知啓成(480.4)     ← 全角
        …           8(393.3)   ３(422.1)                      ← **同じ行に半角と全角が混ざる**

    ★**`\d` は全角に当たらない**ので、**その試合の得点が丸ごと読めず**
    「壊れ」として大会ごと落ちていた（50試合中41試合）。
    ★**半角に寄せてから見る。** これで拾えるようになるのは
    **これまで1つも読めていなかった全角の数字だけ**なので、
    読めている紙の結果は変わらない（富山・愛知を再生成して確かめてある）。
  */
  const digits = [];
  for (const line of page.lines) {
    for (const it of line.items) {
      const t = it.text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
      if (/^\d{1,2}$/.test(t)) digits.push({ y: line.y, x: it.x, n: Number(t) });
    }
  }

  /**
   * ★**縦線は横線の上端まで伸びるので、校名までの許容は線の太さぶん広く要る**
   * （富山の右half は 4.3 ずれた）。行の間隔は 13pt 以上あるので隣は拾わない。
   *
   * ★★**紙によっては、いちばん端の行だけ枝の線と校名が 6.4 ずれる**
   * （2026-08-30。愛知の第103回Bブロックの最後のスロット）。
   * 既定のままだと**その学校だけ「読めない」になり、勝ち上がりが途切れて
   * 3試合が壊れる。** `nameTol` で紙ごとに渡せるようにしてある。
   * ★**行の間隔の半分より小さい値にすること**（隣の行を拾う）。
   */
  const NAME_TOL = nameTol;
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

  /**
   * 合流点と相手の線のあいだ、列のすぐ内側にある数字。
   *
   * ★★**得点が枝の線にちょうど載っている紙がある**（2026-08-30。愛知の春季・秋季）。
   * そこは**球場と得点が1つの断片**（`春日井② 7`）になっており、
   * 断片の中の位置は**幅を文字数で割って見積もる**しかない。
   * ★**全角と半角が混じると見積もりが数ポイントずれる**ので、
   * 「列より内側」を厳密に求めると**その得点だけ読めない**（実測で11試合が壊れた）。
   * `scoreBack` で紙ごとに数ポイントぶん外側まで見に行けるようにしてある。
   * ★**列の間隔は 30 ポイント以上あるので、数ポイントでは隣の回戦を拾わない。**
   */
  function scoreBetween(m, y) {
    const lo = Math.min(m.join, y);
    const hi = Math.max(m.join, y);
    const side = sideOf(m);
    const cand = digits.filter(
      (d) =>
        d.y > lo - 1 &&
        d.y < hi + 1 &&
        (side === "L"
          ? d.x > m.x - scoreBack && d.x < m.x + scoreAhead
          : d.x < m.x + scoreBack && d.x > m.x - scoreAhead),
    );
    if (!cand.length) return null;
    /*
      ★★★**同じ高さに隣の回戦の得点が並ぶことがある**（2026-08-30 その2。富山の第107回）。

          y=116.6 に  x=426.4「8」（2回戦の列）と x=448.8「0」（1回戦の列）

      **高さでは差が付かない**ので、どちらを採るかが `digits` の並び順まかせになり、
      **隣の回戦の得点を拾っていた** —— 実際に `高岡工芸 2-8 高岡龍谷` と出ていた
      （紙は `2` 対 `0`。**勝った側の得点のほうが少ない**という形で表に出る）。
      ★**高さが同じなら、いまの回戦の列に近いほうを採る。** 推測ではなく列の位置。
      ★**高さで差が付くときの結果は変わらない**ので、愛知は1バイトも変わらない（確認済み）。
    */
    /*
      ★★★**列の近さを先に見る紙がある**（2026-09-01 その5。富山）。

      富山の紙は**列の間隔が 22 しかない**ので、既定の窓（内側へ 32）が
      **隣の回戦の列まで届く。** 高さで先に選ぶと、**隣の回戦の得点のほうが
      「枝の中ほど」に近いことがあり、そちらを拾う**（実測2件）:

          3回戦 高岡商業 3 - **5** 高岡        ← 紙は 3 - 1（5 は準々決勝の列 381.1 から）
          3回戦 南砺福野 **0 - 0** 不二越工業  ← 紙は 7 - 0（5回コールドの試合）

      ★**窓を締めると、今度は得点が列から離れている試合が読めなくなる**
      （紙によって離れかたが違う）ので、**窓ではなく選び方を変える。**
      ★**列に近いほうを先に見る。** 同じ列に2つ並ぶことは無いので、
      **同じ距離のときだけ今までどおり高さで決める。**
      ★**既定は false。渡さなければ1バイトも変わらない**（愛知は窓を締めてあるので影響が無い）。
    */
    cand.sort((a, b) =>
      scoreNearestColumn
        ? Math.abs(a.x - m.x) - Math.abs(b.x - m.x) ||
          Math.abs(a.y - (lo + hi) / 2) - Math.abs(b.y - (lo + hi) / 2)
        : Math.abs(a.y - (lo + hi) / 2) - Math.abs(b.y - (lo + hi) / 2) ||
          Math.abs(a.x - m.x) - Math.abs(b.x - m.x),
    );
    return cand[0].n;
  }

  /**
   * ★★**1試合の2つの得点をまとめて読む**（`scorePairs`。上の説明を読むこと）。
   * ★**合流点からの離れかたがいちばん揃う組**を採る。
   * ★**片側に候補が無ければ、その試合は得点を出さない。**
   */
  function scorePair(m) {
    const side = sideOf(m);
    const arm = (y) => {
      const lo = Math.min(m.join, y);
      const hi = Math.max(m.join, y);
      return digits.filter(
        (d) =>
          d.y > lo - 1 &&
          d.y < hi + 1 &&
          (side === "L"
            ? d.x > m.x - scoreBack && d.x < m.x + scoreAhead
            : d.x < m.x + scoreBack && d.x > m.x - scoreAhead),
      );
    };
    const [w, l] = [arm(m.winY), arm(m.loseY)];
    if (!w.length || !l.length) return { win: null, lose: null };
    let best = null;
    for (const a of w) {
      for (const b of l) {
        const gap = Math.abs(Math.abs(a.y - m.join) - Math.abs(b.y - m.join));
        // ★**揃いが同じなら、いまの回戦の列に近い組**（`scoreBetween` と同じ考え）
        const far = Math.abs(a.x - m.x) + Math.abs(b.x - m.x);
        if (!best || gap < best.gap - 0.01 || (Math.abs(gap - best.gap) <= 0.01 && far < best.far)) {
          best = { gap, far, win: a.n, lose: b.n };
        }
      }
    }
    return { win: best.win, lose: best.lose };
  }

  const games = matches.map((m) => {
    const side = sideOf(m);
    const round = cols[side].findIndex((x) => Math.abs(x - m.x) < COL) + 1;
    return {
      /*
        ★**枝の位置も返す**（2026-08-30。愛知）。日付・球場は**その試合の縦線の
        すぐ外側**に刷られているので、呼ぶ側が拾うのに要る。
        ★**足しただけ**で、富山は見ていない。
      */
      x: m.x,
      winY: m.winY,
      loseY: m.loseY,
      round,
      roundName: roundNames[round - 1] ?? null,
      winner: nameAt(m.winY, m.x, side),
      loser: nameAt(m.loseY, m.x, side),
      winnerScore: scorePairs ? scorePair(m).win : scoreBetween(m, m.winY),
      loserScore: scorePairs ? scorePair(m).lose : scoreBetween(m, m.loseY),
    };
  });

  /*
    ★決勝を足す。**左右それぞれの山をここまで辿って校名を出す。**
    スコアは中央の左右に置かれている（左の得点は合流点より左、右は右）。
  */
  /*
    ★★★**決勝は「いちばん深い回戦の勝者2校の対戦」でなければならない**
    （`finalByScore` のときだけ見る。2026-09-01。愛知の2016年秋）。

    この紙は**3位決定戦のほうが赤と黒で接している**ので、
    色で決まる `findFinal()` がそちらを決勝として拾う。
    ★**しかも「チーム数 − 試合数 = 1」を通ってしまう**（実際に通った）。
    ★**枝の形から決まる条件で弾く** —— 3位決定戦に出るのは
    **準決勝で負けた2校**なので、この条件に必ず落ちる。
  */
  const deepest = Math.max(0, ...games.map((g) => g.round));
  const deepWinners = new Set(games.filter((g) => g.round === deepest).map((g) => g.winner));
  const validFinal = (f) => {
    if (!f) return false;
    /*
      ★**`finalColorGap` を渡した紙でも見る**（2026-09-01 その4）——
      空きを許すと、決勝でない対（3位決定戦など）まで候補に入りうるため。
    */
    if (!finalByScore && !finalColorGap) return true;
    const l = nameAt(f.y, f.meet, "L");
    const r = nameAt(f.y, f.meet, "R");
    return Boolean(l) && Boolean(r) && l !== r && deepWinners.has(l) && deepWinners.has(r);
  };
  const pick = (f) => (validFinal(f) ? f : null);
  const final =
    pick(findFinal()) ??
    (finalByStem ? pick(findFinalByStem()) : null) ??
    (finalByScore ? pick(findFinalByScore()) : null);
  if (final) {
    const round = Math.max(0, ...games.map((g) => g.round)) + 1;
    const reach = final.leftWon === undefined ? finalScoreReach : (finalScoreReachStem ?? finalScoreReach);
    const near = (from, to) =>
      digits
        .filter((d) => Math.abs(d.y - final.y) < reach && d.x > from && d.x < to)
        .sort((p, q) => Math.abs(p.y - final.y) - Math.abs(q.y - final.y))[0]?.n ?? null;
    const leftName = nameAt(final.y, final.meet, "L");
    const rightName = nameAt(final.y, final.meet, "R");
    const leftScore = near(final.meet - finalScoreSpan, final.meet);
    const rightScore = near(final.meet, final.meet + finalScoreSpan);
    /*
      ★**勝った側の決め方は3つ**: 色（既定）／垂れている縦線（`finalByStem`）／
      **得点**（`finalByScore`）。★**得点が読めない・同点なら決勝を出さない。**
    */
    const leftWon = final.byScore
      ? leftScore != null && rightScore != null && leftScore !== rightScore
        ? leftScore > rightScore
        : null
      : (final.leftWon ?? isWin(final.left));
    if (leftWon !== null) {
      games.push({
        round,
        roundName: roundNames[round - 1] ?? null,
        winner: leftWon ? leftName : rightName,
        loser: leftWon ? rightName : leftName,
        winnerScore: leftWon ? leftScore : rightScore,
        loserScore: leftWon ? rightScore : leftScore,
      });
    }
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
