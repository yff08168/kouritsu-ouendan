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
    ★**左右2列ある。** x でまとめて、**連番になっている列**だけを採る。
  */
  const cols = new Map();
  for (const t of texts.filter((t) => t.cls === "y_f8" && /^\d+$/.test(t.text))) {
    const k = [...cols.keys()].find((v) => Math.abs(v - t.x) <= 6) ?? t.x;
    if (!cols.has(k)) cols.set(k, []);
    cols.get(k).push(t);
  }
  const slotCols = [...cols.entries()]
    .map(([x, list]) => ({ x, list: list.sort((a, b) => a.y - b.y) }))
    .filter(
      ({ list }) =>
        list.length >= 4 && list.every((t, i) => i === 0 || Number(t.text) === Number(list[i - 1].text) + 1),
    )
    .sort((a, b) => a.x - b.x);
  if (slotCols.length !== 2) return bail(`スロット番号の列が ${slotCols.length} 本（2本のはず）`);
  const center = (slotCols[0].x + slotCols[1].x) / 2;
  const slots = slotCols
    .flatMap(({ x, list }) => list.map((t) => ({ n: Number(t.text), y: t.y, side: x < center ? "L" : "R" })))
    .sort((a, b) => a.n - b.n);
  if (slots.some((s, i) => s.n !== i + 1)) return bail("スロット番号が 1 から連番になっていない");
  const pitch = Math.abs(slots[1].y - slots[0].y);

  /*
    ---- 2. 校名 ----
    ★**同じスロットに2行ぶんあることがある**（長い連合チーム名）。上から順につなぐ。
  */
  const nameTexts = texts.filter((t) => /^b\b/.test(t.cls));
  for (const s of slots) {
    s.name = nameTexts
      .filter((t) => (t.x < center ? "L" : "R") === s.side && Math.abs(t.y - s.y) < pitch / 2)
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

  const scores = texts.filter((t) => t.cls === "y_f9" && /^\d{1,2}$/.test(t.text));
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
    games.push({ side, roundX: j.x, a: A, b: B, sa, sb: sbv, label: anchor?.label ?? [] });
    at.delete(kt);
    at.delete(kb);
    at.set(key(side, j.mid), sa === sbv ? null : sa > sbv ? A : B);
  }

  /*
    ---- 5. 決勝 ----
    ★**左右の勝者どうし。** 枝は同じ高さで向かい合うので縦の連結が無い。
    得点は `y_f7` の2つ（左が先）。
  */
  const finalScores = texts.filter((t) => t.cls === "y_f7" && /^\d{1,2}$/.test(t.text)).sort((a, b) => a.x - b.x);
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
    ---- 6. 回戦名 ----
    ★**深さは「連結線の x」で決まる**（帯を探す必要が無い）。
    深いほうから 決勝・準決勝・準々決勝、浅いほうから 1回戦・2回戦…。
  */
  /*
    ★★**深さは「半分ごと」に数えること。** 左右で連結線の x は別の並びなので、
    まとめて並べると**右半分が全部浅い回戦**になる
    （実際に「8回戦・9回戦…」という名前が出た）。
    ★**左は x が小さいほど浅く、右は大きいほど浅い。**
  */
  const bandsOf = (side) =>
    [...new Set(games.filter((g) => g.side === side).map((g) => g.roundX))].sort((a, b) =>
      side === "L" ? a - b : b - a,
    );
  const bands = { L: bandsOf("L"), R: bandsOf("R") };
  if (bands.L.length !== bands.R.length) {
    return bail(`左右で回戦の数が違う（左 ${bands.L.length} / 右 ${bands.R.length}）`);
  }
  const rounds = bands.L.length;
  const deep = ["決勝", "準決勝", "準々決勝"];
  for (const g of games) {
    const i = g.side === "F" ? rounds : bands[g.side].indexOf(g.roundX);
    const fromTop = rounds - i;
    g.round = fromTop < deep.length ? deep[fromTop] : `${i + 1}回戦`;
    delete g.roundX;
    delete g.side;
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
  return {
    slots,
    games,
    byes,
    champion,
    legend,
    printedChampion: texts.find((t) => t.cls === "y_f18" && /優勝/.test(t.text))?.text ?? null,
  };
}
