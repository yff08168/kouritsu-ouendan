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
 * ★ 表ごとの違いを吸収するための任意の引数（2026-08-15 現在）
 *
 *   `nameOrder`     … 校名の読む向き（縦書き／横書きの折り返し）
 *   `parseLabel`    … 日付と球場が1断片の表（鹿児島の `県12日9：00`）
 *   `expand`        … 連合チームの凡例が行で読めない表（鹿児島の `連合①`）
 *   `finalInCenter` … ★**いちばん深い帯の中央に、その半分のものではない
 *                     得点（大会の決勝）が1つ紛れている表**（鹿児島）。
 *                     このとき準決勝のスコアは中点ではなく**連結線の両端**に来るので、
 *                     窓を「その試合が結ぶ2本の線のあいだ」に広げる。
 *                     外した中央の1個は `centerScore` で返す
 *
 *   ★**どれも「そう書いてある表がある」ことを実データで確かめてから足したもの。**
 *   新しい県に流用する前に、その県の表でも同じ形かを必ず測ること。
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
 *
 *   ★**表の外に検算材料があることもある**（2026-08-15。鹿児島）。
 *   連盟のトップページが決勝の結果を文章で書いていた。
 *   **枝とは別の場所から来る事実**なので、出典のページ本文も必ず探すこと。
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
/**
 * @param maxGap ★**「回」とその手前の数字がどれだけ離れていたら別物とみなすか。**
 *
 *   既定は無制限（今までの挙動）。**離れた「回」を巻き込む表がある**
 *   （2026-08-16。宮崎）。中央の縦書き「（8年ぶり**10回**目）」の `回` が、
 *   同じ行の **53ポイント左にある3回戦のスコア `0`** を消していた
 *   （その回戦の数字が7個になり、8個必要で組めなくなる）。
 *
 *   ★**既定値を変えないこと。** ポイントの絶対値は表ごとに桁が違う
 *   （広島は紙の幅が約2900ポイント、宮崎は約550）。**その表で測って
 *   呼ぶ側から渡す。**
 */
export function stripInningMarks(page, { maxGap = Infinity } = {}) {
  const lines = page.lines.map((line) => {
    const items = line.items.map((i) => ({ ...i }));
    for (let k = 0; k < items.length; k++) {
      if (items[k].text.trim() !== "回") continue;
      const prev = items[k - 1];
      if (!prev) continue;
      if (items[k].x - prev.x > maxGap) continue;
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
 * ★**コールドの「7回」が縦書きの表がある**（2026-08-17。滋賀）。
 *
 * 滋賀はスコアの下に**数字と「回」を上下に積んで**書く（同じ x に、1行ずつ）。
 * `stripInningMarks` は**同じ行の左隣**しか見ないので、これは1つも落とせない。
 *
 * ★★**落とさないと1回戦の帯を取り違える。** これは
 * 「数字が余って組めなくなる」ではなく、**組めてしまうほうの壊れ方**:
 *
 *   コールドの数字は**その試合の中心（＝スロットの境目）に置かれる。**
 *   境目どうしの中点は `(n+0.5 + m+0.5)/2 = (n+m+1)/2` なので、
 *   **n+m が奇数ならまた境目に乗る**（＝1/2の確率で検査を通る）。
 *   滋賀の実データでは4組すべてが通り、**コールドの帯（8個）が1回戦
 *   （4試合）として読まれた。** 以降の回戦が全部ずれて組み立てが止まる。
 *
 * @param dx 「回」が数字の真下と認める横のずれ（実測2ポイント）
 * @param dy 何ポイント下までを「真下」と見るか。★**紙で測って渡すこと。**
 *           滋賀は13.2（1行ぶん）。**スコアの帯まで届く値にしないこと**
 *           （滋賀ならスコアと「回」は26.4離れており、16なら巻き込まない）
 */
export function stripVerticalInningMarks(page, { dx = 5, dy = 16 } = {}) {
  const marks = page.lines.flatMap((l) =>
    l.items.filter((i) => i.text.trim() === "回").map((i) => ({ x: i.x, y: l.y })),
  );
  if (!marks.length) return page;
  const lines = page.lines.map((line) => {
    const items = line.items.filter((i) => {
      // ★**単独の数字だけを対象にする。** `7-4` のようなスコアには触らない
      if (!/^[0-9０-９]{1,2}$/.test(i.text.trim())) return true;
      return !marks.some((m) => Math.abs(m.x - i.x) <= dx && line.y - m.y > 0 && line.y - m.y <= dy);
    });
    return { ...line, items, text: items.map((i) => i.text).join("\t") };
  });
  return { page: page.page, lines };
}

/**
 * ★**先頭の記号が校名と1つの断片になっているのを割る**（2026-08-17。山口の春季のため）。
 *
 * 山口の春の表は、**スロット1だけ**シード記号と校名がくっついて
 * `① 下 関 国 際`（x=36.2）という1つの断片になっている。
 * 他のスロットは記号（x=36）と校名（x=54）が別々の断片なので、
 * `ranges` で記号の列ごと外せていた。**くっついた1つだけが列の外から始まる**ため、
 * **そのスロットの校名が丸ごと消えて**組み立てが止まった。
 *
 * ★★**記号を「文字で消す」作りにしないこと。**
 * 千葉で、記号の列に記号でない「宣」が紛れていて `千葉東` が `千葉東宣` になった。
 * **列ごと外す**のが決まりなので、ここでは**断片を割るだけ**にして、
 * 外すのは今までどおり `ranges`（列）に任せる。
 *
 * @param pattern 括弧2つの正規表現。1つ目が記号、2つ目が残り
 */
export function splitLeadingMark(page, pattern) {
  const lines = page.lines.map((line) => {
    const items = line.items.flatMap((it) => {
      const m = it.text.match(pattern);
      // 幅が無ければ割った側の位置を決められないので、そのまま返す
      if (!m || !(it.width > 0)) return [it];
      const per = it.width / it.text.length;
      const at = it.text.indexOf(m[2], m[1].length);
      if (at < 0) return [it];
      return [
        { ...it, width: m[1].length * per, text: m[1] },
        { ...it, x: it.x + at * per, width: (it.text.length - at) * per, text: m[2] },
      ];
    });
    items.sort((a, b) => a.x - b.x);
    return { y: line.y, items, text: items.map((i) => i.text).join("\t") };
  });
  return { page: page.page, lines };
}

/**
 * ★**数字がいくつも1つの断片に潰れているのをほどく**（2026-08-17。滋賀のため）。
 *
 * 滋賀のスロット番号の行は、47個のうち17個が
 * **「１５ １６ １７ １８」のように1つの断片**になっている。
 * さらに**全角**なので、`assembleSlotBracket` の `/^\d+$/` には1つも当たらない。
 * このまま渡すと連番が 1〜14 で途切れ、**47スロットの表を14スロットとして読む。**
 *
 * ★**位置は「代表的な間隔 × 文字数」で見積もらないこと。**
 * 紙によって字送りが違い、実測で最大5ポイント（＝0.4スロット）ずれた。
 * **pdf.js が返す断片の幅を文字数で割る**（`pdf-text.mjs` の `width`）。
 * 幅が無い断片は割れないので、そのまま返す。
 *
 * ★**桁数で左端がずれるのも、ここで直す。**
 * `９`(幅4.4) と `１０`(幅8.9) は**同じ間隔で並んでいるのに左端の差は9.6**しかない
 * （本当の間隔は11.9）。`assembleSlotBracket` は左端を見るので、
 * 1桁と2桁の境目でスロットの位置が2ポイント狂う。
 * **`numbersOf` と同じ「左端＋(桁数−1)/2文字」に置き直す**と、
 * どの桁数でも同じ基準になり、校名の行との差も一定になる（実測で1.0〜1.8ポイント）。
 *
 * ★**対象は「数字と空白だけでできた断片」に限る。**
 * `11-1` のようなスコアや校名には触らない（スコアは `pairedScores` の担当）。
 */
export function explodeNumberRuns(page) {
  const lines = page.lines.map((line) => {
    const items = line.items.flatMap((it) => {
      const raw = it.text.trim();
      if (!/^[0-9０-９]+(?:[ 　]+[0-9０-９]+)*$/.test(raw)) return [it];
      const half = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
      // 幅が無ければ割れない。全角を半角にするところまではやる
      if (!(it.width > 0)) return [{ ...it, text: half }];
      /*
        ★**幅は「元の文字列ぜんぶ」の幅。** 前後に空白が付いていることがあるので、
        文字送りは `trim` した長さではなく**元の長さ**で割り、
        先頭の空白のぶんだけ右にずらす。
      */
      const per = it.width / it.text.length;
      const lead = it.text.length - it.text.trimStart().length;
      const out = [];
      // ★区切りの空白が2つ以上のこともあるので、**実際の文字位置**を数える
      let seen = 0;
      for (const part of half.split(/[ 　]+/)) {
        const at = half.indexOf(part, seen);
        out.push({
          ...it,
          x: it.x + (lead + at + (part.length - 1) / 2) * per,
          width: part.length * per,
          text: part,
        });
        seen = at + part.length;
      }
      return out;
    });
    items.sort((a, b) => a.x - b.x);
    return { y: line.y, items, text: items.map((i) => i.text).join("\t") };
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
export function assembleSlotBracket(
  page,
  {
    roundLabels,
    venueSymbols,
    nameOrder = "desc",
    finalInCenter = false,
    parseLabel,
    expand,
    /*
      ★**スコアが「連結線の両端」に書かれる表がある**（2026-08-16。山口）。

      京都・広島は、どの回戦もスコアが**中点のそば**（±0.2スロット）に来るので、
      帯を選ぶときの窓を 0.95 スロットにしてある。**山口は全回戦で両端**に置く。
      2回戦のスコアは中点から ±1.2 スロット離れており、窓に1つも入らない。
      その結果**3回戦の帯が2回戦として選ばれ**、組み立てが止まった
      （鹿児島の `finalInCenter` は同じ置き方だが、いちばん深い帯だけの話だった）。

      `hitSpan: true` にすると、窓を**その試合が結ぶ2本の線のあいだ**
      （＋余裕1スロット）に広げる。推測ではなく枝の形から決まる範囲なので、
      深い回戦の数字を誤って拾うことはない（実測でも 16 対 6 で正しい帯が勝つ）。

      ★**既定は false のまま。** 既存の県（京都・広島・三重・鹿児島・千葉・静岡）は
      同じ道を通るので、生成物は1バイトも変わらない。
    */
    hitSpan = false,
    /*
      ★**1試合のスコアが `11-1` と1つの断片に書かれる表がある**（2026-08-17。滋賀）。

      京都・広島・山口はスコアが**2つの数字として別々に**置かれるので、
      `numbersOf` は「数字だけの断片」しか見ていない。滋賀は
      **`11-1`（1〜2回戦）と `４－３`（3回戦以降）**で、どちらも1つの断片。
      そのままでは**その回戦の数字が1つも読めず**、帯が見つからない。

      `pairedScores: true` にすると `A-B` を**2つの数字**として読む。
      置く位置は断片の中の文字位置から出す（`pdf-text.mjs` の `width` を使う。
      無ければ今までどおり代表的な文字幅で見積もる）。

      ★**既定は false のまま。** 既存の25県は `A-B` の断片を今も読み飛ばしており、
      有効にすると**日付の範囲（`7-8`）まで数字として拾いうる**ので、
      使う県だけで有効にする。
    */
    pairedScores = false,
    /*
      ★**日付・球場を探す窓の広さ**（2026-08-17。滋賀）。`1` が今までどおり。

      京都・広島は日付や球場が**スコアの帯より下**にあるので、
      窓は「スコアの帯からほんの少し上」までで足りていた。
      滋賀は**上に積む**（下から コールド → スコア → 第何試合 → 球場 → 日付）ので、
      球場の帯はスコアの帯の**26〜29ポイント上**にある。
      既定の窓（回戦の間隔の0.3倍＝15〜24ポイント）には**1つも入らず、
      2回戦以降は「1つ前の回戦の球場」が付いていた**
      （3回戦の試合に、その回戦では使っていない今津スタジアムが付いた）。

      ★**広げすぎると次の回戦の帯に届く。** 滋賀で測ると、
      球場は間隔の0.56倍・次の回戦のスコアは1.0倍なので、そのあいだを採る
      （`2.5` を渡すと 0.3×2.5＝0.75倍）。**県ごとに測って渡すこと。**
    */
    labelReach = 1,
    /*
      ★**1回戦が何試合以上なら「1回戦の帯」と認めるか**（2026-08-18。兵庫のため）。

      既定は 2。**2つの数字がたまたま境目をはさんだだけの行**を
      1回戦と読み違えると、以降の回戦が全部ずれるので、
      **2試合ぶん（4個）を要求して誤検出を防いでいる。**

      ★**兵庫は9チームのブロックが16個**という形で、
      **どのブロックも1回戦はちょうど1試合**（9→8→4→2→1）。
      既定のままだと1回戦の帯が飛ばされ、**2回戦が1回戦として読まれる。**

      ★**下げるのは「1回戦が1試合と分かっている表」だけにすること。**
      チーム数が事前に分かっていて、試合数の検算ができる県に限る。
    */
    minFirstRound = 2,
  } = {},
) {
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
  /*
    ★**組み立て前に落ちた理由も出せるようにしておく**（`BRACKET_DEBUG=1`。2026-08-17）。

    ここより下の「1回戦の候補」は出るのに、**ここで返ると何も出ない。**
    山口の春はこの `nameOf` の空きで落ちていて、
    **左半分だけデバッグ出力が丸ごと無い**という形でしか気づけなかった。
  */
  const bail = (why) => {
    if (process.env.BRACKET_DEBUG) console.log(`  [debug] 組み立て前に中止: ${why}`);
    return null;
  };
  if (slotItems.length < 8) return bail(`スロット番号が ${slotItems.length} 個しか連番になっていない`);
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
  if (gaps.some((g) => !(g > 0))) return bail("スロット番号の間隔に 0 か負のものがある");
  /** 代表的な間隔。文字幅や窓の大きさに使う。**平均ではなく中央値**（広い箇所に引きずられない） */
  const PITCH = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (!(PITCH > 0)) return bail("スロット番号の代表的な間隔が 0 になった");
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
  if ([...nameOf.values()].some((v) => !v)) {
    const empty = [...nameOf].filter(([, v]) => !v).map(([n]) => n);
    return bail(`校名が空のスロットがある: ${empty.join(",")}（全 ${N} スロット）`);
  }

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
  /*
    ★**凡例の書き方は表ごとに違う。** 京都は「西 園 須 … 西乙訓・園部・須知」と
    1行に収まるが、**鹿児島は「連合①」と中身が別々の行にあり、x が揃っているだけ**。
    行では読めないので、その形は呼ぶ側に解かせて `expand` で受け取る。
    どちらにせよ**展開しないと連合チームだと分からず、1校に結び付けてしまう。**
  */
  const display = (n) => expand?.get(nameOf.get(n)) ?? combined.get(nameOf.get(n)) ?? nameOf.get(n);

  // ---- 3. 数字・日付・球場を座標つきで取り出す ----
  const CHAR = PITCH * 0.45;
  /**
   * ★**「10 2」のように2つの数字が1つの断片に潰れていることがある。**
   * ★**桁数で見かけの中心がずれる**ので、文字幅から中心を出す。
   */
  const numbersOf = (line) => {
    const out = [];
    for (const it of line.items) {
      const raw = it.text.trim();
      /*
        ★`pairedScores` のとき、字送りは**代表的な文字幅ではなく断片の実測幅**から出す。
        `11-1` の左右をどこに置くかは 0.1 スロットの精度が要り、
        `PITCH * 0.45` の見積もりでは足りない（滋賀の右端で 0.30 スロットずれた）。
        ★**幅は元の文字列ぜんぶのぶん**なので、割るのも元の長さ。
        先頭に空白があれば、そのぶん右から始める。
      */
      const useWidth = pairedScores && it.width > 0 && it.text.length > 0;
      const step = useWidth ? it.width / it.text.length : CHAR;
      let cursor = useWidth ? it.x + (it.text.length - it.text.trimStart().length) * step : it.x;
      for (const part of raw.split(/\s+/)) {
        const w = part.length * step;
        /*
          ★**スコアの後ろに丸数字が付く表がある**（鹿児島の `10⑤` `11⑦`）。
          ⑤は5回コールドの意味で、点数は10。落とさないと**その試合のスコアが
          まるごと読めず**、その回戦の数字が奇数個になって組めなくなる
          （鹿児島の1回戦は26のところ25になっていた）。
        */
        /*
          ★**サヨナラは点数のうしろに `×` が付く**（2026-08-17。福井の `7×` `9×`）。
          落とさないと `Number("7×")` にならず**その試合のスコアが丸ごと読めない。**
          福井の2回戦は16個必要なところ14個になり、組み立てが止まった。

          ★**これは足しても既存の県に影響しない。** いまも `7×` は数字として
          読めていないので、もしどこかの県の帯に入っていたら「その回戦の数字が
          試合数の2倍にならない」で既に落ちている。実際、全23県を再生成して
          生成物が1バイトも変わらないことを確認した。
        */
        const half = part
          .replace(/[①-⑳]+$/, "")
          .replace(/[×xX]+$/, "")
          .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
        /*
          ★**桁数のぶんだけ左にずれるのを戻す。** PDFが返すのは断片の左端なので、
          2桁の数は1桁の数より半文字ぶん左から始まる。**中心＝左端＋(桁数-1)/2文字。**
          `+ 幅/2` にすると1桁の数まで半文字ぶん右にずれ、
          **スロットの境目の判定が 0.3 を超えて外れる**（京都の1回戦が落ちた）。
        */
        /** 断片の中の `at` 文字目から `len` 文字ぶんの数を、その位置に置く */
        const put = (v, at, len) => {
          const x = cursor + (at + (len - 1) / 2) * step;
          out.push({ v, slot: toSlot(x), x });
        };
        /*
          ★**`11-1` を左右2つの数として読む**（`pairedScores` のときだけ）。
          区切りは半角ハイフンのほか、全角（滋賀の3回戦以降は `４－３`）と
          長音・ダッシュも受ける。**桁数は2桁まで**にして、
          電話番号や年号のような長い並びを拾わないようにする。
        */
        const pair = pairedScores && half.length === part.length && half.match(/^(\d{1,2})[-‐‑–—−ー－](\d{1,2})$/);
        if (pair) {
          put(Number(pair[1]), 0, pair[1].length);
          put(Number(pair[2]), pair[1].length + 1, pair[2].length);
        } else if (/^\d{1,2}$/.test(half)) {
          put(Number(half), 0, part.length);
        }
        cursor += w + step * 0.35;
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
    /*
      ★**1回戦のスコアが2行に分かれることがある。**
      鹿児島は点数の後ろに丸数字（コールドの回数）が付く試合だけ行が上にずれ、
      1行では29個（奇数）にしかならず組めなかった。**近い行はまとめて1つの帯**
      として見る（回戦の間隔よりずっと近い範囲だけ）。

      ★**数字の無い行をまとめないこと**（2026-08-15。鹿児島）。
      まとめた行のいちばん上が「1回戦の位置」になるので、注記だけの行
      （鹿児島は「９：００」）を巻き込むと**帯の位置が実際より上にずれる。**
      2回戦との間隔がそのぶん狭く見え、次の回戦のまとめ幅（間隔から決まる）が
      足りなくなる。**中身に寄与しない行は最初から入れない。**
    */
    const merged = bandRows.filter((l) => Math.abs(l.y - line.y) <= PITCH * 0.4 && numbersOf(l).length);
    const ns = merged.flatMap((l) => numbersOf(l)).sort((a, b) => a.slot - b.slot);
    /*
      ★**1回戦の帯を選ぶ過程を出せるようにしておく**（`BRACKET_DEBUG=1`。2026-08-16）。

      ここが外れると**次の帯が1回戦として読まれ、以降の回戦が1つずつずれる。**
      それでも表に出るのは「組合せ表を組み立てられなかった」の1行だけなので、
      **どの帯が何個で落ちたのか**が分からず、新しい県のたびに当てずっぽうになる。
      山口はこれを出して初めて「1回戦は通っていて2回戦で落ちている」と分かった。
    */
    if (process.env.BRACKET_DEBUG) {
      console.log(
        `  [debug] 1回戦の候補 y=${line.y.toFixed(0)}: 数字${ns.length}個` +
          `（帯 ${merged.map((l) => l.y.toFixed(0)).join("+")}／PITCH=${PITCH.toFixed(1)}）`,
      );
    }
    if (ns.length < minFirstRound * 2 || ns.length % 2 !== 0) continue;
    const found = [];
    let ok = true;
    for (let i = 0; i + 1 < ns.length; i += 2) {
      const mid = (ns[i].slot + ns[i + 1].slot) / 2;
      const a = Math.round(mid - 0.5);
      // どの組がどれだけ境目から外れて落ちたのかを出す（上のコメントの続き）
      if (process.env.BRACKET_DEBUG && Math.abs(mid - (a + 0.5)) > 0.45) {
        console.log(
          `  [debug]   ${ns[i].v}(${ns[i].slot.toFixed(2)}) と ${ns[i + 1].v}(${ns[i + 1].slot.toFixed(2)}) の中点 ` +
            `${mid.toFixed(2)} が境目から ${Math.abs(mid - (a + 0.5)).toFixed(2)} ずれている`,
        );
      }
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
    /*
      ★**まとめた行のうち「いちばん上」を1回戦の位置とすること。**
      下の行を基準にすると、**残りの行が2回戦の帯として 読まれる**
      （鹿児島で実際に起きて、以降の回戦が1つずつずれた）。
    */
    r1row = merged.reduce((a, b) => (b.y > a.y ? b : a));
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
  /**
   * ★**1つの回戦の日付が2行に割れることがある**（2026-08-15。鹿児島）。
   *
   * 鹿児島の1回戦は15試合ぶんの日付が **12件の行と3件の行**に分かれており、
   * 「ちょうど15件の行」が無いために帯を決められなかった（全部の日付が
   * 候補のまま残り、1回戦に3回戦の日付が付いた）。
   *
   * ★**まとめてよいのは「同じスロットの日付を持たない」行どうしだけ。**
   * 京都は継続試合の日付が同じ場所に何段も積まれている
   * （7/4→7/5→7/6→7/7）ので、そちらは**まとめてはいけない**
   * ——まとめると個数が試合数を超えて、やはり帯を決められなくなる。
   * **同じ試合の続きは同じスロット、別の試合は別のスロット**という違いで分ける。
   */
  const groupBands = (list) => {
    const byRow = new Map();
    for (const d of list) {
      const k = [...byRow.keys()].find((v) => Math.abs(v - d.y) <= BAND) ?? d.y;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(d);
    }
    const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([y, l]) => ({ ys: [y], list: l }));
    const out = [];
    for (const row of rows) {
      const prev = out.at(-1);
      const disjoint =
        prev && prev.list.every((p) => row.list.every((c) => Math.abs(p.slot - c.slot) > 0.5));
      if (prev && disjoint && Math.abs(row.ys[0] - prev.ys.at(-1)) <= PITCH * 0.5) {
        prev.ys.push(row.ys[0]);
        prev.list.push(...row.list);
      } else out.push(row);
    }
    return out;
  };
  /**
   * ★**日付は「個数がその回戦の試合数と一致する帯」に並んでいる。**
   *
   * 日付がスコアの帯からどれだけ離れているかは表によって全く違う
   * （京都は約8ポイント下、**広島は約150ポイント下**＝回戦の間隔とほぼ同じ、
   * **鹿児島は約78ポイント下**＝2段ぶん下）。
   * 距離で選ぶと**別の回戦の日付**を拾うので、**個数で帯を決める。**
   * 決めた帯の近くだけを返せば、継続試合で積み上がった日付も一緒に拾える。
   *
   * ★**「スコアの帯にいちばん近い帯」で選ばないこと**（2026-08-15。鹿児島）。
   *
   * 準決勝と決勝はどちらも1試合なので、**個数だけでは区別が付かない。**
   * 鹿児島は決勝の日付が準決勝のスコアと同じ帯にあり、近さで選ぶと
   * 準決勝に決勝の日付（7/25）が付いた。
   * **日付の帯はスコアの帯と同じ順に並ぶ**ので、
   * **前の回戦で使った帯より上の、いちばん低い帯**を採る。これなら
   * 「日付がスコアの何段ぶん下にあるか」を県ごとに決め打ちしなくて済む
   * （鹿児島は上半分が約80ポイント下・下半分が約27ポイント下で**左右でも違う**）。
   *
   * @param aboveY 前の回戦で使った帯の高さ。これより上だけを見る
   * @returns `{ dates, y }` … 選んだ帯の日付と、その帯の高さ（選べなければ y は null）
   */
  const pickBand = (list, count, aboveY, spread = Math.max(PITCH * 0.5, 12)) => {
    const hit = groupBands(list)
      .filter((g) => g.list.length === count && (aboveY === null || g.ys[0] > aboveY))
      .sort((a, b) => a.ys[0] - b.ys[0])[0];
    if (!hit) return { dates: list, y: null };
    return { dates: list.filter((d) => hit.ys.some((y) => Math.abs(d.y - y) <= spread)), y: hit.ys.at(-1) };
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
          ★**日付と球場が1つの断片にまとまっている表がある**（`parseLabel`）。
          鹿児島は `県12日9：00`（球場記号＋日＋開始時刻）で、
          月も `/` も無いので下の正規表現では1件も取れない。
          **形が違うぶんは呼ぶ側に解かせる。**
        */
        const parsed = parseLabel?.(t);
        if (parsed) {
          if (parsed.date) dates.push({ slot: toSlot(it.x), y: l.y, t: parsed.date });
          if (parsed.venue) venues.push({ slot: toSlot(it.x), t: parsed.venue });
          continue;
        }
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
  /** 前の回戦で使った日付の帯の高さ。**次の回戦はこれより上の帯から選ぶ** */
  let prevDateY = null;
  {
    const start = new Map(pods.map((p) => [p.a, p]));
    const inPod = new Set(pods.flatMap((p) => [p.a, p.a + 1]));
    /*
      ★**1回戦の日付も「個数が試合数と一致する帯」で選ぶ**（2回戦以降と同じ）。
      広島は1回戦の日付がスコアの帯から約140ポイント下にあり、
      広めに探すと**2回戦以降の日付を拾って17試合の日付が狂っていた。**
    */
    const wide = labelsBetween(slotLine.y, r1row.y + PITCH * 2.2 * labelReach);
    const picked = pickBand(wide.dates, pods.length, null);
    prevDateY = picked.y;
    const { dates, venues } = { ...wide, dates: picked.dates };
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
  /** `finalInCenter` のとき、いちばん深い帯の中央にあった「決勝ぶんの得点」 */
  let center = null;
  for (let r = 1; nodes.length > 1; r++) {
    const mids = [];
    /** ★`hitSpan` 用。その試合が結ぶ2本の線のあいだ（＋余裕1スロット） */
    const spans = [];
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      mids.push((nodes[i].x + nodes[i + 1].x) / 2);
      spans.push([Math.min(nodes[i].x, nodes[i + 1].x) - 1, Math.max(nodes[i].x, nodes[i + 1].x) + 1]);
    }
    const isHit = (n) =>
      hitSpan
        ? spans.some((s) => n.slot >= s[0] && n.slot <= s[1])
        : mids.some((m) => Math.abs(n.slot - m) <= 0.95);

    // 予測した中点のそばに数字がいちばん多く乗っている帯を探す
    /*
      ★**数字の無い行は帯の候補から外す**（2026-08-15。鹿児島）。
      `lastY` はこのあと「まとめた行のいちばん上」まで進めるので、
      注記だけの行（鹿児島は球場名の但し書き）を巻き込むと
      **回戦の間隔が実際より狭く見え、次の回戦のまとめ幅が足りなくなる。**
    */
    const rows = bandRows
      .filter((l) => l.y > lastY + BAND)
      .map((l) => {
        const ns = numbersOf(l);
        return { line: l, ns, hit: ns.filter(isHit).length };
      })
      .filter((c) => c.ns.length);
    const cand = rows
      /*
        ★**決勝は数字が2つしか無い**ので、しきい値を試合数から作ること。
        `min(2, 試合数*2)` にすると決勝（中点の予測が最大にずれる）で
        1つも候補が残らず、大会ごと落ちる（実際に落ちた）。
      */
      .filter((c) => c.hit >= Math.min(2, mids.length));
    /*
      ★**帯の選び方を出せるようにしておく**（`BRACKET_DEBUG=1`）。
      「数字N個（必要M個）」だけでは、**選ばれた帯が正しいのか**が分からない。
      山口は**正しい帯（16個）より深い帯（6個）のほうが一致数が多い**という
      形で落ちており、中点と数字の位置を並べて初めて原因が見えた。
    */
    if (process.env.BRACKET_DEBUG) {
      const line = (c) =>
        `           帯 y=${c.line.y.toFixed(0)} 数字${c.ns.length}個 一致${c.hit}` +
        ` [${c.ns.map((n) => `${n.v}@${n.slot.toFixed(2)}`).join(" ")}]`;
      console.log(`  [debug] 第${r}段: 中点=${mids.map((m) => m.toFixed(2)).join(",")}\n${rows.map(line).join("\n")}`);
    }
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
      こぼれた行は回戦の間隔よりずっと近いので、その一部までにする。

      ★**ずれ幅は桁数と注記で変わる**（2026-08-15。鹿児島）。
      鹿児島のこぼれ方は 9〜11ポイント（`10⑤` など1桁＋丸数字）だが、
      **2桁＋丸数字の `10⑥` だけ 15.2 ポイント**で、間隔の1/3（13.3）に
      収まらず下半分が組めなかった。間隔の 0.45 まで広げる
      （広島は間隔141に対しずれ81なので、広げても混ざらない）。
    */
    const mergeTol = Math.min(PITCH * 0.9, (best.line.y - lastY) * 0.45);
    /*
      ★**こぼれた行を `cand` から拾わないこと**（2026-08-15。鹿児島）。

      `cand` は「中点のそばに数字が2つ以上ある行」だけなので、
      **1試合ぶんしかこぼれていない行は最初から候補に入っていない。**
      鹿児島の3回戦は `11⑦` の1つだけが11ポイント上の行に落ちており、
      数字が7個（必要8個）で止まっていた。**まとめる相手は候補ではなく
      その高さにある行すべて**から選ぶ。混ざりものは下の
      「中点から3スロット以内」と「個数がちょうど2倍」で落ちる。
    */
    const merged = rows.filter((c) => Math.abs(c.line.y - best.line.y) <= mergeTol);
    /*
      ★**いちばん深い帯だけ、窓を「枝の張る幅」に広げる**（`finalInCenter`。鹿児島）。

      鹿児島の準決勝は、スコアが**中点ではなく連結線の両端**に書かれる
      （中点のスロット16に対して 9.2 と 21.7）。下の「中点から3スロット」では
      両方とも落ち、数字が1個になって組めなかった。
      **その試合が結ぶ2本の線のあいだ**なら推測ではないので、そこまで広げる。
      表の右端に並ぶシードのスロット番号（29.8〜33.3）はこの外に出る。
    */
    const deepest = finalInCenter && mids.length === 1;
    const span = deepest
      ? [Math.min(nodes[0].x, nodes[1].x) - 1, Math.max(nodes[0].x, nodes[1].x) + 1]
      : null;
    const pool = merged
      .flatMap((c) => c.ns)
      /*
        ★**表の左上にある日程表の数字を拾わないこと。**
        「日・曜・回戦・球場ごとの試合数」の一覧が別に載っていて、
        準決勝・決勝の帯はその一覧と**同じ高さ**にある。そのままだと
        数字の個数が合わなくなり、順番の対応が崩れる（実測）。
      */
      /*
        ★`hitSpan` の県は「中点から3スロット」では足りない。
        深い回戦ほど連結線が長くなり、両端に置かれたスコアは中点から離れる
        （山口の準決勝は ±6 スロット）。**枝の形から決まる範囲で見る。**
      */
      .filter((s) =>
        span
          ? s.slot >= span[0] && s.slot <= span[1]
          : hitSpan
            ? isHit(s)
            : mids.some((m) => Math.abs(s.slot - m) <= 3),
      )
      .sort((a, b) => a.slot - b.slot);

    /*
      ★**中央に1つ余る帯がある**（`finalInCenter`。鹿児島。2026-08-15）。

      上下2段組で、**決勝のスコアが半分ごとの準決勝と同じ帯に、
      中央をはさんで向かい合って**書かれている表がある。
      鹿児島の上半分の準決勝の帯は `7（9.2） 9（15.8） 0（21.7）` の3個で、
      **中央の 9 が決勝の得点**（下半分の同じ位置に相手の 0 がある）。

      準決勝の2つは連結線の両端、決勝の1つは連結線の交点（＝中点）に来るので、
      **中点にいちばん近い1個を決勝ぶんとして外す。** 外した値は
      `centerScore` で返し、呼ぶ側が決勝を組み立てるのに使う
      （`readTwoColumnBracket` の `finalAt: "center"`）。
    */
    if (deepest && pool.length === 3) {
      const k = pool.reduce((b, s, i) => (Math.abs(s.slot - mids[0]) < Math.abs(pool[b].slot - mids[0]) ? i : b), 0);
      center = { ...pool[k], y: best.line.y };
      pool.splice(k, 1);
      // 決勝の日付・球場は**その行の中**にある（鹿児島は「県25日10：05」）
      const here = labelsBetween(best.line.y - BAND, best.line.y + BAND);
      center.date = pickNear(here.dates, center.slot)?.t ?? null;
      center.venue = pickNear(here.venues, center.slot)?.t ?? null;
    }

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
    /*
      ★**探す下限は「前の回戦で使った帯」にする**（2026-08-15。鹿児島）。

      「スコアの帯から1段ぶん下」を窓にすると、**日付がもっと下にある表**で
      正しい帯が窓の外に出る（鹿児島の上半分は約2段ぶん下にあり、
      2回戦の日付の帯が窓から 3ポイント外れていた）。
      日付の帯は回戦の順に並ぶので、**前の回戦の帯より上**を見れば足りる。
    */
    const gap = best.line.y - lastY;
    /*
      ★**球場の窓は狭めないこと。** 球場の記号は日付と同じ帯には無く、
      前の回戦の帯より下にあることがある（広島の右半分の準決勝がそうで、
      日付に合わせて窓を切ったら球場だけ落ちた）。**日付にだけ順番の条件を掛ける。**
    */
    const wide = labelsBetween(
      Math.min(prevDateY ?? Infinity, lastY - gap),
      best.line.y + gap * 0.3 * labelReach,
    );
    const picked = pickBand(
      wide.dates.filter((d) => prevDateY === null || d.y > prevDateY),
      mids.length,
      prevDateY,
      Math.abs(gap) * 0.45,
    );
    prevDateY = picked.y ?? prevDateY;
    const dates = picked.dates;
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
    // ★まとめた行のうちいちばん上を基準にする（下だと残りが次の回戦の帯として読まれる）
    lastY = merged.reduce((a, c) => Math.max(a, c.line.y), best.line.y);
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
  return { games, champion: nodes[0]?.team ?? null, teams: N, byDate, byVenue, combined, centerScore: center };
}
