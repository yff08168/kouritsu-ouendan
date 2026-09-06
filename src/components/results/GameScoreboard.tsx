import { cn } from "@/lib/utils";
import type { RegionalTeam } from "@/lib/regional-results";

/**
 * 1試合のスコアボード（各回の得点）。
 *
 * ------------------------------------------------------------------
 * ★★**出典が各回の得点を出している県だけ**（2026-09-06。運営者の指示）。
 * 紙に合計しか刷っていない県では**そもそも取りようがない**ので、
 * ★**無い試合ではこの部品を出さない**（0を並べて埋めない）。
 *
 * ------------------------------------------------------------------
 * ★★**両チームで回数が違うことがある。** サヨナラで決まった試合は、
 * **後攻がその回を打ち切っていない**ので配列が1つ短い。
 * ★**足りないところは空欄**（球場の掲示板と同じ）。**0 を書かないこと** ——
 * 「打っていない」と「0点だった」は違う。
 *
 * ★**延長は回が増えるだけ**（配列の長さがそのまま回数）。
 * ★**横に長くなるので、狭い画面では横スクロールさせる**（ページごと横に伸ばさない）。
 */
export function GameScoreboard({ teams }: { teams: RegionalTeam[] }) {
  const innings = Math.max(...teams.map((t) => t.innings?.length ?? 0));
  if (innings === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm tabular-nums">
        <caption className="sr-only">各回の得点</caption>
        <thead>
          <tr className="border-b border-line text-ink-faint">
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">
              <span className="sr-only">チーム</span>
            </th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i} scope="col" className="w-8 py-1.5 text-center font-medium">
                {i + 1}
              </th>
            ))}
            {/* ★合計は少し離して、各回と見分けが付くようにする */}
            <th scope="col" className="w-10 py-1.5 pl-3 text-center font-bold text-ink-muted">
              計
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, r) => (
            <tr key={r} className="border-b border-line last:border-0">
              <th
                scope="row"
                className="py-2 pr-3 text-left text-[0.9375rem] font-bold text-navy-800"
              >
                {team.display}
              </th>
              {Array.from({ length: innings }, (_, i) => (
                <td key={i} className="py-2 text-center text-ink">
                  {/*
                    ★**打っていない回は空欄。** `?? 0` にしないこと
                    （サヨナラの裏は「0点」ではなく「打っていない」）。
                  */}
                  {team.innings?.[i] ?? ""}
                </td>
              ))}
              <td
                className={cn(
                  "py-2 pl-3 text-center text-base font-bold",
                  team.won ? "text-accent-800" : "text-ink-muted",
                )}
              >
                {team.score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
