/**
 * HSB flash（`<県>.hsbflash.jp`）のトーナメント表を読む。
 *
 * ------------------------------------------------------------------
 * ★★ これは「トーナメント表を組み立てる」話ではない
 *
 *   このリポジトリは **トーナメント表を原則として出典にしない**と決めている
 *   （石川で「検算を通ったのに決勝の相手が違う」を作った。READMEの「トーナメント表」）。
 *   例外にした県（京都・広島・三重・鹿児島・滋賀・和歌山・兵庫・沖縄ほか）は、
 *   **座標から枝の形を推測して**組み立てている。**そこが危ないところだった。**
 *
 *   ★**この出典は違う。表がSVGで、枝が線として描いてある。**
 *
 *     <line x1="120" y1="566" x2="180" y2="566" stroke="red"   />  ← 上の枝
 *     <line x1="120" y1="596" x2="180" y2="596" stroke="black" />  ← 下の枝
 *     <line x1="180" y1="566" x2="180" y2="581" stroke="red"   />  ← 縦の連結（上半分）
 *     <line x1="180" y1="581" x2="180" y2="596" stroke="black" />  ← 縦の連結（下半分）
 *
 *   ★**縦の線が「どの枝とどの枝が1試合になるか」をそのまま書いている。**
 *   推測が要らないので、**シードが何回戦にいても関係がない**
 *   （座標から組み立てる方式は「毎回全員が組になる」を前提にしていて、
 *   **2回戦以降のシードがあると必ず落ちる**。この表は実際にそうなっている）。
 *
 *   ★★**さらに `stroke="red"` が勝った側の枝**。
 *   **得点とは別に、出典自身が勝敗を描いている**ので、
 *   **「赤い側」と「点の多い側」が一致するかを検算にできる。**
 *
 * ------------------------------------------------------------------
 * ★★ 紙は2種類ある（2026-09-02 その2 に「1段の紙」を足した）
 *
 *   ① **左右2段組**（大きい大会）。スロット番号が左右に1列ずつ、1〜N の連番。
 *      決勝は左右の勝者どうしで、**縦の連結線が無い**（得点は `y_f7` の2つ）。
 *   ② ★**1段**。**小さい大会**（高知・愛媛の春季）と、
 *      ★★**「ブロック＋決勝トーナメント」の紙**（岐阜の夏・2020年の代替大会）。
 *      **1枚に山（サブトーナメント）がいくつも縦に並び、番号は山ごとに振り直される。**
 *      得点は**全部 `y_f7`**。決勝も普通の縦の連結線で描いてある。
 *
 *   ★★**入口で①を先に探し、見つからなかったときだけ②として読む**ので、
 *   **①の紙の読み取りは1バイトも変わらない**（既存の県で確かめてある）。
 *
 *   ★②で気をつけるところ:
 *     - **山は枝の連結から求める**（union-find）。★**番号は後からまた変わるので最後にそろえる**
 *     - ★★**決勝トーナメントの山は「その出場校＝他の山の優勝校」で見つける。**
 *       **紙の中の2か所が一致することを求める**ので、山を読み違えれば必ず落ちる
 *     - ★★**返すスロットからその山を外す** —— **同じ学校が紙に2度出ているだけ**で、
 *       外すと呼ぶ側の「チーム数 − 試合数 = 1」がそのまま成り立つ
 *     - ★**回戦はブロック → 決勝トーナメントと続けて数える**（ブロック決勝＝大会の準々決勝）
 *     - ★★**ブロックが紙の上で逆さに並ぶ年がある**（岐阜の第105回）。
 *       **返すのはスロット番号の順**（呼ぶ側が「出場校の一覧」と1対1で突き合わせるため）
 *     - ★**山ごとの優勝校が見出しの右に刷ってある。** 組み立てと突き合わせて検算にしてある
 *
 * ------------------------------------------------------------------
 * ★ 表の作り（2026-08-21 に福岡で実測）
 *
 *   - スロット番号 … `class="y_f8"` の数字。左 x≒113（1〜64）／右 x≒982（65〜128）
 *   - 校名         … `class` が `b ` で始まる。左 x≒55 ／ 右 x≒1047。
 *                     ★**長い校名は小さいフォントで2行に割れる**（`b y_f10`）
 *   - スコア       … `class="y_f9"`。**枝の高さ**に、連結線の少し外側へ置かれる
 *   - 決勝のスコア … ★`class="y_f7"` の2つだけ。**他とクラスが違う**
 *   - 日付・球場   … `class="y_f10"`。試合ごとの `<a class="playdt">` の中
 *   - 優勝校       … `class="y_f18"`（`優勝校 ◯◯高校`）。**検算材料**
 *
 * ------------------------------------------------------------------
 * ★ 呼ぶ側は必ず検算すること
 *
 *   返り値の `slots`（スロット番号順の校名）を、
 *   **出典の「出場校」一覧と過不足なく突き合わせること。**
 *   1つでも読み違えれば必ず食い違う。
 */

const num = (attr, k) => Number(new RegExp(`\\b${k}="([-\\d.]+)"`).exec(attr)?.[1]);

/** SVGの `<text>` を { cls, x, y, text } にする */
function readTexts(html) {
  const out = [];
  for (const m of html.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const x = num(m[1], "x");
    const y = num(m[1], "y");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const text = m[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    if (!text) continue;
    out.push({ cls: /\bclass="([^"]*)"/.exec(m[1])?.[1] ?? "", x, y, text });
  }
  return out;
}

/**
 * @param html トーナメント表のページ全体
 * @param opts.district 警告に出す県名
 * @returns null（形が違って読めない）または `{ slots, games, champion, printedChampion }`
 */
export function readHsbBracket(html, { district = "" } = {}) {
  const bail = (why) => {
    console.log(`  ⚠️ ${district}: トーナメント表を読めない（${why}）。1試合も出さない`);
    return null;
  };
  const texts = readTexts(html);
  if (!texts.length) return bail("SVGの文字が1つも無い");

  /*
    ---- 1. スロット番号 ----
    ★**紙は2種類ある**（2026-09-02 その2 に1段の紙を足した）:

      左右2段組  … 大きい大会。スロット番号が左右に1列ずつ（1〜N の連番）
      1段        … ★**小さい大会**（高知・愛媛の春季など）と、
                    ★★**「ブロック＋決勝トーナメント」の紙**（岐阜の夏・2020年の代替大会）。
                    **1枚に山がいくつも縦に並び、番号は山ごとに振り直される。**

    ★★**まず今までどおり「連番の列がちょうど2本」を探す**（2段組の紙は1バイトも挙動が変わらない）。
    **見つからなければ**「4つ以上ある列がちょうど1本」を1段の紙として読む。
  */
  const cols = new Map();
  for (const t of texts.filter((t) => t.cls === "y_f8" && /^\d+$/.test(t.text))) {
    const k = [...cols.keys()].find((v) => Math.abs(v - t.x) <= 6) ?? t.x;
    if (!cols.has(k)) cols.set(k, []);
    cols.get(k).push(t);
  }
  const columns = [...cols.entries()]
    .map(([x, list]) => ({ x, list: list.sort((a, b) => a.y - b.y) }))
    .sort((a, b) => a.x - b.x);
  const runCols = columns.filter(
    ({ list }) =>
      list.length >= 4 && list.every((t, i) => i === 0 || Number(t.text) === Number(list[i - 1].text) + 1),
  );
  const wideCols = columns.filter(({ list }) => list.length >= 4);
  /** "two" = 左右2段組（今までの紙）／"one" = 1段（山が1つ以上） */
  let mode, slotCols, center, slots, pitch;
  if (runCols.length === 2) {
    mode = "two";
    slotCols = runCols;
    center = (slotCols[0].x + slotCols[1].x) / 2;
    slots = slotCols
      .flatMap(({ x, list }) => list.map((t) => ({ n: Number(t.text), y: t.y, side: x < center ? "L" : "R" })))
      .sort((a, b) => a.n - b.n);
    if (slots.some((s, i) => s.n !== i + 1)) return bail("スロット番号が 1 から連番になっていない");
    pitch = Math.abs(slots[1].y - slots[0].y);
  } else if (wideCols.length === 1) {
    mode = "one";
    slotCols = wideCols;
    /*
      ★**1段の紙では「中心」が無い。** すべて左側として扱い、
      **深さは x が大きいほど深い**（`depth` と `side` の判定がこれで揃う）。
    */
    center = Infinity;
    slots = slotCols[0].list.map((t) => ({ n: Number(t.text), y: t.y, side: "L" }));
    /*
      ★★**間隔は「中央値」で取ること。** 山と山のあいだは大きく空くので、
      いちばん狭い隙間や平均を使うと**校名を拾う窓（`pitch / 2`）が狂う。**
    */
    const gaps = slots.slice(1).map((s, i) => s.y - slots[i].y).filter((g) => g > 0).sort((a, b) => a - b);
    if (!gaps.length) return bail("スロットの間隔が測れない");
    pitch = gaps[Math.floor(gaps.length / 2)];
  } else {
    return bail(`スロット番号の列が ${runCols.length} 本（2本のはず）`);
  }

  /*
    ---- 2. 校名 ----
    ★**同じスロットに2行ぶんあることがある**（長い連合チーム名）。上から順につなぐ。

    ★★★**1段の紙では「スロット番号の列より左」だけを見ること**（2026-09-02 その3。大阪の秋季）。
    **紙の右側に、別の小さな枝が同じ高さで刷ってあることがある**
    （`第5ブロック` の右に `三位決定戦`。どちらも y=85〜175）。
    **左右を分けずに拾うと、右の校名が左のスロットにくっついて
    `太成学院大高太成学院大高・近大附…` という校名になる**（実際になった）。
    ★**2段組の紙は今までどおり中心で左右に分ける**（そちらは1バイトも変わらない）。
  */
  const nameTexts = texts.filter((t) => /^b\b/.test(t.cls));
  const nameMax = mode === "one" ? slotCols[0].x : Infinity;
  for (const s of slots) {
    s.name = nameTexts
      .filter(
        (t) => t.x < nameMax && (t.x < center ? "L" : "R") === s.side && Math.abs(t.y - s.y) < pitch / 2,
      )
      .sort((a, b) => a.y - b.y)
      .map((t) => t.text)
      .join("");
  }
  const empty = slots.filter((s) => !s.name);
  if (empty.length) return bail(`校名の無いスロットがある（${empty.map((s) => s.n).join(",")}）`);

  /*
    ---- 3. 枝の線 ----
    ★**`<line …/>` を `[^>]*\/>` で拾わないこと**（実際に0本になった）。
    `[^>]*` が閉じの `/` まで食べてしまう。**`>` まででよい。**
  */
  const lines = [...html.matchAll(/<line\b([^>]*)>/g)].map((m) => ({
    x1: num(m[1], "x1"),
    y1: num(m[1], "y1"),
    x2: num(m[1], "x2"),
    y2: num(m[1], "y2"),
    red: /stroke="red"/.test(m[1]),
  }));
  const vert = lines.filter((l) => Math.abs(l.x1 - l.x2) < 0.5 && Math.abs(l.y1 - l.y2) > 0.5);
  if (!vert.length) return bail("縦の連結線が1本も無い");

  /*
    縦の連結は**中点で2本に割れている**（勝った側だけ赤く塗るため）。
    同じ x で端点を共有する2本を1試合とみなす。
  */
  const byX = new Map();
  for (const l of vert) {
    const k = [...byX.keys()].find((v) => Math.abs(v - l.x1) <= 1) ?? l.x1;
    if (!byX.has(k)) byX.set(k, []);
    byX.get(k).push({ ...l, lo: Math.min(l.y1, l.y2), hi: Math.max(l.y1, l.y2) });
  }
  const joins = [];
  for (const [x, list] of byX) {
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const a = list[i];
      const j = list.findIndex((b, k) => k !== i && !used.has(k) && Math.abs(b.lo - a.hi) < 0.5);
      const j2 = j >= 0 ? j : list.findIndex((b, k) => k !== i && !used.has(k) && Math.abs(b.hi - a.lo) < 0.5);
      if (j2 < 0) continue;
      const b = list[j2];
      used.add(i);
      used.add(j2);
      const upper = a.lo < b.lo ? a : b;
      const lower = a.lo < b.lo ? b : a;
      joins.push({ x, top: upper.lo, bottom: lower.hi, mid: upper.hi, topRed: upper.red, bottomRed: lower.red });
    }
  }
  if (!joins.length) return bail("連結線の組が1つも作れない");

  /*
    ---- 4. 枝をたどる ----
    ★**浅い回戦から順に。** 左は x が小さいほど浅く、右は大きいほど浅い。
  */
  const depth = (j) => (j.x < center ? j.x : -j.x);
  const ordered = [...joins].sort((a, b) => depth(a) - depth(b));
  /*
    枝 → いまそこにいるチーム。
    ★★**鍵に左右を入れること。** 左右の半分は**同じ高さを使う**ので、
    高さだけで引くと**スロット1と65が同じ枝**になる（実際に128が64に潰れた）。
  */
  const at = new Map();
  const key = (side, y) => side + ":" + Math.round(y * 2) / 2;
  for (const s of slots) at.set(key(s.side, s.y), s.name);
  /*
    ★★**どのスロットとどのスロットが同じ山（サブトーナメント）か**を持つ（2026-09-02 その2）。
    1段の紙は**1枚に山がいくつも並ぶ**（ブロック＋決勝トーナメント）ので、
    **回戦名も、勝ち残りの検算も、山ごとにやらないと合わない。**
    ★2段組の紙では山は1つしか出来ないので、持っていても何も変わらない。
  */
  const parent = slots.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const compOf = new Map();
  slots.forEach((s, i) => compOf.set(key(s.side, s.y), i));
  /** 2つの枝を1つの山にまとめ、勝ち上がった先の枝にもその山を持たせる */
  const merge = (kt, kb, nk) => {
    const ca = find(compOf.get(kt));
    parent[find(compOf.get(kb))] = ca;
    compOf.set(nk, ca);
    return ca;
  };

  const scores = texts.filter(
    /*
      ★★**得点のクラスは紙で違う**（2026-09-02 その2）。
      2段組の紙は `y_f9`（決勝だけ `y_f7`）。**1段の紙は全部 `y_f7`。**
      ★**2段組では `y_f7` を混ぜないこと** —— 決勝の得点を準決勝の枝が拾う余地ができる。
    */
    (t) => (t.cls === "y_f9" || (mode === "one" && t.cls === "y_f7")) && /^\d{1,2}$/.test(t.text),
  );
  const anchors = [...html.matchAll(/<a class="playdt"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => {
      const r = /<rect\b([^>]*)>/.exec(m[1]);
      if (!r) return null;
      return {
        x: num(r[1], "x"),
        y: num(r[1], "y"),
        w: num(r[1], "width"),
        h: num(r[1], "height"),
        label: [...m[1].matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((t) => t[2].trim()).filter(Boolean),
      };
    })
    .filter(Boolean);

  const games = [];
  /** ★**不戦勝の数**（枠は使うが試合は行われていない）。呼ぶ側の検算に渡す */
  let byes = 0;
  /*
    ★**スロット番号の文字は枝の線より 4 ポイント下にある**（文字の基準線）。
    枝の高さで引くので、**許容を 8 まで広げる**（スロットの間隔は 30 なので混ざらない）。
  */
  const findKey = (side, y) => {
    const k = [...at.keys()].find(
      (v) => v.startsWith(side + ":") && Math.abs(Number(v.slice(2)) - y) <= 8,
    );
    return k ?? null;
  };
  for (const j of ordered) {
    const side = j.x < center ? "L" : "R";
    const kt = findKey(side, j.top);
    const kb = findKey(side, j.bottom);
    if (kt === null || kb === null) continue; // まだ前の回戦が終わっていない枝
    const A = at.get(kt);
    const B = at.get(kb);
    if (!A || !B) continue;
    /*
      ★**得点は「連結線のすぐ外側」×「枝の高さ」で引く。**
      左半分は線の右、右半分は線の左に置かれる（実測で4ポイント）。
    */
    const pick = (y) =>
      scores
        .filter((t) => Math.abs(t.x - j.x) <= 10 && Math.abs(t.y - y) <= 10)
        .sort((p, q) => Math.abs(p.y - y) - Math.abs(q.y - y))[0] ?? null;
    const st = pick(j.top);
    const sb = pick(j.bottom);
    /*
      ★★**得点が無い枝は2種類ある**（2026-08-21。福岡の春季・秋季で踏んだ）。

        1. **不戦勝・棄権** … 試合が行われていない。**枝は赤で勝者が描いてある**
        2. **まだ終わっていない** … 色も付いていない

      ★**1で止めてはいけない。** 止めると**その先の枝が永久に埋まらず**、
      決勝まで届かない（「決勝に残ったのが8チーム」という形で出た）。
      **勝者だけ進めて、試合としては出さない**（試合が無いのだから）。
    */
    if (!st || !sb) {
      if (j.topRed !== j.bottomRed) {
        /*
          ★★**不戦勝は数えて返すこと**（2026-09-02）。
          **枠は使うが試合は行われていない**ので、呼ぶ側の
          「チーム数 − 試合数 = 1」がそのままでは必ず1つ足りなくなる
          （鹿児島・愛媛・長崎・高知で、そのために大会がまるごと落ちていた）。
          ★**画面には出さない**（0対0にしない。大阪・石川・群馬と同じ）。
        */
        byes += 1;
        merge(kt, kb, key(side, j.mid));
        at.delete(kt);
        at.delete(kb);
        at.set(key(side, j.mid), j.topRed ? A : B);
      }
      continue;
    }
    const sa = Number(st.text);
    const sbv = Number(sb.text);
    /*
      ---- 検算: 赤い枝と点の多い側が一致するか ----
      ★**出典が2通りの書き方で同じことを言っている。** 食い違ったら読み違えている。
    */
    if (j.topRed !== j.bottomRed && (sa > sbv) !== j.topRed) {
      return bail(`勝った側が線の色と合わない（${A} ${sa}-${sbv} ${B}）`);
    }
    const anchor = anchors.find(
      (a) => Math.abs(a.y + a.h / 2 - j.mid) <= 3 && Math.abs((j.x < center ? a.x + a.w : a.x) - j.x) <= 3,
    );
    const comp = merge(kt, kb, key(side, j.mid));
    games.push({ side, comp, roundX: j.x, a: A, b: B, sa, sb: sbv, label: anchor?.label ?? [] });
    at.delete(kt);
    at.delete(kb);
    at.set(key(side, j.mid), sa === sbv ? null : sa > sbv ? A : B);
  }

  /*
    ---- 5. 決勝 ----
    ★**左右の勝者どうし。** 枝は同じ高さで向かい合うので縦の連結が無い。
    得点は `y_f7` の2つ（左が先）。
    ★★**1段の紙にはこの段は無い**（決勝も普通の縦の連結として描いてある）。
  */
  const finalScores =
    mode === "two"
      ? texts.filter((t) => t.cls === "y_f7" && /^\d{1,2}$/.test(t.text)).sort((a, b) => a.x - b.x)
      : [];
  let champion = null;
  if (finalScores.length === 2) {
    const rest = [...at.entries()].filter(([, v]) => v);
    if (rest.length !== 2) return bail(`決勝に残ったのが ${rest.length} チーム（2チームのはず）`);
    /*
      ★**左右は「枝の x」ではなく「どちらの半分から来たか」で決まる。**
      いま残っている2つは高さがほぼ同じなので、**スロットの側**で見分ける。
    */
    const sideOf = (name) => slots.find((s) => s.name === name)?.side ?? null;
    const L = rest.find(([, v]) => sideOf(v) === "L")?.[1] ?? null;
    const R = rest.find(([, v]) => sideOf(v) === "R")?.[1] ?? null;
    if (!L || !R || L === R) return bail("決勝に残った2チームの左右が決められない");
    const [sa, sb] = finalScores.map((t) => Number(t.text));
    const finalAnchor = anchors.find((a) => a.h > pitch * 4 && Math.abs(a.x + a.w / 2 - center) < pitch * 2);
    games.push({ side: "F", roundX: 0, a: L, b: R, sa, sb, label: finalAnchor?.label ?? [] });
    champion = sa === sb ? null : sa > sb ? L : R;
  }

  /*
    ---- 6. 山（サブトーナメント）と段 ----
    ★★**1段の紙は1枚に山がいくつも並ぶ**（2026-09-02 その2）。
    ブロックがいくつかと、**その優勝校だけで戦う上の山**が1枚に刷ってある
    （岐阜の夏・2020年の代替大会）。**山が1つだけの紙**（小さい大会）も同じ道を通る。

    ★★★**段は2つとは限らない**（2026-09-02 その3。大阪の夏で踏んだ）:

        32ブロック（159校） → 「4回戦・5回戦」の山が8つ → 「準々決勝・準決勝・決勝」の山が1つ

    ★**だから「上の山は1つ」と決め打ちしない。**
    **「その山の出場校が、すべて他の山の優勝校」なら1つ上の段**として、下から順に決める。
  */
  let topComp = null;
  let blockSlots = slots;
  const levelOf = new Map();
  if (mode === "one") {
    /*
      ★**山の番号は、まとめた先が後からまた変わる**（union-find）ので、
      **最後に一度そろえること。** 途中で持った番号のまま比べると、
      **同じ山の試合が2つに割れて見える。**
    */
    slots.forEach((s, i) => {
      s.comp = find(i);
    });
    for (const g of games) g.comp = find(g.comp);
    /*
      ★**山ごとに勝ち残っている校名は `at` から取る**（生きているのはそこだけ）。
      引き分けで止まった山は値が null になり、下の突き合わせは飛ばす。
    */
    const winnerOf = new Map();
    for (const [k, v] of at) {
      const c = compOf.get(k);
      if (c !== undefined && v) winnerOf.set(find(c), v);
    }
    const comps = [...new Set(slots.map((s) => s.comp))];
    /*
      ★★**中黒を外してから比べること**（2026-09-02 その3。大阪で踏んだ）。
      **連合チームの校名が2行に折り返されると「・」が消える**ので、
      **上の山の出場校とブロックの優勝校が、同じ学校なのに一致しない。**
      ★**呼ぶ側が出場校の一覧と比べるときと同じ寄せ方**にそろえてある。
    */
    const bareName = (v) => (v ?? "").replace(/[・･、,\s]/g, "");
    const slotsOf = (c) => slots.filter((s) => s.comp === c);
    const winnerName = (c) => bareName(winnerOf.get(c));
    /** ★詰まったら `HSB_DEBUG=1`。山ごとのスロット数と優勝校が出る */
    if (process.env.HSB_DEBUG) {
      for (const c of comps) {
        const list = slotsOf(c);
        console.log(
          `    [HSB] 山 ${c}: ${list.length}スロット / 優勝 ${winnerOf.get(c) ?? "-"} / ${list.slice(0, 3).map((s) => s.name).join("・")}`,
        );
      }
    }
    /*
      ★★**段を決める。** その山の出場校が**すべて別々の山の優勝校**で埋まれば、
      **その中でいちばん深い段の1つ上**がこの山の段になる。1つでも埋まらなければ 0 段（ブロック）。

      ★**同じ校名の山が2つあることがある** —— ブロックで優勝し、次の段でも優勝した学校は
      **2つの山の優勝校**になる。**いちばん段の深いほうを採る**（そうしないと段が浅く出る）。
    */
    const feedersOf = new Map();
    const levelOfComp = (c, seen) => {
      if (levelOf.has(c)) return levelOf.get(c);
      const used = new Set();
      let deepest = -1;
      let fed = comps.length > 1;
      for (const s of slotsOf(c)) {
        const want = bareName(s.name);
        let best = null;
        let bestLv = -1;
        for (const o of comps) {
          if (o === c || used.has(o) || seen.has(o)) continue;
          if (winnerName(o) !== want) continue;
          const lv = levelOfComp(o, new Set([...seen, c]));
          if (lv > bestLv) {
            bestLv = lv;
            best = o;
          }
        }
        if (best === null) {
          fed = false;
          break;
        }
        used.add(best);
        deepest = Math.max(deepest, bestLv);
      }
      const lv = fed ? deepest + 1 : 0;
      levelOf.set(c, lv);
      if (fed) feedersOf.set(c, used);
      return lv;
    };
    for (const c of comps) levelOfComp(c, new Set());
    /*
      ★★**いちばん上の山はちょうど1つ**（どの山にも食べられていない山）。
      2つ以上なら、**紙を読み違えて山が余分に割れている**か、
      **1枚に別々の大会が刷ってある。** どちらでも出してはいけない。
    */
    const consumed = new Set();
    for (const list of feedersOf.values()) for (const o of list) consumed.add(o);
    const tops = comps.filter((c) => !consumed.has(c));
    if (tops.length !== 1) {
      /*
        ★**どの山が余っているかを必ず出すこと。** 数だけでは追えない ——
        たいていは**校名の書き方が上の山と食い違っている**（折り返しで切れている・略し方が違う）。
      */
      return bail(
        `いちばん上の山が ${tops.length} つある（山は全部で ${comps.length} つ）: ` +
          tops
            .map((c) => `[${slotsOf(c).length}校 優勝 ${winnerOf.get(c) ?? "-"}]`)
            .join(" / "),
      );
    }
    topComp = tops[0];
    /*
      ★★**返すのは 0 段の山のスロットだけ。** 上の段に並ぶのは**同じ学校が2度出ているだけ**で、
      外すと呼ぶ側の「チーム数 − 試合数 = 1」がそのまま成り立つ
      （大阪の第105回は 159校・158試合）。
    */
    blockSlots = slots.filter((s) => levelOf.get(s.comp) === 0);
    /*
      ★★★**返すのは「スロット番号の順」。紙に並んでいる順ではない**（2026-09-02 その2）。
      **ブロックが紙の上で逆さに並ぶ年がある**（岐阜の第105回は 第2ブロック が上、第1ブロック が下）。
      **呼ぶ側は「出場校の一覧」と1対1で突き合わせる**ので、
      **紙の順のまま返すと、その年だけ丸ごと落ちる**（実際に落ちた）。
      ★**番号が 1 から連番になっていることも、ここで確かめる**
      （2段組の紙で前からやっている検査と同じもの。読み違えれば必ず穴が開く）。
    */
    blockSlots = [...blockSlots].sort((x, y) => x.n - y.n);
    if (blockSlots.some((s, i) => s.n !== i + 1)) {
      return bail("ブロックのスロット番号が 1 から連番になっていない");
    }
    /*
      ★★**山ごとに、紙に刷ってある優勝校と突き合わせる。**
      見出し（`Aブロック`）はスロット番号の列より左、**優勝校は右**に刷ってある。
    */
    const labelX = slotCols[0].x;
    for (const c of comps) {
      const ys = slotsOf(c).map((s) => s.y);
      const lo = Math.min(...ys) - pitch;
      const hi = Math.max(...ys) + pitch;
      const printed = texts.filter((t) => t.cls === "y_f14" && t.x > labelX && t.y > lo && t.y < hi);
      const won = winnerOf.get(c);
      if (printed.length !== 1 || !won) continue;
      const a = bareName(printed[0].text);
      const w = bareName(won);
      if (!(a.includes(w) || w.includes(a))) {
        return bail(`山の優勝校が紙と合わない（紙「${printed[0].text}」/ 組み立て「${won}」）`);
      }
    }
    champion = winnerOf.get(topComp) ?? null;
  }

  /*
    ---- 7. 回戦名 ----
    ★**深さは「連結線の x」で決まる**（帯を探す必要が無い）。
    深いほうから 決勝・準決勝・準々決勝、浅いほうから 1回戦・2回戦…。
  */
  /*
    ★★**深さは「半分ごと」に数えること。** 左右で連結線の x は別の並びなので、
    まとめて並べると**右半分が全部浅い回戦**になる
    （実際に「8回戦・9回戦…」という名前が出た）。
    ★**左は x が小さいほど浅く、右は大きいほど浅い。**
  */
  const deep = ["決勝", "準決勝", "準々決勝"];
  if (mode === "two") {
    const bandsOf = (side) =>
      [...new Set(games.filter((g) => g.side === side).map((g) => g.roundX))].sort((a, b) =>
        side === "L" ? a - b : b - a,
      );
    const bands = { L: bandsOf("L"), R: bandsOf("R") };
    /*
      ★★**左右で回戦の数が1つ違う紙がある**（2026-09-02 その2。岐阜の第104回）。
      **出場校が2のべき乗をまたぐと、片側だけ1回戦が増える**
      （65校なら左33・右32で、左だけ6回戦・右は5回戦）。**紙は正しい。**
      ★**2つ以上違ったら読み違えを疑って落とす。**
    */
    if (Math.abs(bands.L.length - bands.R.length) > 1) {
      return bail(`左右で回戦の数が違う（左 ${bands.L.length} / 右 ${bands.R.length}）`);
    }
    /*
      ★★★**回戦は「決勝から数える」こと。浅いほうから数えない。**
      浅いほうから数えると、**1回戦が無い側の全部が1つずつ浅い名前**になる
      （右の2回戦が「1回戦」として画面に出る）。
      ★**左右の回戦数が同じ紙では、今までとまったく同じ番号になる。**
    */
    const rounds = Math.max(bands.L.length, bands.R.length);
    for (const g of games) {
      const list = g.side === "F" ? null : bands[g.side];
      const i =
        list === null ? rounds : rounds - 1 - (list.length - 1 - list.indexOf(g.roundX));
      const fromTop = rounds - i;
      g.round = fromTop < deep.length ? deep[fromTop] : `${i + 1}回戦`;
    }
  } else {
    /*
      ★★★**1段の紙の回戦は「下の段から順に」数える**（2026-09-02 その3）。
      ブロックの決勝（16チームなら4戦目）は、**大会全体では準々決勝**にあたる。
      ★★**段は2つとは限らない** —— 大阪の夏は
      **ブロック（1〜3回戦）→「4回戦・5回戦」の山 →「準々決勝・準決勝・決勝」の山**の3段。
      ★**同じ段の山どうしは連結線の x がそろっている**ので、まとめて並べてよい。
      ★**段が違えば x は重なる**（岐阜は 240・300 がブロックにも上の山にも出る）ので、
      **必ず段で分けてから数えること。**
    */
    const bandsAt = new Map();
    for (const g of games) {
      const lv = levelOf.get(g.comp) ?? 0;
      if (!bandsAt.has(lv)) bandsAt.set(lv, new Set());
      bandsAt.get(lv).add(g.roundX);
    }
    const levels = [...bandsAt.keys()].sort((a, b) => a - b);
    const bands = new Map(levels.map((lv) => [lv, [...bandsAt.get(lv)].sort((a, b) => a - b)]));
    const offset = new Map();
    let acc = 0;
    for (const lv of levels) {
      offset.set(lv, acc);
      acc += bands.get(lv).length;
    }
    const indexOf = (g) => {
      const lv = levelOf.get(g.comp) ?? 0;
      return offset.get(lv) + bands.get(lv).indexOf(g.roundX);
    };
    const last = acc - 1;
    for (const g of games) {
      const i = indexOf(g);
      const fromTop = last - i;
      g.round = fromTop < deep.length ? deep[fromTop] : `${i + 1}回戦`;
    }
  }
  for (const g of games) {
    delete g.roundX;
    delete g.side;
    delete g.comp;
  }
  /*
    ---- 7. 球場の凡例 ----
    表のいちばん下に「記号 → 球場名」が横に並ぶ（`北  北九州市民球場`）。
    ★**1文字の記号と、その右 30 ポイントほどにある名前**を組にする。
    ★**スロットより下だけを見る**（表の中の1文字と混ざらないように）。
  */
  const bottom = Math.max(...slots.map((s) => s.y)) + pitch;
  const legend = new Map();
  for (const t of texts.filter((t) => t.y > bottom && [...t.text].length === 1)) {
    const name = texts.find(
      (u) => Math.abs(u.y - t.y) < 2 && u.x > t.x && u.x - t.x < 45 && /球場|スタジアム|ドーム|パーク/.test(u.text),
    );
    if (name) legend.set(t.text, name.text);
  }
  /*
    ---- 8. 順位決定戦 ----
    ★★★**勝ち抜き表の下に「順位決定戦」がある紙がある**（2026-09-04。高知・愛媛・徳島の春季）。
    **四国大会へ進む枠を決める試合**で、**日付と両校名だけが刷ってあり、得点は無い。**

        410 385  順位決定戦
        438 385  4/11(土) 10:00
        460 335  高知商業      460 435  高知農業

    ★★**この試合は出せない**（得点が無い）。**返すのは「あった」ことと出場2校だけ。**
    ★**呼ぶ側はこれを使って2つ緩める**:
      ①**一覧のほうが多いぶんが、この2校のうち表に無いほうだけなら受ける**
      ②★★**準優勝は突き合わせない** —— **一覧の準優勝はこの試合の結果**であって、
        勝ち抜き表の決勝で負けた学校ではない。**優勝校は今までどおり突き合わせる。**
  */
  const placementLabel = texts.find((t) => /^(順位|順位.?)決定戦$/.test(t.text.replace(/\s/g, "")));
  let placement = null;
  if (placementLabel) {
    /*
      ★**ラベルより下の、いちばん近い行に2校が並ぶ。**
      日付・球場の記号・「使用球場」は落とす（数字を含む・1文字・見出しの語）。
    */
    const below = texts
      .filter((t) => t.y > placementLabel.y && t.y < placementLabel.y + pitch * 3)
      /*
        ★★**枝の中の校名を拾わないこと。** 順位決定戦はラベルの真下に中央寄せで刷ってあるが、
        **同じ高さに勝ち抜き表の校名やスコアがある**（徳島はラベルの10ポイント下に
        スロット27の `阿波` が x=717 で並ぶ）。**ラベルの近く（左右120ポイント）だけ見る。**
      */
      .filter((t) => Math.abs(t.x - placementLabel.x) < 120)
      .filter((t) => ![...t.text].some((c) => /[0-9()／/:]/.test(c)))
      .filter((t) => [...t.text].length >= 2 && !/使用球場|順位|決定戦/.test(t.text))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const row = below.filter((t) => Math.abs(t.y - below[0]?.y) < 2);
    if (row.length === 2) placement = { label: placementLabel.text, teams: row.map((t) => t.text) };
  }

  /*
    ★★**返すスロットからは「決勝トーナメントの山」を外す**（2026-09-02 その2）。
    あちらに並ぶのは**他の山の優勝校**で、**同じ学校がこの紙に2度出ている**だけ。
    ★**外すと「チーム数 − 試合数 = 1」がそのまま成り立つ**
    （岐阜の第107回は 63チーム・62試合）。呼ぶ側の検算を変えなくてよい。
  */
  return {
    slots: blockSlots,
    games,
    byes,
    champion,
    legend,
    /** ★**勝ち抜き表の外にある「順位決定戦」**（得点が無いので試合としては返さない） */
    placement,
    printedChampion: texts.find((t) => t.cls === "y_f18" && /優勝/.test(t.text))?.text ?? null,
  };
}
