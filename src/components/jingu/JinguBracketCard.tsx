import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";

import type { BracketGame, JinguBracket } from "@/lib/jingu-bracket";

/**
 * トップに置く、明治神宮大会（高校の部）のトーナメント表。
 *
 * ------------------------------------------------------------------
 * ★★ **一般的な形**（2026-11-20。運営者が添付した例）: **校名が左に縦に並び、対戦する2つを「コの字」の線で結び、
 *   真ん中から次の回戦へ線を出す。** 得点は結び目の線の上下（上のチームが上、下のチームが下）に書く。
 *   ★**シード（2回戦から）の校名は長い線で2回戦の結び目まで伸びる。**
 *
 * ★★ **赤にするのは線だけ**（運営者の指示 2026-11-20「赤くするのは線だけで良い。校名まで赤くする必要なし」）。
 *   校名・得点・優勝校は黒で、**勝った側は太字**。負けた側・まだ終わっていない試合の線は黒。
 *   結び目の縦線は**勝った側の半分だけ赤**にする（添付の表のとおり）。
 *   **途中の得点は出すが赤にしない**（勝者は開始から3時間たった試合だけ。`isFinished`）。
 * ★**オレンジ（accent）は使わない** —— 公立の印と取り違えるので、運営者が指定した赤を別に持つ。字と線だけ。
 *
 * ★★ **10校の形だけを描く**（`buildJinguBracket` が形に合わなければ null）。
 *   上から 2回戦×4試合（8席）のうち、第3試合の下の席と第4試合の上の席が「1回戦の勝者」。
 *
 * ★★ **サーバーコンポーネント・JavaScript なし**。SVG 1枚。**幅が足りないスマホでは横にスクロール**
 *   （縮めると字が読めなくなる。校名がこのサイトの主役）。読み上げ用に文章の一覧も出す（`sr-only`）。
 * ★★ **主催者の表を取りに行く**（`getJinguLive`。`fetch` の期限は5分）ので、**これを置いたページは5分で作り直される。**
 *   トップは `jinguBracketWindow()` の期間（11/10〜11/30）だけ置く。
 */

const RED = "#d92d20";
const INK = "#1f2937";
const MUTED = "#64748b";
const BLACK = "#334155";
const BOX_FILL = "#f1f5fb";
const BOX_LINE = "#cfd7e3";

const ROW_H = 34;
const NAME_W = 124;
const BOX_H = 26;
const X = { r1: 176, r2: 262, sf: 348, f: 434, champ: 500 } as const;
const WIDTH = 660;
const TOP = 30; // 見出し（回戦の札）の高さ
const rowY = (i: number) => TOP + 14 + i * ROW_H;
const HEIGHT = TOP + 14 + 9 * ROW_H + 24;

type Slot = BracketGame["teams"][number];

/** 結び目（2つの入力が1つに合わさる点） */
type Join = {
  x: number;
  game: BracketGame;
  /** 上の入力・下の入力の y と、それぞれの席（得点・勝敗） */
  upY: number;
  lowY: number;
  up: Slot;
  low: Slot;
  /** 出ていく線の y（2つの入力の真ん中） */
  outY: number;
};

const join = (x: number, game: BracketGame, upY: number, lowY: number): Join => ({
  x,
  game,
  upY,
  lowY,
  up: game.teams[0],
  low: game.teams[1],
  outY: (upY + lowY) / 2,
});

export function JinguBracketCard({
  bracket,
  year,
  period,
  no,
}: {
  bracket: JinguBracket;
  year: number;
  /** 「11月19日(木)〜24日(火)」。取れなければ null */
  period: string | null;
  /** 「第57回」。取れなければ null */
  no: string | null;
}) {
  const { r1, r2, sf, f, champion } = bracket;

  // 校名の行（上から10行）。2回戦の第3試合の下の席・第4試合の上の席は「1回戦の勝者」なので行を持たない
  const rows: { name: string | null; won: boolean }[] = [
    { name: r2[0].teams[0].name, won: r2[0].teams[0].won },
    { name: r2[0].teams[1].name, won: r2[0].teams[1].won },
    { name: r2[1].teams[0].name, won: r2[1].teams[0].won },
    { name: r2[1].teams[1].name, won: r2[1].teams[1].won },
    { name: r2[2].teams[0].name, won: r2[2].teams[0].won },
    { name: r1[0].teams[0].name, won: r1[0].teams[0].won },
    { name: r1[0].teams[1].name, won: r1[0].teams[1].won },
    { name: r1[1].teams[0].name, won: r1[1].teams[0].won },
    { name: r1[1].teams[1].name, won: r1[1].teams[1].won },
    { name: r2[3].teams[1].name, won: r2[3].teams[1].won },
  ];
  // 校名の行は「その学校が1勝でもしていれば」太字（勝ち上がった学校）。赤にはしない
  const advanced = new Set<string>();
  for (const g of [...r1, ...r2, ...sf, f]) for (const t of g.teams) if (t.won && t.name) advanced.add(t.name);

  // 結び目。入力の y は、校名の行 or 前の結び目の出口
  const jR1a = join(X.r1, r1[0], rowY(5), rowY(6));
  const jR1b = join(X.r1, r1[1], rowY(7), rowY(8));
  const jG1 = join(X.r2, r2[0], rowY(0), rowY(1));
  const jG2 = join(X.r2, r2[1], rowY(2), rowY(3));
  const jG3 = join(X.r2, r2[2], rowY(4), jR1a.outY);
  const jG4 = join(X.r2, r2[3], jR1b.outY, rowY(9));
  const jS1 = join(X.sf, sf[0], jG1.outY, jG2.outY);
  const jS2 = join(X.sf, sf[1], jG3.outY, jG4.outY);
  const jF = join(X.f, f, jS1.outY, jS2.outY);

  /** 校名の行から結び目までの線（シードは長く伸びる）。その学校がこの試合に勝っていれば赤 */
  const seedLines: { y: number; toX: number; red: boolean }[] = [
    { y: rowY(0), toX: X.r2, red: jG1.up.won },
    { y: rowY(1), toX: X.r2, red: jG1.low.won },
    { y: rowY(2), toX: X.r2, red: jG2.up.won },
    { y: rowY(3), toX: X.r2, red: jG2.low.won },
    { y: rowY(4), toX: X.r2, red: jG3.up.won },
    { y: rowY(5), toX: X.r1, red: jR1a.up.won },
    { y: rowY(6), toX: X.r1, red: jR1a.low.won },
    { y: rowY(7), toX: X.r1, red: jR1b.up.won },
    { y: rowY(8), toX: X.r1, red: jR1b.low.won },
    { y: rowY(9), toX: X.r2, red: jG4.low.won },
  ];

  // 結び目から次の結び目へ伸びる線（勝者が決まっていれば赤）
  const outs: { from: Join; toX: number }[] = [
    { from: jR1a, toX: X.r2 },
    { from: jR1b, toX: X.r2 },
    { from: jG1, toX: X.sf },
    { from: jG2, toX: X.sf },
    { from: jG3, toX: X.sf },
    { from: jG4, toX: X.sf },
    { from: jS1, toX: X.f },
    { from: jS2, toX: X.f },
    { from: jF, toX: X.champ },
  ];
  const joins = [jR1a, jR1b, jG1, jG2, jG3, jG4, jS1, jS2, jF];

  const summary = [
    ...r1.map((g) => `1回戦 ${describe(g)}`),
    ...r2.map((g) => `2回戦 ${describe(g)}`),
    ...sf.map((g) => `準決勝 ${describe(g)}`),
    `決勝 ${describe(f)}`,
  ];

  const stroke = (red: boolean) => (red ? RED : BLACK);
  const sw = (red: boolean) => (red ? 2.25 : 1.5);

  return (
    <section
      aria-labelledby="jingu-bracket-title"
      className="rounded-xl border border-line bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2
            id="jingu-bracket-title"
            className="flex items-center gap-1.5 text-base font-bold text-navy-800 sm:text-lg"
          >
            <Trophy size={18} aria-hidden="true" className="shrink-0 text-accent-500" />
            {year}年 明治神宮大会（高校の部）トーナメント
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {[no, period].filter(Boolean).join("　")}
            {no || period ? "　" : ""}
            <span style={{ color: RED }} className="font-bold">
              赤い線
            </span>
            が勝ち上がり（勝った側は太字）
          </p>
        </div>
        <Link
          href={`/jingu/${year}`}
          className="inline-flex min-h-9 shrink-0 items-center gap-0.5 text-sm font-bold text-navy-800 hover:text-accent-800"
        >
          日程・出場校の詳細
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-2 text-[0.6875rem] text-ink-faint sm:hidden">← 横にスクロールして決勝まで見られます →</p>
      <div className="mt-1 overflow-x-auto sm:mt-3">
        <svg
          role="img"
          aria-label={`${year}年 明治神宮大会 高校の部のトーナメント表。${
            champion ? `優勝は${champion}。` : "優勝校は未定。"
          }`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          className="block h-auto min-w-[660px] max-w-none"
        >
          {/* 回戦の札（暗い地に白字） */}
          {(
            [
              ["1回戦", X.r1],
              ["2回戦", X.r2],
              ["準決勝", X.sf],
              ["決勝", X.f],
            ] as const
          ).map(([label, x]) => (
            <g key={label}>
              <rect x={x - 28} y={2} width={56} height={22} rx={11} fill="#1b2a4a" />
              <text x={x} y={17} fontSize={11.5} fontWeight={700} textAnchor="middle" fill="#fff">
                {label}
              </text>
            </g>
          ))}

          {/* ---- 線（黒を先に、赤を後に描いて、赤を上に重ねる）---- */}
          {[false, true].map((redPass) => (
            <g key={String(redPass)} strokeLinecap="round" strokeLinejoin="round" fill="none">
              {/* 校名の行から結び目まで */}
              {seedLines
                .filter((l) => l.red === redPass)
                .map((l, i) => (
                  <line
                    key={`s${i}`}
                    x1={NAME_W}
                    x2={l.toX}
                    y1={l.y}
                    y2={l.y}
                    stroke={stroke(l.red)}
                    strokeWidth={sw(l.red)}
                  />
                ))}
              {/* 結び目から次の結び目へ（勝者が決まっていれば赤） */}
              {outs
                .filter((o) => o.from.game.decided === redPass)
                .map((o, i) => (
                  <line
                    key={`o${i}`}
                    x1={o.from.x}
                    x2={o.toX}
                    y1={o.from.outY}
                    y2={o.from.outY}
                    stroke={stroke(o.from.game.decided)}
                    strokeWidth={sw(o.from.game.decided)}
                  />
                ))}
              {/* 結び目の縦線。上半分は上の入力、下半分は下の入力。勝った側の半分だけ赤 */}
              {joins.map((j, i) => (
                <g key={`v${i}`}>
                  {j.up.won === redPass && (
                    <line
                      x1={j.x}
                      x2={j.x}
                      y1={j.upY}
                      y2={j.outY}
                      stroke={stroke(j.up.won)}
                      strokeWidth={sw(j.up.won)}
                    />
                  )}
                  {j.low.won === redPass && (
                    <line
                      x1={j.x}
                      x2={j.x}
                      y1={j.outY}
                      y2={j.lowY}
                      stroke={stroke(j.low.won)}
                      strokeWidth={sw(j.low.won)}
                    />
                  )}
                </g>
              ))}
            </g>
          ))}

          {/* ---- 校名の箱 ---- */}
          {rows.map((r, i) => {
            const red = r.name !== null && advanced.has(r.name);
            return (
              <g key={`n${i}`}>
                <rect
                  x={0}
                  y={rowY(i) - BOX_H / 2}
                  width={NAME_W}
                  height={BOX_H}
                  rx={4}
                  fill={BOX_FILL}
                  stroke={BOX_LINE}
                />
                <text
                  x={NAME_W / 2}
                  y={rowY(i) + 4.5}
                  fontSize={13}
                  fontWeight={red ? 700 : 500}
                  textAnchor="middle"
                  fill={r.name ? INK : MUTED}
                  fontStyle={r.name ? "normal" : "italic"}
                >
                  {r.name ?? "未定"}
                </text>
              </g>
            );
          })}

          {/* ---- 得点（結び目の出口の線の上下）。まだ得点が無い試合は日時 ---- */}
          {joins.map((j, i) => {
            const hasScore = j.up.score !== null && j.low.score !== null;
            return (
              <g key={`t${i}`}>
                {hasScore ? (
                  <>
                    <text
                      x={j.x + 6}
                      y={j.outY - 5}
                      fontSize={13}
                      fontWeight={j.up.won ? 700 : 400}
                      fill={j.up.won ? INK : MUTED}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {j.up.score}
                    </text>
                    <text
                      x={j.x + 6}
                      y={j.outY + 15}
                      fontSize={13}
                      fontWeight={j.low.won ? 700 : 400}
                      fill={j.low.won ? INK : MUTED}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {j.low.score}
                    </text>
                  </>
                ) : (
                  j.game.label && (
                    <text x={j.x + 6} y={j.outY - 5} fontSize={9.5} fill={MUTED}>
                      {j.game.label}
                    </text>
                  )
                )}
              </g>
            );
          })}

          {/* ---- 優勝 ---- */}
          <text x={X.champ + 8} y={jF.outY - 8} fontSize={10.5} fontWeight={700} fill={MUTED}>
            優勝
          </text>
          <text
            x={X.champ + 8}
            y={jF.outY + 12}
            fontSize={14}
            fontWeight={700}
            fill={champion ? INK : MUTED}
            fontStyle={champion ? "normal" : "italic"}
          >
            {champion ?? "未定"}
          </text>
        </svg>
      </div>

      <ul className="sr-only">
        {summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
        主催者（日本学生野球協会）の発表を約5分ごとに取り直しています。得点が出ていても試合の途中のことがあり、
        勝ちの印（赤い線・太字）は開始から3時間たった試合にだけ付けています。
      </p>
    </section>
  );
}

function describe(g: BracketGame): string {
  const [a, b] = g.teams;
  const name = (n: string | null) => n ?? "未定";
  if (a.score === null || b.score === null) return `${name(a.name)} 対 ${name(b.name)}（${g.label ?? "日程未定"}）`;
  return `${name(a.name)} ${a.score} 対 ${b.score} ${name(b.name)}${g.winner ? `、勝ちは${g.winner}` : "（試合中の場合があります）"}`;
}
