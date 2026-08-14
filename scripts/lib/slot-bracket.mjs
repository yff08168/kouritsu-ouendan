/**
 * 「スロット格子型」のトーナメント表（組合せ表）を試合の一覧に組み直す。
 *
 * ------------------------------------------------------------------
 * ★ このリポジトリは、これまでトーナメント表を出典にしないと決めていた
 *
 *   富山・石川で3方式（隣接ペア／スコア起点／罫線の座標）を試して3回とも
 *   誤った対戦を作った。**石川は検算（準々4・準決2・決勝1）を通ったのに
 *   決勝の相手が違った**（README「トーナメント表」の節）。
 *
 *   ★**その決定を全面的に覆すものではない。** ここで扱えるのは、下に書く
 *   4つの条件をすべて満たす表だけで、**富山・石川はいまも満たさない。**
 *   条件を1つでも欠く表に使うと、また誤った対戦ができる。
 *
 * ------------------------------------------------------------------
 * ★ 扱える表の条件（京都の選手権組合せ表で確認した）
 *
 *   1. **スロット番号の行がある**（1,2,3,…,71 が等間隔）。出場校はその下に
 *      1文字ずつ縦書きで並ぶ。これで「誰がどこにいるか」が推測なしで決まる
 *   2. **1回戦のスコアがスロットの中心に置かれる。** ここから
 *      「1回戦を戦う組」が読める。**シード（不戦）と対戦の区別がつく**のが要点で、
 *      石川で解けなかったのはまさにここ
 *   3. **回戦ごとにスコアが1本の帯（ほぼ同じy）に並ぶ**
 *   4. ★**各帯の数字の個数が、その回戦の試合数のちょうど2倍**。
 *      これが成り立つと**左から順に対応させられる**ので、
 *      「どのスコアがどの枝か」を座標から推測せずに済む
 *
 *   ★**4がいちばん効いている。** 予測した中点は回戦が上がるほど左へずれ、
 *   位置で寄せると毎回戦きっかり1試合を落としていた（実測）。
 *
 * ------------------------------------------------------------------
 * ★ 呼ぶ側は必ず検算すること
 *
 *   組み立てが正しいことを、**表の別の場所に書いてある事実**と突き合わせる。
 *   `assembleSlotBracket` は次を返すので、呼ぶ側で照合して、
 *   **合わなければその大会を1試合も出さないこと。**
 *
 *     - `games.length` … 表の「合計」と一致するか
 *     - `champion`     … 表の「優勝」と一致するか
 *     - `byDate`       … 表の日程欄の「日ごとの試合数」と一致するか
 *     - `byVenue`      … 表の日程欄の「球場ごとの試合数」と一致するか
 *
 *   京都ではこの4つすべてが合い、さらに**全70試合を外部の情報源と
 *   突き合わせて70/70で一致**した（2026-08-14）。
 */

/** 同じ帯とみなす y の差 */
const BAND = 1.0;

/**
 * ★**「N回」（コールド・延長の回数）を落とす。**
 *
 * これを残すとスコアと見分けが付かない。広島の実例:
 *
 *   7/10( 金 ) │ "12 8" │ 回        ← スコアは 12。**8 は8回コールドの意味**
 *   6 │ 回 │ 11                      ← スコアは 11。**6 は6回コールド**
 *
 * ★**2つの数字が1つの断片に潰れている**ことがあるので、
 * 断片ごと落とすのではなく**末尾の数字だけ**を削る。
 * 落とさないと、その回戦の数字が試合数の2倍にならず組めなくなる
 * （広島の2回戦は 32 のところ 38 になっていた）。
 */
export function stripInningMarks(page) {
  const lines = page.lines.map((line) => {
    const items = line.items.map((i) => ({ ...i }));
    for (let k = 0; k < items.length; k++) {
      if (items[k].text.trim() !== "回") continue;
      const prev = items[k - 1];
      if (!prev) continue;
      const t = prev.text.trim();
      if (/^\d{1,2}$/.test(t)) prev.text = "";
      else if (/\s\d{1,2}$/.test(t)) prev.text = t.replace(/\s+\d{1,2}$/, "");
    }
    const kept = items.filter((i) => i.text !== "");
    return { ...line, items: kept, text: kept.map((i) => i.text).join("\t") };
  });
  return { page: page.page, lines };
}

/**
 * ページの座標を入れ替えて「スロットが横・回戦が上へ」の向きに直す。
 *
 * ★**表は縦向きに描かれていることがある。** 京都はスロットが横一列で
 * 回戦が上へ伸びるが、**広島は出場校が縦に並び、回戦が横（中央）へ伸びる。**
 * 中身の規則は同じなので、**座標を入れ替えれば同じ組み立てが使える。**
 *
 * ★**左右2段組の表もある。** 広島は左半分（スロット1〜42、回戦は右へ）と
 * 右半分（43〜85、回戦は**左へ**）が向かい合っている。
 * 右半分は `flip` で軸の向きをそろえる。
 *
 * @param slotAxis "x"（スロットが横。そのまま） / "y"（スロットが縦。入れ替える）
 * @param flip     回戦が伸びる向きが負なら true
 */
export function orientPage(page, { slotAxis = "x", flip = false, range, rowTolerance = 3 } = {}) {
  if (slotAxis === "x" && !flip && !range) return page;
  const items = [];
  for (const l of page.lines) {
    for (const i of l.items) {
      const raw = { x: i.x, y: l.y, text: i.text };
      if (range && (raw.x < range[0] || raw.x > range[1])) continue;
      // スロットが縦なら x と y を入れ替える。**上から順に 1,2,3… なので y は反転**
      const x = slotAxis === "y" ? -raw.y : raw.x;
      const y = slotAxis === "y" ? (flip ? -raw.x : raw.x) : flip ? -raw.y : raw.y;
      items.push({ x, y, text: i.text });
    }
  }
  /*
    行に組み直す。**`pdf-text.mjs` と同じ考え方**で、近い y をまとめて x で並べる。

    ★**入れ替えたあとは許容幅を広げる必要がある**（`rowTolerance`）。
    入れ替えると「桁数による横のずれ」が**帯のずれ**に化ける。
    広島の右半分は数字が右揃えで、**2桁のスコアだけ約29ポイント別の帯に落ち**、
    1回戦の数字が19個（奇数）になって組めなかった。
    回戦の間隔（広島は約141）より十分小さい値にすること。
  */
  const rows = new Map();
  for (const it of items) {
    const key = [...rows.keys()].find((k) => Math.abs(k - it.y) <= rowTolerance) ?? it.y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  const lines = [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, list]) => {
      const sorted = list.sort((a, b) => a.x - b.x);
      return { y, items: sorted, text: sorted.map((i) => i.text).join("\t") };
    });
  return { page: page.page, lines };
}

/**
 * @param page `pdfPages()` が返すページ1枚
 * @param opts.roundLabels 深い順に使う回戦名
 * @returns null（形が違って組めない）または組み立て結果
 */
export function assembleSlotBracket(page, { roundLabels, venueSymbols, nameOrder = "desc" } = {}) {
  /*
    ---- 1. スロット番号の行 ----

    ★**「1から始まる」を前提にしないこと。** 広島の表は左右2段組で、
    右半分のスロットは **43〜85** から始まる（左が1〜42）。
    「1,2,3,…」を探す作りだと右半分が丸ごと落ちる。
    **連番がいちばん長く並んでいる行**を探す形にしてある。
  */
  /*
    ★**スロット番号が2行に割れることがある。** 広島は桁数で位置が変わり、
    「1〜9」と「10〜42」が別の行として出てくる（1文字ぶん右にずれる）。
    行ごとに探すと**片方しか拾えず、スロットが33個しかない**ことになる。
    **行にこだわらず、近い高さにある整数から連番を探す。**
  */
  const SLOT_ROW = 20;
  const ints = page.lines.flatMap((l) => l.items.filter((i) => /^\d+$/.test(i.text)).map((i) => ({ ...i, y: l.y })));
  const longestRun = (list) => {
    const ns = [...list].sort((a, b) => a.x - b.x);
    let best = [];
    let cur = [];
    for (const it of ns) {
      if (cur.length && Number(it.text) !== Number(cur.at(-1).text) + 1) {
        if (cur.length > best.length) best = cur;
        cur = [];
      }
      cur.push(it);
    }
    return cur.length > best.length ? cur : best;
  };
  let slotItems = [];
  for (const anchor of ints) {
    const run = longestRun(ints.filter((i) => Math.abs(i.y - anchor.y) <= SLOT_ROW));
    if (run.length > slotItems.length) slotItems = run;
  }
  if (slotItems.length < 8) return null;
  /** スロット行の高さ。**割れているので中央値を使う** */
  const slotY = [...slotItems].map((i) => i.y).sort((a, b) => a - b)[Math.floor(slotItems.length / 2)];
  const slotLine = { y: slotY };
  const N = slotItems.length;
  /*
    ★**スロットの間隔は均等とは限らない**（2026-08-14 に判明）。
    三重の表は大半が約19.7ポイント間隔なのに、**左は15→16が31.9、
    右は43→44が51.3**と一部だけ広い（シードの位置で余白が入る）。
    等間隔として割り算すると、そこから先の校名とスコアが**1つずつずれる。**

    **実測した位置のあいだを区分線形で結ぶ。** 等間隔の表（京都・広島）では
    今までと同じ結果になる。
  */
  const pos = slotItems.map((i) => i.x);
  const gaps = [];
  for (let i = 1; i < N; i++) gaps.push(pos[i] - pos[i - 1]);
  if (gaps.some((g) => !(g > 0))) return null;
  /** 代表的な間隔。文字幅や窓の大きさに使う。**平均ではなく中央値**（広い箇所に引きずられない） */
  const PITCH = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (!(PITCH > 0)) return null;
  const toSlot = (x) => {
    if (x <= pos[0]) return 1 + (x - pos[0]) / gaps[0];
    for (let i = 1; i < N; i++) {
      if (x <= pos[i]) return i + (x - pos[i - 1]) / gaps[i - 1];
    }
    return N + (x - pos[N - 1]) / gaps[N - 2];
  };

  // ---- 2. 校名（スロット行より下を、xでまとめて上から順に連結）----
  const rawName = new Map();
  for (let n = 1; n <= N; n++) rawName.set(n, []);
  for (const l of page.lines) {
    if (l.y >= slotLine.y) continue;
    for (const it of l.items) {
      const s = toSlot(it.x);
      const n = Math.round(s);
      if (n >= 1 && n <= N && Math.abs(s - n) <= 0.6) rawName.get(n).push({ y: l.y, x: it.x, t: it.text });
    }
  }
  /*
    ★**読む順は表の書き方で逆になる。**

      京都 … 校名が**縦書き**。1文字ずつ上から下（y の降順）
      広島 … 校名が**横書き**で、長いものは折り返す。連合チームの
             「黒瀬・大柿・／のみのお分校／・忠海」が3行に分かれており、
             降順で読むと**「・忠海黒瀬・大柿・のみのお分校」**になった

    `nameOrder: "asc"` で折り返しの向きに合わせる。同じ行の中は必ず x の昇順。
  */
  /*
    ★**校名が2行に組まれていることがある**（2026-08-15。三重）。

    三重の連合チームはスロット1つぶんの幅に**2行×複数列**で組まれている:

        鳥 羽   南 伊 勢     ← 上の行
          石  薬  師         ← 下の行

    1次元に並べ替えると**行をまたいで交互に**読んでしまい、
    `鳥羽石南伊勢薬師` のように崩れる（該当2件。**行を読み切ってから次の行**へ）。

    ★**同じ行の文字は「スロット軸の座標」が等しい**（縦書きの京都なら同じ列、
    横書きの三重・広島なら同じ行）。そこで**まずスロット軸でまとめ、
    まとまりの中を `nameOrder` の向きで読む。** 1行しかない表では今までと同じ結果になる。
  */
  const dir = nameOrder === "asc" ? 1 : -1;
  const LINE = PITCH * 0.35;
  const nameOf = new Map(
    [...rawName].map(([n, cs]) => {
      const lines = [];
      for (const c of [...cs].sort((a, b) => a.x - b.x)) {
        const last = lines.at(-1);
        if (last && Math.abs(last.x - c.x) <= LINE) last.cs.push(c);
        else lines.push({ x: c.x, cs: [c] });
      }
      return [n, lines.map((l) => l.cs.sort((a, b) => dir * (a.y - b.y)).map((c) => c.t).join("")).join("")];
    }),
  );
  if ([...nameOf.values()].some((v) => !v)) return null;

  /*
    ★**連合チームは3文字に略され、凡例で展開されている。**
    「西 園 須 … 西乙訓・園部・須知」。展開しないと1校の校名に見えるので、
    **連合チームだと分からなくなり、どれか1校に結び付けてしまう。**
  */
  const combined = new Map();
  for (const l of page.lines) {
    const m = l.text.match(/(?:^|\t)([^\t])\t([^\t])\t([^\t])\t…\t([^\t]+)$/);
    if (m) combined.set(m[1] + m[2] + m[3], m[4].trim());
  }
  const display = (n) => combined.get(nameOf.get(n)) ?? nameOf.get(n);

  // ---- 3. 数字・日付・球場を座標つきで取り出す ----
  const CHAR = PITCH * 0.45;
  /**
   * ★**「10 2」のように2つの数字が1つの断片に潰れていることがある。**
   * ★**桁数で見かけの中心がずれる**ので、文字幅から中心を出す。
   */
  const numbersOf = (line) => {
    const out = [];
    for (const it of line.items) {
      let cursor = it.x;
      for (const part of it.text.trim().split(/\s+/)) {
        const w = part.length * CHAR;
        const half = part.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
        /*
          ★**桁数のぶんだけ左にずれるのを戻す。** PDFが返すのは断片の左端なので、
          2桁の数は1桁の数より半文字ぶん左から始まる。**中心＝左端＋(桁数-1)/2文字。**
          `+ 幅/2` にすると1桁の数まで半文字ぶん右にずれ、
          **スロットの境目の判定が 0.3 を超えて外れる**（京都の1回戦が落ちた）。
        */
        if (/^\d{1,2}$/.test(half)) {
          out.push({ v: Number(half), slot: toSlot(cursor + ((part.length - 1) * CHAR) / 2) });
        }
        cursor += w + CHAR * 0.35;
      }
    }
    return out;
  };
  /*
    ★**スロット行が割れているとき、その片割れを帯に混ぜないこと。**
    広島は「1〜9」と「10〜42」が別の行になり、中央値を取ると片方が
    「スロット行より上」に残る。そのまま帯として読むと**スロット番号を
    スコアとして拾う**（左半分では9個＝奇数だったので偶然弾かれていた）。
  */
  const slotYs = new Set(slotItems.map((i) => i.y));
  const bandRows = page.lines
    .filter((l) => l.y > slotLine.y && !slotYs.has(l.y))
    .sort((a, b) => a.y - b.y);

  /*
    ---- 4. 1回戦 ----

    いちばん下の帯が1回戦。**そこから「どの2校が1回戦を戦うか」を読む。**
    ここが決まればあとは標準的な枝分かれで積み上がるので、**表全体の要**。

    ★**スコアの置き方は表によって違う。**
      京都  … スロットの**中心**に置かれる（14.93 と 15.90＝スロット15と16）
      広島  … 対戦の**中点をはさんで**置かれる（中点から ±0.2 スロット）

    どちらも「**2つ並んだスコアの中点が、隣り合うスロットの境目（n+0.5）に来る**」
    という点は同じなので、**中心に乗っているかではなく中点で見る。**

    ★**帯には「6 回」（コールド）のような、スコアでない数字が混ざりうる。**
    混ざると2つずつの組がずれ、中点が n+0.5 から外れる。
    **全部の組が境目に乗る帯だけを1回戦として採用する**（乗らなければ次の帯を見る）。
  */
  let r1row = null;
  let pods = [];
  for (const line of bandRows) {
    const ns = numbersOf(line).sort((a, b) => a.slot - b.slot);
    if (ns.length < 4 || ns.length % 2 !== 0) continue;
    const found = [];
    let ok = true;
    for (let i = 0; i + 1 < ns.length; i += 2) {
      const mid = (ns[i].slot + ns[i + 1].slot) / 2;
      const a = Math.round(mid - 0.5);
      /*
        ★**許容幅は 0.45 まで。** スロットの位置はスロット番号の行から出しているが、
        スコアの置き方はそれと完全には揃っておらず、表によって 0.35 ほどずれる
        （三重の1回戦が 0.35 で落ちた）。**0.5 未満なら「いちばん近い境目」は
        一意に決まる**ので、そこまでは広げてよい。
      */
      if (Math.abs(mid - (a + 0.5)) > 0.45 || a < 1 || a + 1 > N) {
        ok = false;
        break;
      }
      found.push({ a, sa: ns[i].v, sb: ns[i + 1].v });
    }
    if (!ok || !found.length) continue;
    // 同じスロットを2度使う組み方はありえない
    const used = new Set();
    if (found.some((p) => used.has(p.a) || used.has(p.a + 1) || (used.add(p.a), used.add(p.a + 1), false))) continue;
    r1row = line;
    pods = found;
    break;
  }
  if (!r1row) return null;

  const games = [];
  const pickNear = (list, mid) =>
    list.length ? list.reduce((p, c) => (Math.abs(c.slot - mid) < Math.abs(p.slot - mid) ? c : p)) : null;

  /**
   * 日付を選ぶ。★**同じ試合に日付が何段も積まれていることがある。**
   *
   * 雨天などで中断した試合は、表に「7/4 → 7/5 → 7/6 → 7/7」と続きの日が
   * 書き足される（京都の1回戦は7試合中4試合がこれだった）。
   * いちばん近い日付を取ると**最初の日**を拾ってしまい、
   * **実際に決着した日と違う日付を画面に出す**ことになる。
   *
   * 決着したのは**いちばん後の日**なので、近くにある日付のうち最新を取る。
   * 近くに1つも無ければ、いちばん近いものにする。
   */
  const pickDate = (list, mid, window = 1.0) => {
    const near = list.filter((d) => Math.abs(d.slot - mid) <= window);
    if (!near.length) return pickNear(list, mid);
    const key = (t) => {
      const [m, d] = t.split("/").map(Number);
      return m * 100 + d;
    };
    return near.reduce((p, c) => (key(c.t) > key(p.t) ? c : p));
  };
  /**
   * ★**日付は「個数がその回戦の試合数と一致する帯」に並んでいる。**
   *
   * 日付がスコアの帯からどれだけ離れているかは表によって全く違う
   * （京都は約8ポイント下、**広島は約150ポイント下**＝回戦の間隔とほぼ同じ）。
   * 距離で選ぶと**別の回戦の日付**を拾うので、**個数で帯を決める。**
   * 決めた帯の近くだけを返せば、継続試合で積み上がった日付も一緒に拾える。
   */
  const pickBand = (list, count, nearY) => {
    const byBand = new Map();
    for (const d of list) {
      const k = [...byBand.keys()].find((v) => Math.abs(v - d.y) <= BAND) ?? d.y;
      if (!byBand.has(k)) byBand.set(k, []);
      byBand.get(k).push(d);
    }
    const hit = [...byBand.entries()]
      .filter(([, l]) => l.length === count)
      .sort((a, b) => Math.abs(a[0] - nearY) - Math.abs(b[0] - nearY))[0];
    if (!hit) return list;
    const spread = Math.max(PITCH * 0.5, 12);
    return list.filter((d) => Math.abs(d.y - hit[0]) <= spread);
  };

  /** 帯のまわりから日付・球場を拾う（試合の中点のいちばん近くにある） */
  const labelsBetween = (yFrom, yTo) => {
    const dates = [];
    const venues = [];
    for (const l of bandRows) {
      if (l.y <= yFrom || l.y > yTo) continue;
      for (const it of l.items) {
        const t = it.text.trim();
        /*
          ★**日付の断片に括弧が付いていることがある。** 広島は曜日を続けて
          「7/11( 土 )」と書くので、断片は `7/11(` になる。
          `^\d/\d$` だけを見ていると**日付が1つも取れない**（実際そうなった）。
        */
        const d = t.match(/^(\d{1,2}\/\d{1,2})[(（]?$/);
        if (d) dates.push({ slot: toSlot(it.x), y: l.y, t: d[1] });
        /*
          ★**球場の記号は凡例にあるものだけを見ること。**
          同じ帯に「第N試合」を表す ①②③ が並んでおり、1文字なら何でも
          球場とみなすと**そちらを拾う**（実測で ①33件・②27件になった）。
        */
        else if (venueSymbols?.has(t)) venues.push({ slot: toSlot(it.x), t });
      }
    }
    return { dates, venues };
  };

  let nodes = [];
  {
    const start = new Map(pods.map((p) => [p.a, p]));
    const inPod = new Set(pods.flatMap((p) => [p.a, p.a + 1]));
    /*
      ★**1回戦の日付も「個数が試合数と一致する帯」で選ぶ**（2回戦以降と同じ）。
      広島は1回戦の日付がスコアの帯から約140ポイント下にあり、
      広めに探すと**2回戦以降の日付を拾って17試合の日付が狂っていた。**
    */
    const wide = labelsBetween(slotLine.y, r1row.y + PITCH * 2.2);
    const { dates, venues } = { ...wide, dates: pickBand(wide.dates, pods.length, r1row.y) };
    for (let n = 1; n <= N; n++) {
      const p = start.get(n);
      if (p) {
        const mid = n + 0.5;
        games.push({
          roundIndex: 0,
          a: display(n), b: display(n + 1), sa: p.sa, sb: p.sb,
          date: pickDate(dates, mid)?.t ?? null,
          venue: pickNear(venues, mid)?.t ?? null,
        });
        nodes.push({ x: mid, team: display(p.sa > p.sb ? n : n + 1) });
      } else if (!inPod.has(n)) {
        nodes.push({ x: n, team: display(n) });
      }
    }
  }

  // ---- 5. 2回戦以降 ----
  let lastY = r1row.y;
  for (let r = 1; nodes.length > 1; r++) {
    const mids = [];
    for (let i = 0; i + 1 < nodes.length; i += 2) mids.push((nodes[i].x + nodes[i + 1].x) / 2);

    // 予測した中点のそばに数字がいちばん多く乗っている帯を探す
    const cand = bandRows
      .filter((l) => l.y > lastY + BAND)
      .map((l) => {
        const ns = numbersOf(l);
        return { line: l, ns, hit: ns.filter((n) => mids.some((m) => Math.abs(n.slot - m) <= 0.95)).length };
      })
      /*
        ★**決勝は数字が2つしか無い**ので、しきい値を試合数から作ること。
        `min(2, 試合数*2)` にすると決勝（中点の予測が最大にずれる）で
        1つも候補が残らず、大会ごと落ちる（実際に落ちた）。
      */
      .filter((c) => c.hit >= Math.min(2, mids.length));
    if (!cand.length) {
      if (process.env.BRACKET_DEBUG) console.log(`  [debug] 第${r}段: 帯が見つからない（試合${mids.length}）`);
      return null;
    }
    const best = cand.reduce((a, b) => (b.hit > a.hit ? b : a));
    /*
      同じ回戦のスコアが2行に分かれることがある（コールドの注記などで
      1つだけ持ち上がる）。近い行はまとめて1つの帯として扱う。
    */
    /*
      ★**まとめる幅は「回戦の間隔」から決めること。**
      スロットの間隔（`PITCH`）を基準にすると、**回戦の間隔のほうが狭い表**で
      隣の回戦を巻き込む。広島は左半分の決勝（y=1316）に**大会全体の決勝**
      （y=1397）が混ざり、数字が4個になって組めなくなった。
      こぼれた行は回戦の間隔よりずっと近いので、その1/3までにする。
    */
    const mergeTol = Math.min(PITCH * 0.9, (best.line.y - lastY) / 3);
    const pool = cand
      .filter((c) => Math.abs(c.line.y - best.line.y) <= mergeTol)
      .flatMap((c) => c.ns)
      /*
        ★**表の左上にある日程表の数字を拾わないこと。**
        「日・曜・回戦・球場ごとの試合数」の一覧が別に載っていて、
        準決勝・決勝の帯はその一覧と**同じ高さ**にある。そのままだと
        数字の個数が合わなくなり、順番の対応が崩れる（実測）。
      */
      .filter((s) => mids.some((m) => Math.abs(s.slot - m) <= 3))
      .sort((a, b) => a.slot - b.slot);

    /*
      ★**個数がちょうど2倍でなければ組まない。**
      位置で寄せる方法は、スコアが中点の真上に乗った試合を落とす。
      **落としたまま勝者を伝播させると、負けた学校が次の回戦に出る。**
      ここは「組めないなら何も出さない」に倒す。
    */
    if (pool.length !== mids.length * 2) {
      if (process.env.BRACKET_DEBUG) console.log(`  [debug] 第${r}段: 数字${pool.length}個（必要${mids.length * 2}）y=${best.line.y.toFixed(0)}`);
      return null;
    }

    /*
      ★**日付の帯は「個数が試合数と一致する帯」で決める。**

      日付がスコアの帯からどれだけ離れているかは表によって全く違う。
      京都は約8ポイント下、**広島は約150ポイント下**（回戦の間隔とほぼ同じ）で、
      「スコアの帯の近く」を広めに探すと**次の回戦の日付を拾う**。
      実際、広島は84試合中34試合の日付が別の回戦のものになっていた。

      回戦ごとの日付は必ずその回戦の試合数だけ並ぶので、**個数で帯を選ぶ。**
      選んだ帯の近くだけを見れば、継続試合で積み上がった日付も拾える
      （京都の1回戦は7/4→7/5→7/6→7/7と積まれていて、最新を採る）。
    */
    const gap = best.line.y - lastY;
    const wide = labelsBetween(lastY - gap, best.line.y + gap * 0.3);
    const byBand = new Map();
    for (const d of wide.dates) {
      const k = [...byBand.keys()].find((v) => Math.abs(v - d.y) <= BAND) ?? d.y;
      if (!byBand.has(k)) byBand.set(k, []);
      byBand.get(k).push(d);
    }
    const exact = [...byBand.entries()]
      .filter(([, list]) => list.length === mids.length)
      .sort((a, b) => Math.abs(a[0] - best.line.y) - Math.abs(b[0] - best.line.y))[0];
    const dates = exact
      ? wide.dates.filter((d) => Math.abs(d.y - exact[0]) <= Math.abs(gap) * 0.45)
      : wide.dates;
    const venues = wide.venues;
    const next = [];
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const L = nodes[i];
      const R = nodes[i + 1];
      const k = i / 2;
      const left = pool[k * 2];
      const right = pool[k * 2 + 1];
      const mid = (left.slot + right.slot) / 2;
      games.push({
        roundIndex: r,
        a: L.team, b: R.team, sa: left.v, sb: right.v,
        date: pickDate(dates, mid)?.t ?? null,
        venue: pickNear(venues, mid)?.t ?? null,
      });
      // ★**親の位置は「読めた2つのスコアの中点」にする。** 予測だけで積むとずれが溜まる
      next.push({ x: mid, team: left.v > right.v ? L.team : R.team });
    }
    lastY = best.line.y;
    nodes = next;
  }

  // ---- 6. 回戦名（いちばん深い帯が決勝）----
  /*
    ★**回戦名は「深いほうから固定の名前」「浅いほうから N回戦」で挟む。**

    大会の深さは県で違う（京都は7段、広島は6段＋決勝、三重は5段＋決勝）。
    深いほうだけの一覧を当てると、**段数が変わったときに1回戦が「3回戦」になる。**
    実際、三重を広島と同じ一覧で組むと 1回戦が「3回戦」と名付けられた。

    `roundLabels` は**深い順に固定で名前が付くぶんだけ**渡す
    （京都は決勝・準決勝・準々決勝、左右2段組の県は準決勝・準々決勝）。
    それより浅い回戦は「1回戦」「2回戦」…と順に付く。
  */
  const depth = Math.max(...games.map((g) => g.roundIndex)) + 1;
  const labels = roundLabels ?? [];
  for (const g of games) {
    const fromTop = depth - 1 - g.roundIndex;
    g.round = fromTop < labels.length ? labels[fromTop] : `${g.roundIndex + 1}回戦`;
    delete g.roundIndex;
  }

  const byDate = new Map();
  const byVenue = new Map();
  for (const g of games) {
    if (g.date) byDate.set(g.date, (byDate.get(g.date) ?? 0) + 1);
    if (g.venue) byVenue.set(g.venue, (byVenue.get(g.venue) ?? 0) + 1);
  }
  return { games, champion: nodes[0]?.team ?? null, teams: N, byDate, byVenue, combined };
}
