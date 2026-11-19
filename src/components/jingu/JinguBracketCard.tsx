import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";

import type { BracketGame, JinguBracket } from "@/lib/jingu-bracket";

/**
 * トップに置く、明治神宮大会（高校の部）のトーナメント表。
 *
 * ------------------------------------------------------------------
 * ★★ **勝ったチームと得点は赤。勝ち上がる線も赤**（2026-11-20。運営者の指示）。
 *   負けた側・まだ終わっていない試合はグレー。**途中の得点は出すが、赤にしない**
 *   （勝者は開始から3時間たった試合だけ。`isFinished`）。
 * ★**オレンジ（accent）は使わない** —— 公立の印と取り違えるので、運営者が指定した赤を別に持つ。
 *   面で塗らず、字と線だけ（AGENTS の「オレンジは小面積」と同じ線）。
 *
 * ★★ **サーバーコンポーネント・JavaScript なし**。表は SVG の1枚で、**幅が足りないスマホでは横にスクロールする**
 *   （縮めると字が読めなくなる。校名がこのサイトの主役）。
 * ★**読み上げ用に文章の一覧も出す**（`sr-only`）。SVG は `role="img"` で中身を読まないため。
 *
 * ★★ **主催者の表を取りに行く**（`getJinguLive`。`fetch` の期限は5分）ので、**これを置いたページは5分で作り直される。**
 *   トップは `jinguBracketWindow()` の期間（11/10〜11/30）だけ置く。**窓の外は何も取りに行かない。**
 */

const RED = "#d92d20";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#cbd5e1";
const BOX_LINE = "#d6dbe3";

const BOX_W = 148;
const ROW_H = 24;
const BOX_H = ROW_H * 2;
const COL_GAP = 34;
const COL = [0, BOX_W + COL_GAP, 2 * (BOX_W + COL_GAP), 3 * (BOX_W + COL_GAP)] as const;
const WIDTH = COL[3] + BOX_W;

/** 各箱の上端の y（左から1回戦・2回戦・準決勝・決勝）。行の高さから決めている */
const R2_Y = [0, 64, 128, 208] as const;
const R1_Y = [R2_Y[2] + ROW_H * 1.5 - ROW_H, R2_Y[3] + ROW_H * 0.5 - ROW_H] as const; // 1回戦の箱の中心を、上がる先の席の高さに合わせる
const center = (y: number) => y + ROW_H; // 箱の縦の中心
const SF_Y = [
  (center(R2_Y[0]) + center(R2_Y[1])) / 2 - ROW_H,
  (center(R2_Y[2]) + center(R2_Y[3])) / 2 - ROW_H,
] as const;
const F_Y = (center(SF_Y[0]) + center(SF_Y[1])) / 2 - ROW_H;
const HEIGHT = R2_Y[3] + BOX_H;

const slotY = (boxY: number, slot: 0 | 1) => boxY + ROW_H * (slot + 0.5);

function Box({ game, x, y, showLabel }: { game: BracketGame; x: number; y: number; showLabel: boolean }) {
  return (
    <g>
      {showLabel && game.label && (
        <text x={x} y={y - 4} fontSize={9.5} fill={MUTED}>
          {game.label}
        </text>
      )}
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={4} fill="#fff" stroke={BOX_LINE} />
      <line x1={x} x2={x + BOX_W} y1={y + ROW_H} y2={y + ROW_H} stroke={BOX_LINE} />
      {game.teams.map((t, i) => {
        const ty = y + ROW_H * i + ROW_H / 2 + 4.5;
        const color = t.won ? RED : MUTED;
        return (
          <g key={i}>
            <text
              x={x + 8}
              y={ty}
              fontSize={12.5}
              fontWeight={t.won ? 700 : 400}
              fill={t.name ? (t.won ? RED : INK) : MUTED}
              fontStyle={t.name ? "normal" : "italic"}
            >
              {t.name ?? "未定"}
            </text>
            {t.score !== null && (
              <text
                x={x + BOX_W - 8}
                y={ty}
                fontSize={13}
                fontWeight={t.won ? 700 : 400}
                textAnchor="end"
                fill={color}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t.score}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** 勝った側から次の席への線。決まっていれば赤、まだならグレー */
function Link2({
  from,
  to,
  red,
}: {
  from: [number, number];
  to: [number, number];
  red: boolean;
}) {
  const midX = (from[0] + to[0]) / 2;
  return (
    <polyline
      points={`${from[0]},${from[1]} ${midX},${from[1]} ${midX},${to[1]} ${to[0]},${to[1]}`}
      fill="none"
      stroke={red ? RED : LINE}
      strokeWidth={red ? 2 : 1.5}
      strokeLinejoin="round"
    />
  );
}

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

  // 1回戦 → 2回戦（第3試合の下の席／第4試合の上の席）
  const r1Links: { from: [number, number]; to: [number, number]; red: boolean }[] = [
    { from: [COL[0] + BOX_W, center(R1_Y[0])], to: [COL[1], slotY(R2_Y[2], 1)], red: r1[0].decided },
    { from: [COL[0] + BOX_W, center(R1_Y[1])], to: [COL[1], slotY(R2_Y[3], 0)], red: r1[1].decided },
  ];
  // 2回戦 → 準決勝
  const r2ToSf = [
    { game: r2[0], y: R2_Y[0], to: [COL[2], slotY(SF_Y[0], 0)] as [number, number] },
    { game: r2[1], y: R2_Y[1], to: [COL[2], slotY(SF_Y[0], 1)] as [number, number] },
    { game: r2[2], y: R2_Y[2], to: [COL[2], slotY(SF_Y[1], 0)] as [number, number] },
    { game: r2[3], y: R2_Y[3], to: [COL[2], slotY(SF_Y[1], 1)] as [number, number] },
  ];
  // 準決勝 → 決勝
  const sfToF = [
    { game: sf[0], y: SF_Y[0], to: [COL[3], slotY(F_Y, 0)] as [number, number] },
    { game: sf[1], y: SF_Y[1], to: [COL[3], slotY(F_Y, 1)] as [number, number] },
  ];

  const summary = [
    ...r1.map((g) => `1回戦 ${describe(g)}`),
    ...r2.map((g) => `2回戦 ${describe(g)}`),
    ...sf.map((g) => `準決勝 ${describe(g)}`),
    `決勝 ${describe(f)}`,
  ];

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
              赤
            </span>
            は勝ったチームと得点
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
          viewBox={`0 -30 ${WIDTH} ${HEIGHT + 62}`}
          width={WIDTH}
          height={HEIGHT + 62}
          className="block h-auto min-w-[694px] max-w-none"
        >
          {/* 回戦の見出し */}
          {(["1回戦", "2回戦", "準決勝", "決勝"] as const).map((label, i) => (
            <text
              key={label}
              x={COL[i] + BOX_W / 2}
              y={-14}
              fontSize={11}
              fontWeight={700}
              textAnchor="middle"
              fill={MUTED}
            >
              {label}
            </text>
          ))}

          {/* 線は箱より先に描く（箱の下に潜らせる）。グレー → 赤の順で、赤が上に重なる */}
          {[false, true].map((redPass) => (
            <g key={String(redPass)}>
              {r1Links
                .filter((l) => l.red === redPass)
                .map((l, i) => (
                  <Link2 key={`a${i}`} from={l.from} to={l.to} red={l.red} />
                ))}
              {r2ToSf
                .filter((l) => l.game.decided === redPass)
                .map((l, i) => (
                  <Link2
                    key={`b${i}`}
                    from={[COL[1] + BOX_W, center(l.y)]}
                    to={l.to}
                    red={l.game.decided}
                  />
                ))}
              {sfToF
                .filter((l) => l.game.decided === redPass)
                .map((l, i) => (
                  <Link2
                    key={`c${i}`}
                    from={[COL[2] + BOX_W, center(l.y)]}
                    to={l.to}
                    red={l.game.decided}
                  />
                ))}
            </g>
          ))}

          {r1.map((g, i) => (
            <Box key={`r1-${i}`} game={g} x={COL[0]} y={R1_Y[i]} showLabel={false} />
          ))}
          {r2.map((g, i) => (
            <Box key={`r2-${i}`} game={g} x={COL[1]} y={R2_Y[i]} showLabel />
          ))}
          {sf.map((g, i) => (
            <Box key={`sf-${i}`} game={g} x={COL[2]} y={SF_Y[i]} showLabel />
          ))}
          <Box game={f} x={COL[3]} y={F_Y} showLabel />

          {/* 優勝校 */}
          <text
            x={COL[3] + BOX_W / 2}
            y={F_Y + BOX_H + 26}
            fontSize={13}
            fontWeight={700}
            textAnchor="middle"
            fill={champion ? RED : MUTED}
          >
            {champion ? `優勝 ${champion}` : "優勝 未定"}
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
        勝ちの印（赤）は開始から3時間たった試合にだけ付けています。
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
