import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";

import type { BracketGame, JinguBracket } from "@/lib/jingu-bracket";

/**
 * トップに置く、明治神宮大会（高校の部）のトーナメント表。
 *
 * ------------------------------------------------------------------
 * ★★★ **高校は下に横一列。勝ち上がりは上へ進む**（2026-11-20。運営者の
 *   「高校を縦に並べるのではなく、横に並べて、トーナメントは上に進めるように組み直す」）。
 *   **校名の箱を下の端に10校ぶん横に並べ、対戦する2つを「∩」の線で結び、真ん中から上の回戦へ線を出す。**
 *   一番上に「優勝」。回戦の札は左の端に、その回戦の高さで置く。
 *   ★**シード（2回戦から）の校名は長い線で2回戦の高さまで伸びる。**
 *   ★**前の形（校名を左に縦に並べ、右へ進む）には戻さないこと。** 同じ日に運営者が
 *   「縦ではなく横に表示してスペースを有効活用する」と言ったのがこれ（広いカードの右半分が空いていた）。
 *
 * ★★ **赤にするのは線だけ**（運営者の指示 2026-11-20「赤くするのは線だけで良い。校名まで赤くする必要なし」）。
 *   校名・得点・優勝校は黒で、**勝った側は太字**。負けた側・まだ終わっていない試合の線は黒。
 *   結び目の横線は**勝った側の半分だけ赤**にする。
 *   **途中の得点は出すが赤にしない**（勝者は終わった試合だけ。`isFinished`）。
 * ★**オレンジ（accent）は使わない** —— 公立の印と取り違えるので、運営者が指定した赤を別に持つ。字と線だけ。
 *
 * ★★ **得点は結び目の出口の線の左右**（左の高校の得点が左、右の高校が右）。**まだ得点が無い試合は結び目の下に日時。**
 *
 * ★★ **広い画面ほど横に広がる**。高校10校の列は**幅に対する割合**で置く（SVG の `viewBox` を使わない。使うと字も高さも
 *   拡大して縦に伸びる）。**字の大きさと高さは固定で、伸びるのは横だけ。** そのため SVG の中の x は `%`
 *   （または校名の箱の幅の px）で書く。**回戦の札は SVG の外（左の固定幅）。**
 *
 * ★★ **10校の形だけを描く**（`buildJinguBracket` が形に合わなければ null）。
 *   左から 2回戦×4試合（8席）のうち、第3試合の右の席と第4試合の左の席が「1回戦の勝者」。
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

/** 高校の数（列の数） */
const SLOTS = 10;
/** 1列の幅の下限（px）。これより狭くなる画面では表の中だけ横にスクロールする */
const MIN_SLOT = 92;
/** 回戦の札の欄の幅（px） */
const GUTTER = 58;
const BOX_W = 86;
const BOX_H = 28;
/** 高さ（上から）。優勝 → 決勝 → 準決勝 → 2回戦 → 1回戦 → 校名の箱 */
const Y = { stemTop: 56, f: 102, sf: 154, r2: 206, r1: 258, names: 298 } as const;
const HEIGHT = Y.names + BOX_H + 6;

/** 列の位置（0〜9。小数は2つの列の間）→ 幅に対する割合 */
const xs = (s: number) => `${((s + 0.5) / SLOTS) * 100}%`;

type Slot = BracketGame["teams"][number];

/** 結び目（2つの入力が1つに合わさる点）。「∩」の形 */
type Join = {
  /** 列の位置（2つの入力の真ん中） */
  s: number;
  /** 横線の高さ */
  y: number;
  game: BracketGame;
  /** 左・右の入力の列の位置と、その線の下端（校名の箱の上 or 前の結び目の高さ） */
  legs: [{ s: number; fromY: number; team: boolean }, { s: number; fromY: number; team: boolean }];
  left: Slot;
  right: Slot;
  /** 出ていく線の上端（次の結び目の高さ） */
  toY: number;
};

type Leg = { s: number } & ({ team: true } | { team: false; from: Join });

const join = (y: number, toY: number, game: BracketGame, a: Leg, b: Leg): Join => {
  const leg = (l: Leg): Join["legs"][number] =>
    l.team ? { s: l.s, fromY: Y.names, team: true } : { s: l.from.s, fromY: l.from.y, team: false };
  const la = leg(a);
  const lb = leg(b);
  return { s: (la.s + lb.s) / 2, y, game, legs: [la, lb], left: game.teams[0], right: game.teams[1], toY };
};

const team = (s: number): Leg => ({ s, team: true });
const from = (j: Join): Leg => ({ s: j.s, team: false, from: j });

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

  // 校名の列（左から10校）。2回戦の第3試合の右の席・第4試合の左の席は「1回戦の勝者」なので列を持たない
  const names: (string | null)[] = [
    r2[0].teams[0].name,
    r2[0].teams[1].name,
    r2[1].teams[0].name,
    r2[1].teams[1].name,
    r2[2].teams[0].name,
    r1[0].teams[0].name,
    r1[0].teams[1].name,
    r1[1].teams[0].name,
    r1[1].teams[1].name,
    r2[3].teams[1].name,
  ];
  // 校名は「その学校が1勝でもしていれば」太字（勝ち上がった学校）。赤にはしない
  const advanced = new Set<string>();
  for (const g of [...r1, ...r2, ...sf, f]) for (const t of g.teams) if (t.won && t.name) advanced.add(t.name);

  // 結び目。入力は校名の列 or 前の結び目の出口
  const jR1a = join(Y.r1, Y.r2, r1[0], team(5), team(6));
  const jR1b = join(Y.r1, Y.r2, r1[1], team(7), team(8));
  const jG1 = join(Y.r2, Y.sf, r2[0], team(0), team(1));
  const jG2 = join(Y.r2, Y.sf, r2[1], team(2), team(3));
  const jG3 = join(Y.r2, Y.sf, r2[2], team(4), from(jR1a));
  const jG4 = join(Y.r2, Y.sf, r2[3], from(jR1b), team(9));
  const jS1 = join(Y.sf, Y.f, sf[0], from(jG1), from(jG2));
  const jS2 = join(Y.sf, Y.f, sf[1], from(jG3), from(jG4));
  const jF = join(Y.f, Y.stemTop, f, from(jS1), from(jS2));
  const joins = [jR1a, jR1b, jG1, jG2, jG3, jG4, jS1, jS2, jF];

  /** 描く線。黒を先に、赤を後に描いて、赤を上に重ねる */
  type Seg = { x1: string; x2: string; y1: number; y2: number; red: boolean };
  const segs: Seg[] = [];
  for (const j of joins) {
    const sx = xs(j.s);
    // 出ていく線（勝者が決まっていれば赤）
    segs.push({ x1: sx, x2: sx, y1: j.y, y2: j.toY, red: j.game.decided });
    // 横線。左の半分は左の入力、右の半分は右の入力。勝った側の半分だけ赤
    segs.push({ x1: xs(j.legs[0].s), x2: sx, y1: j.y, y2: j.y, red: j.left.won });
    segs.push({ x1: sx, x2: xs(j.legs[1].s), y1: j.y, y2: j.y, red: j.right.won });
    // 校名の箱から結び目までの線（シードは長く伸びる）。その学校がこの試合に勝っていれば赤
    ([j.legs[0], j.legs[1]] as const).forEach((l, k) => {
      if (l.team) segs.push({ x1: xs(l.s), x2: xs(l.s), y1: l.fromY, y2: j.y, red: (k === 0 ? j.left : j.right).won });
    });
  }

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

      <p className="mt-2 text-[0.6875rem] text-ink-faint sm:hidden">← 横にスクロールして全校を見られます →</p>
      <div className="mt-1 overflow-x-auto sm:mt-3">
        <div className="flex" style={{ minWidth: GUTTER + MIN_SLOT * SLOTS }}>
          {/* 回戦の札（暗い地に白字）。その回戦の結び目と同じ高さ */}
          <div className="relative shrink-0" style={{ width: GUTTER, height: HEIGHT }} aria-hidden="true">
            {(
              [
                ["決勝", Y.f],
                ["準決勝", Y.sf],
                ["2回戦", Y.r2],
                ["1回戦", Y.r1],
              ] as const
            ).map(([label, y]) => (
              <span
                key={label}
                className="absolute left-0 flex h-[22px] w-[52px] items-center justify-center rounded-full text-[0.71875rem] font-bold leading-none text-white"
                style={{ top: y - 11, background: "#1b2a4a" }}
              >
                {label}
              </span>
            ))}
          </div>

          <svg
            role="img"
            aria-label={`${year}年 明治神宮大会 高校の部のトーナメント表。${
              champion ? `優勝は${champion}。` : "優勝校は未定。"
            }`}
            height={HEIGHT}
            className="block min-w-0 flex-1"
            style={{ minWidth: MIN_SLOT * SLOTS }}
          >
            {/* ---- 線（黒を先に、赤を後に）---- */}
            {[false, true].map((redPass) => (
              <g key={String(redPass)} strokeLinecap="round" strokeLinejoin="round" fill="none">
                {segs
                  .filter((s) => s.red === redPass)
                  .map((s, i) => (
                    <line
                      key={i}
                      x1={s.x1}
                      x2={s.x2}
                      y1={s.y1}
                      y2={s.y2}
                      stroke={stroke(s.red)}
                      strokeWidth={sw(s.red)}
                    />
                  ))}
              </g>
            ))}

            {/* ---- 優勝（決勝の出口の線の先）。決まるまでは「優勝」の字だけ ---- */}
            <text
              x={xs(jF.s)}
              y={champion ? 22 : 40}
              fontSize={11}
              fontWeight={700}
              textAnchor="middle"
              fill={MUTED}
            >
              優勝
            </text>
            {champion && (
              <text x={xs(jF.s)} y={45} fontSize={14} fontWeight={700} textAnchor="middle" fill={INK}>
                {champion}
              </text>
            )}

            {/* ---- 校名の箱（位置は割合なので入れ子の svg で置く。はみ出しは見せる）---- */}
            {names.map((name, i) => {
              const bold = name !== null && advanced.has(name);
              const long = name !== null && name.length >= 7;
              return (
                <svg key={`n${i}`} x={xs(i)} y={0} width={1} height={1} overflow="visible">
                  <rect
                    x={-BOX_W / 2}
                    y={Y.names}
                    width={BOX_W}
                    height={BOX_H}
                    rx={4}
                    fill={BOX_FILL}
                    stroke={BOX_LINE}
                  />
                  <text
                    x={0}
                    y={Y.names + 18.5}
                    fontSize={12.5}
                    fontWeight={bold ? 700 : 500}
                    textAnchor="middle"
                    fill={name ? INK : MUTED}
                    fontStyle={name ? "normal" : "italic"}
                    textLength={long ? BOX_W - 10 : undefined}
                    lengthAdjust={long ? "spacingAndGlyphs" : undefined}
                  >
                    {name ?? "未定"}
                  </text>
                </svg>
              );
            })}

            {/* ---- 得点（結び目の出口の線の左右）。まだ得点が無い試合は結び目の下に日時 ---- */}
            {joins.map((j, i) => {
              const hasScore = j.left.score !== null && j.right.score !== null;
              return (
                <g key={`t${i}`}>
                  {hasScore ? (
                    <>
                      <text
                        x={xs(j.s)}
                        dx={-7}
                        y={j.y - 6}
                        fontSize={13}
                        fontWeight={j.left.won ? 700 : 400}
                        fill={j.left.won ? INK : MUTED}
                        textAnchor="end"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {j.left.score}
                      </text>
                      <text
                        x={xs(j.s)}
                        dx={7}
                        y={j.y - 6}
                        fontSize={13}
                        fontWeight={j.right.won ? 700 : 400}
                        fill={j.right.won ? INK : MUTED}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {j.right.score}
                      </text>
                    </>
                  ) : (
                    j.game.label && (
                      <text x={xs(j.s)} y={j.y + 15} fontSize={9.5} fill={MUTED} textAnchor="middle">
                        {j.game.label}
                      </text>
                    )
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <ul className="sr-only">
        {summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}

function describe(g: BracketGame): string {
  const [a, b] = g.teams;
  const name = (n: string | null) => n ?? "未定";
  if (a.score === null || b.score === null) return `${name(a.name)} 対 ${name(b.name)}（${g.label ?? "日程未定"}）`;
  return `${name(a.name)} ${a.score} 対 ${b.score} ${name(b.name)}${g.winner ? `、勝ちは${g.winner}` : "（試合中の場合があります）"}`;
}
