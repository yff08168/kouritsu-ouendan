import Link from "next/link";

import { BracketScroller } from "@/components/results/BracketScroller";
import { cn } from "@/lib/utils";
import type { BracketGame, RegionalBracket as Bracket } from "@/lib/regional-bracket";
import type { RegionalTeam } from "@/lib/regional-results";

/**
 * トーナメント表（地方大会・甲子園・明治神宮の大会ページ、県のページの「いちばん新しい大会」）。
 *
 * ------------------------------------------------------------------
 * ★★★ **一般的な形**（2026-11-20。運営者の「今後トーナメント表を作成する際もこの形にしてね」
 *   「秋季大会だけでなく出来るところは順次作り直して」）
 *
 *   **校名が左に縦に並び、対戦する2つを「コの字」の線で結び、真ん中から次の回戦へ線を出す。**
 *   得点は結び目の出口の線の上下（上のチームが上、下のチームが下）。
 *   **シードの校名は長い線で、出る回戦の結び目まで伸びる。**
 *
 *   ★★**勝ったチームの得点・勝ち上がる線・結び目の縦線の勝った側の半分・勝ち上がった校名は赤。**
 *   負けた側は黒（灰）。**引き分けは勝者なし**（赤にしない）。
 *   ★**オレンジ（accent）は公立の印のまま**（これまでどおり）。**赤と取り違えないよう、
 *   公立は「校名の箱をオレンジの枠にする」**（面で塗らず、枠線だけ）。
 *
 *   ★★**これまでは「回戦ごとの縦の列」だった**（線で結ぶと横に非常に広くなるため。2026-11-20 に
 *   運営者の指示で一般的な形に替えた）。**横に広い表は表の中だけでスクロールさせる**
 *   （ページ本文は横に流れない。`BracketScroller` が上にもバーを出す）。
 *
 * ★★ **枝は `buildRegionalBracket` が検算済み**（組めない大会は組まない）。ここは**描くだけ**。
 *   `seat.from` が「前の試合の番号」、null が「シード（その回戦から出る）」。
 *   ★**決勝から辿って、校名の行は「seat.from が null の席」だけ**（行は深さ優先で上から順に振る）。
 *
 * ★★ **私立の試合もそのまま描く**（枝が切れると勝ち上がりが追えない）。
 * ★**校名は SVG の中でもリンクにする**（公立は学校ページへ。内部リンクを減らさない）。
 *   `<title>` に正式名を入れる。
 * ★**行の高さは出場校が多いと詰める**（東東京のような60校超の表を縦に伸ばしすぎない）。
 * ★**回戦の札は表の上と下に出す**（縦に長い表では、上の札が画面の外に出るため）。
 */

const RED = "#d92d20";
const INK = "#1f2937";
const MUTED = "#64748b";
const BLACK = "#334155";
const BOX_FILL = "#f1f5fb";
const BOX_LINE = "#cfd7e3";
// 公立の箱（オレンジの枠。サイトのアクセントと同じ系統）
const PUBLIC_FILL = "#fff7ed";
const PUBLIC_LINE = "#f08a24";

type Seat = BracketGame["seats"][number];

/** 描画用の木。校名の行（葉）と試合（結び目） */
type Leaf = { kind: "team"; seat: Seat; y: number };
type Node = {
  kind: "game";
  game: BracketGame;
  /** 左から数えた回戦の列（0始まり） */
  col: number;
  children: [Leaf | Node, Leaf | Node];
  outY: number;
  /** 勝った席（0＝上・1＝下）。決まっていなければ null */
  winner: 0 | 1 | null;
};

function layout(bracket: Bracket, rowH: number, top: number) {
  const byIndex = new Map<number, { game: BracketGame; col: number }>();
  bracket.rounds.forEach((r, col) => r.games.forEach((g) => byIndex.set(g.index, { game: g, col })));

  const leaves: Leaf[] = [];
  const nodes: Node[] = [];
  let row = 0;
  const seen = new Set<number>();

  const walk = (index: number): Node | null => {
    const hit = byIndex.get(index);
    if (!hit || seen.has(index)) return null; // 検算済みなので起きないが、循環で落ちないよう守る
    seen.add(index);
    const kids: (Leaf | Node)[] = [];
    for (const seat of hit.game.seats) {
      if (seat.from === null) {
        const leaf: Leaf = { kind: "team", seat, y: top + row * rowH };
        row += 1;
        leaves.push(leaf);
        kids.push(leaf);
      } else {
        const child = walk(seat.from);
        if (!child) return null;
        kids.push(child);
      }
    }
    const [a, b] = kids as [Leaf | Node, Leaf | Node];
    const yOf = (c: Leaf | Node) => (c.kind === "team" ? c.y : c.outY);
    const node: Node = {
      kind: "game",
      game: hit.game,
      col: hit.col,
      children: [a, b],
      outY: (yOf(a) + yOf(b)) / 2,
      winner: hit.game.seats[0].team.won ? 0 : hit.game.seats[1].team.won ? 1 : null,
    };
    nodes.push(node);
    return node;
  };

  const root = walk(bracket.finalIndex);
  if (!root) return null;
  return { root, leaves, nodes, rows: row };
}

export function RegionalBracket({
  bracket,
  className,
}: {
  bracket: Bracket;
  className?: string;
}) {
  // 行の高さ: 出場校が多いほど詰める
  const teamCount = bracket.rounds.reduce(
    (n, r) => n + r.games.reduce((m, g) => m + g.seats.filter((s) => s.from === null).length, 0),
    0,
  );
  const rowH = teamCount <= 16 ? 34 : teamCount <= 36 ? 28 : 24;
  const boxH = rowH - 6;
  const TOP = 36;

  const built = layout(bracket, rowH, TOP + 14);
  if (!built) return null;
  const { root, leaves, nodes } = built;

  // 幅: 校名の箱は最長の校名に合わせる
  const longest = Math.max(...leaves.map((l) => [...l.seat.team.display].length), 4);
  const NAME_W = Math.min(220, Math.max(96, Math.round(longest * 12.5 + 18)));
  const COL_W = 84;
  const cols = bracket.rounds.length;
  const joinX = (col: number) => NAME_W + 46 + col * COL_W;
  const X_CHAMP = joinX(cols - 1) + COL_W - 16;
  const WIDTH = X_CHAMP + 150;
  const HEIGHT = TOP + 14 + (leaves.length - 1) * rowH + 40 + TOP;
  const bottomY = HEIGHT - 12;

  const stroke = (red: boolean) => (red ? RED : BLACK);
  const sw = (red: boolean) => (red ? 2.25 : 1.5);

  const champion = root.winner !== null ? root.game.seats[root.winner].team : null;
  const label = (n: Node) => n.game.round;

  return (
    <div className={cn("mt-3", className)}>
      <BracketScroller>
        <div className="min-w-max">
          <svg
            role="img"
            aria-label={`トーナメント表。${bracket.total}試合。${
              champion ? `優勝は${champion.display}。` : "優勝校は決まっていません。"
            }`}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width={WIDTH}
            height={HEIGHT}
            className="block max-w-none"
          >
            {/* 回戦の札（暗い地に白字）。縦に長い表のため、上と下の両方に出す */}
            {bracket.rounds.map((r, col) =>
              [8, bottomY - 20].map((y, k) => (
                <g key={`${r.round}-${k}`}>
                  <rect x={joinX(col) - 30} y={y} width={60} height={20} rx={10} fill="#1b2a4a" />
                  <text
                    x={joinX(col)}
                    y={y + 14}
                    fontSize={11}
                    fontWeight={700}
                    textAnchor="middle"
                    fill="#fff"
                  >
                    {r.round}
                  </text>
                </g>
              )),
            )}

            {/* ---- 線（黒を先に、赤を後に描いて、赤を上に重ねる）---- */}
            {[false, true].map((redPass) => (
              <g key={String(redPass)} fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* 校名の行から結び目まで（その学校が勝っていれば赤） */}
                {nodes.flatMap((n) =>
                  n.children.map((c, i) =>
                    c.kind === "team" && (n.game.seats[i].team.won === redPass) ? (
                      <line
                        key={`s${n.game.index}-${i}`}
                        x1={NAME_W}
                        x2={joinX(n.col)}
                        y1={c.y}
                        y2={c.y}
                        stroke={stroke(redPass)}
                        strokeWidth={sw(redPass)}
                      />
                    ) : null,
                  ),
                )}
                {/* 結び目から次の結び目へ（勝者が決まっていれば赤） */}
                {nodes.map((n) => {
                  const decided = n.winner !== null;
                  if (decided !== redPass) return null;
                  const parent = nodes.find((p) => p.children.includes(n));
                  const toX = parent ? joinX(parent.col) : X_CHAMP;
                  return (
                    <line
                      key={`o${n.game.index}`}
                      x1={joinX(n.col)}
                      x2={toX}
                      y1={n.outY}
                      y2={n.outY}
                      stroke={stroke(decided)}
                      strokeWidth={sw(decided)}
                    />
                  );
                })}
                {/* 結び目の縦線。勝った側の半分だけ赤 */}
                {nodes.map((n) => {
                  const yOf = (c: Leaf | Node) => (c.kind === "team" ? c.y : c.outY);
                  const [a, b] = n.children;
                  const x = joinX(n.col);
                  return (
                    <g key={`v${n.game.index}`}>
                      {(n.winner === 0) === redPass && (
                        <line
                          x1={x}
                          x2={x}
                          y1={yOf(a)}
                          y2={n.outY}
                          stroke={stroke(redPass)}
                          strokeWidth={sw(redPass)}
                        />
                      )}
                      {(n.winner === 1) === redPass && (
                        <line
                          x1={x}
                          x2={x}
                          y1={n.outY}
                          y2={yOf(b)}
                          stroke={stroke(redPass)}
                          strokeWidth={sw(redPass)}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            ))}

            {/* ---- 校名の箱 ---- */}
            {leaves.map((l) => {
              const t = l.seat.team;
              const isPublic = Boolean(t.slug || t.closed);
              const advanced = nodes.some((n) =>
                n.children.some((c, i) => c === l && n.game.seats[i].team.won),
              );
              // 校名が箱より長いときは字を詰める（連合チームの長い名前）
              const chars = [...t.display].length;
              const tooLong = chars * 12.5 > NAME_W - 10;
              const text = (
                <text
                  x={NAME_W / 2}
                  y={l.y + 4.5}
                  fontSize={12.5}
                  fontWeight={advanced ? 700 : 500}
                  textAnchor="middle"
                  fill={advanced ? RED : INK}
                  textLength={tooLong ? NAME_W - 12 : undefined}
                  lengthAdjust={tooLong ? "spacingAndGlyphs" : undefined}
                >
                  {t.display}
                </text>
              );
              const box = (
                <g>
                  <title>{t.name}</title>
                  <rect
                    x={0}
                    y={l.y - boxH / 2}
                    width={NAME_W}
                    height={boxH}
                    rx={4}
                    fill={isPublic ? PUBLIC_FILL : BOX_FILL}
                    stroke={isPublic ? PUBLIC_LINE : BOX_LINE}
                    strokeWidth={isPublic ? 1.5 : 1}
                  />
                  {text}
                </g>
              );
              return (
                <g key={`n${l.seat.team.display}-${l.y}`}>
                  {t.slug ? <Link href={`/schools/${t.slug}`}>{box}</Link> : box}
                </g>
              );
            })}

            {/* ---- 得点（結び目の出口の線の上下）---- */}
            {nodes.map((n) => {
              const [u, d] = n.game.seats;
              const x = joinX(n.col);
              return (
                <g key={`t${n.game.index}`}>
                  <text
                    x={x + 6}
                    y={n.outY - 4}
                    fontSize={12}
                    fontWeight={u.team.won ? 700 : 400}
                    fill={u.team.won ? RED : MUTED}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {u.team.score}
                  </text>
                  <text
                    x={x + 6}
                    y={n.outY + 14}
                    fontSize={12}
                    fontWeight={d.team.won ? 700 : 400}
                    fill={d.team.won ? RED : MUTED}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {d.team.score}
                  </text>
                  <title>{label(n)}</title>
                </g>
              );
            })}

            {/* ---- 優勝（決勝の勝者）---- */}
            {champion && (
              <>
                <text x={X_CHAMP + 8} y={root.outY - 8} fontSize={10.5} fontWeight={700} fill={RED}>
                  優勝
                </text>
                <text x={X_CHAMP + 8} y={root.outY + 12} fontSize={14} fontWeight={700} fill={RED}>
                  {champion.display}
                </text>
              </>
            )}
          </svg>
        </div>
      </BracketScroller>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        ※ <strong className="font-medium" style={{ color: RED }}>赤</strong>は勝ったチームと得点、勝ち上がる線です。
        <strong className="font-medium text-accent-800">オレンジの枠</strong>は公立高校（校名を押すと学校ページへ）。
        <br />※ この表は{bracket.total}試合から組み直したものです。
        <strong className="font-medium">私立を含む全試合</strong>
        で組んでいます（枝が切れると勝ち上がりが追えないため）。
      </p>
    </div>
  );
}

/**
 * 箱の中の1チームぶんの行（校名＋得点）。
 *
 * ★★**大会ページの「全試合」も同じ行を使う**（2026-09-25。運営者の指示
 * 「この形式が見やすいので、これにして」）。**表と一覧で見た目をそろえる。**
 * ★**校名のリンクは `relative`** —— 一覧では箱いっぱいに試合ページへの
 * 見えないリンクを敷くので、手前に出さないと学校ページへ行けなくなる。
 */
export function BracketTeamRow({ team }: { team: RegionalTeam }) {
  const nameClass = cn(
    /*
      ★★**`block` を外さないこと**（2026-09-25）。`truncate` は**インラインの箱には効かない**
      （はみ出しを隠す指定がインラインに当たらない）。外していたあいだ、
      **連合チームの長い校名が得点の上に重なっていた**（千葉2026夏で3件。実測 360px が 190px の枠に）。
      ★★**`w-fit max-w-full` で名前の幅だけにする** —— 行いっぱいに広げると、
      一覧の箱では**校名の右の余白を押しても学校ページへ飛ぶ**（試合ページへ行けない）。
      箱は最大350pxあり、校名は60pxほどなので、押せる場所の大半が学校ページになっていた。
    */
    "block w-fit max-w-full truncate",
    team.won ? "font-bold" : "text-ink-muted",
    // ★公立はオレンジ。**面ではなく字の色**（アクセントは小面積のみ）。
    // ★**閉校などで学校ページが無い公立校（`closed`）にも付ける**（リンクだけ張らない）
    team.slug || team.closed ? "text-accent-800" : team.won ? "text-navy-800" : undefined,
  );

  return (
    <div className="flex items-baseline gap-1.5 text-xs leading-snug">
      {/*
        ★**シードの印も 2026-09-09 に外した**（運営者の指示）。
        **前の回戦に出ていないことは、左の列が空いていることで表が示している。**
      */}
      <span className="min-w-0 flex-1">
        {/* 公立は学校ページへ。私立と、閉校した公立（`closed`）は当サイトに個別ページが無い */}
        {team.slug ? (
          <Link
            href={`/schools/${team.slug}`}
            title={team.name}
            className={cn(nameClass, "relative hover:underline")}
          >
            {team.display}
          </Link>
        ) : (
          <span title={team.name} className={nameClass}>
            {team.display}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex-none font-variant-numeric tabular-nums",
          team.won ? "font-bold text-navy-800" : "text-ink-muted",
        )}
      >
        {team.score}
      </span>
      {/*
        ★**トロフィーは 2026-09-09 に外した**（運営者の指示）。
        **勝った側は太字とスコアで分かる**ので、印を足すと
        **1試合につき2つ並んで表が読みにくくなる**（1回戦だけで56個出ていた）。
      */}
    </div>
  );
}
