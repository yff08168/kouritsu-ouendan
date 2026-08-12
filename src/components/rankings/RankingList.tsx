import Link from "next/link";
import { cn } from "@/lib/utils";
import { establishmentLabel } from "@/lib/constants";
import type { SchoolKoshienStats } from "@/types/app";

export type RankingRow = {
  rank: number;
  stats: SchoolKoshienStats;
};

type Props = {
  rows: RankingRow[];
  /** 棒の長さを決める値。省略時は表示値と同じ */
  valueOf: (stats: SchoolKoshienStats) => number;
  /** 右端に出す文字列 */
  formatValue: (stats: SchoolKoshienStats) => string;
  /** 校名の下に出す補足 */
  formatNote?: (stats: SchoolKoshienStats) => string | null;
  /** 棒の基準になる最大値。省略時は先頭行の値 */
  max?: number;
  className?: string;
};

/**
 * 順位つきの横棒ランキング。
 *
 * 数字だけの表より、棒があるほうが「1位が突出しているのか、団子なのか」が
 * 一目で分かる。棒はネイビーのみで塗る（オレンジは面で使わない方針。
 * アクセントは1位のバッジだけに使う）。
 *
 * 棒は装飾なので aria-hidden。読み上げには順位・校名・値がそのまま流れる。
 */
export function RankingList({
  rows,
  valueOf,
  formatValue,
  formatNote,
  max,
  className,
}: Props) {
  const top = max ?? (rows.length > 0 ? valueOf(rows[0].stats) : 0);

  return (
    <ol className={cn("divide-y divide-line", className)}>
      {rows.map(({ rank, stats }) => {
        const value = valueOf(stats);
        // 0除算を避ける。最大値が0なら棒は出さない。
        const width = top > 0 ? Math.max((value / top) * 100, 1.5) : 0;
        const note = formatNote?.(stats) ?? null;

        return (
          <li key={stats.slug}>
            <Link
              href={`/schools/${stats.slug}`}
              className="group flex items-center gap-3 py-2.5 hover:bg-navy-50/60"
            >
              <span
                className={cn(
                  "grid w-8 shrink-0 place-items-center text-sm font-bold tabular-nums",
                  rank === 1 ? "text-accent-800" : "text-ink-muted",
                )}
              >
                {rank}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-sm font-bold text-ink group-hover:underline">
                    {stats.name}
                  </span>
                  <span className="text-[0.6875rem] text-ink-muted">
                    {stats.prefecture.name}・
                    {establishmentLabel(stats.establishment, stats.prefecture.name)}
                  </span>
                </div>

                <div
                  aria-hidden="true"
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-navy-50"
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      rank === 1 ? "bg-navy-800" : rank <= 3 ? "bg-navy-700" : "bg-navy-600",
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>

                {note && (
                  <p className="mt-1 text-[0.6875rem] leading-snug text-ink-faint">
                    {note}
                  </p>
                )}
              </div>

              <span className="shrink-0 text-right text-sm font-bold tabular-nums text-navy-800">
                {formatValue(stats)}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
