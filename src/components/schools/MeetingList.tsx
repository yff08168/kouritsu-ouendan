import { cn } from "@/lib/utils";
import type { Meeting } from "@/lib/head-to-head";

/**
 * 2校の全対戦。**新しい順**。
 *
 * ★**左が見ている側（URLの先の学校）**で固定する。
 * 試合ごとに左右が入れ替わると勝敗が読み取れない。
 *
 * ★**引き分けを「負け」と書かない**（高校野球には引き分け再試合がある）。
 */
const STAGE_LABEL: Record<Meeting["stage"], string> = {
  koshien: "甲子園",
  jingu: "神宮",
  regional: "地方大会",
};

export function MeetingList({
  meetings,
  leftName,
  rightName,
}: {
  meetings: Meeting[];
  leftName: string;
  rightName: string;
}) {
  return (
    <ul className="divide-y divide-line border-t border-line">
      {meetings.map((m, i) => (
        <li key={i} className="py-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "w-14 shrink-0 rounded px-1 py-0.5 text-center text-[0.6875rem] font-bold",
                m.stage === "regional"
                  ? "bg-navy-50 text-navy-700"
                  : "bg-accent-500 text-navy-900",
              )}
            >
              {STAGE_LABEL[m.stage]}
            </span>

            <p className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-baseline gap-x-2 text-sm sm:gap-x-3">
              <span
                className={cn(
                  "truncate text-right",
                  m.won ? "font-bold text-navy-800" : "text-ink-muted",
                )}
              >
                {leftName}
              </span>
              <span
                className={cn(
                  "text-center text-base font-bold tabular-nums",
                  m.drawn ? "text-ink-muted" : "text-navy-800",
                )}
              >
                {m.score}
                {" - "}
                {m.opponentScore}
              </span>
              <span
                className={cn(
                  "truncate",
                  !m.won && !m.drawn ? "font-bold text-navy-800" : "text-ink-muted",
                )}
              >
                {rightName}
              </span>
            </p>
          </div>

          <p className="mt-1 flex flex-wrap gap-x-2 pl-[4.25rem] text-[0.6875rem] text-ink-faint">
            {m.date && <span>{formatDate(m.date)}</span>}
            {m.round && <span>{m.round}</span>}
            {m.tournament && <span className="min-w-0 truncate">{m.tournament}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 「2025-08-23」→「2025年8月23日」 */
function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}
