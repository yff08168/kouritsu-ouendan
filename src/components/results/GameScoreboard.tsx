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
 * ★★★**打たなかった回には `×` を入れる**（2026-09-06。運営者の指示）。
 *
 * **後攻が勝った試合では、その回の裏の攻撃が行われない**
 * （サヨナラも、後攻がリードしたままのコールドも同じ）。
 * 球場の掲示板はそこに `×` を出すので、それに合わせる。
 *
 * ★★**`×` を入れるのは「回数が短いほうが勝っている」ときだけ。**
 * **負けた側が短いのは、こちらが読み切れていないということ**なので、
 * **そこは空欄のままにする**（推測で `×` を置かない）。
 * ★**0 を書かないこと** —— 「打っていない」と「0点だった」は違う。
 *
 * ★**延長は回が増えるだけ**（配列の長さがそのまま回数）。
 * ★**横に長くなるので、狭い画面では横スクロールさせる**（ページごと横に伸ばさない）。
 */
export function GameScoreboard({ teams }: { teams: RegionalTeam[] }) {
  const innings = Math.max(...teams.map((t) => t.innings?.length ?? 0));
  if (innings === 0) return null;

  /*
    ★**「打たなかった」と言い切れるのは、短いほうが勝っているときだけ。**
    引き分けや、負けた側が短い形（＝読み切れていない）では出さない。
  */
  const didNotBat = (team: RegionalTeam) =>
    team.won && (team.innings?.length ?? 0) < innings;

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
              {Array.from({ length: innings }, (_, i) => {
                const run = team.innings?.[i];
                return (
                  <td key={i} className="py-2 text-center text-ink">
                    {/*
                      ★**`?? 0` にしないこと**（打っていない回は「0点」ではない）。
                      ★**勝っている側が短いなら、その回は行われていない**ので `×`。
                      **それ以外の欠けは空欄のまま**（上の説明を読むこと）。
                    */}
                    {run ?? (didNotBat(team) ? <span className="text-ink-faint">×</span> : "")}
                  </td>
                );
              })}
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
