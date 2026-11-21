import type { ColumnGame } from "@/lib/content/columns";
import { formatDateLong } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 試合の概要カード（回ごとの得点・試合時間・観衆・投手の人数・主な得点場面）。
 *
 * ★**公式記録（主催者の試合詳細ページ）を元に書いた値**で、`scripts/verify-column.mjs` が
 *   1つずつ突き合わせる（食い違えば止まる）。**選手名は載せない**（名前は本文で良いプレーとして触れる）。
 * ★**勝った側を太字にする**（ほかの表と同じ）。**敗戦数は書かない。**
 * ★**表は表の中だけ横スクロール**（9回までで11列。延長があると増える）。
 */
export function GameSummaryCard({ game }: { game: ColumnGame }) {
  const s = game.summary;
  if (!s) return null;

  const [a, b] = game.teams;
  const winner = a.score > b.score ? a.name : b.score > a.score ? b.name : null;
  const cols = Math.max(...s.lineScore.map((r) => r.innings.length));
  const show = (token: string) => token.replace(/x$/i, "×").replace(/^X$/i, "×");

  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const dur = minutes(s.endedAt) - minutes(s.startedAt);

  return (
    <div className="mt-3 rounded-lg border border-line bg-navy-50/40 p-3 sm:p-4">
      <p className="text-xs text-ink-muted">
        {formatDateLong(game.date)}　第{game.order}試合　{game.round}
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-sm tabular-nums">
          <caption className="sr-only">回ごとの得点</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th scope="col" className="py-1 pr-3 text-left font-medium">チーム</th>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} scope="col" className="w-7 px-1 py-1 text-center font-medium">
                  {i + 1}
                </th>
              ))}
              <th scope="col" className="w-9 pl-2 py-1 text-center font-medium">計</th>
            </tr>
          </thead>
          <tbody>
            {s.lineScore.map((r) => {
              const won = r.team === winner;
              return (
                <tr key={r.team} className="border-b border-line last:border-0">
                  <th
                    scope="row"
                    className={cn("whitespace-nowrap py-1.5 pr-3 text-left", won ? "font-bold text-navy-800" : "font-medium text-ink")}
                  >
                    {r.team}
                  </th>
                  {r.innings.map((t, i) => (
                    <td key={i} className="px-1 py-1.5 text-center text-ink">
                      {show(t)}
                    </td>
                  ))}
                  <td className={cn("pl-2 py-1.5 text-center", won ? "font-bold text-navy-800" : "text-ink")}>
                    {r.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">試合時間</dt>
        <dd className="text-ink">
          {Math.floor(dur / 60)}時間{dur % 60}分（{s.startedAt}〜{s.endedAt}）
        </dd>
        <dt className="text-ink-muted">観衆</dt>
        <dd className="text-ink">{s.attendance.toLocaleString()}人</dd>
        <dt className="text-ink-muted">投手の人数</dt>
        <dd className="text-ink">
          {s.pitchers.map((p, i) => (
            <span key={p.team}>
              {i > 0 && "　"}
              {p.team}{p.count}人
            </span>
          ))}
        </dd>
      </dl>

      {s.plays.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-navy-800">主な得点場面</p>
          <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-ink">
            {s.plays.map((p) => (
              <li key={`${p.inning}-${p.half}`}>
                <span className="whitespace-nowrap text-ink-muted">
                  {p.inning}回{p.half}
                </span>
                　{p.team} {p.runs}点　{p.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">
        出典：日本学生野球協会（主催者）の公式記録。主な得点場面は公式記録の「得点経過」を、選手名を省いて要約しています。
      </p>
    </div>
  );
}
