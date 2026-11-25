import { entryText, type ProPlayer } from "@/lib/pro-alumni";
import { PlayerCareer } from "@/components/pro/PlayerCareer";

/**
 * 学校ページの「卒業生のプロ野球選手」。
 *
 * ★**事実だけ**: 氏名・進路（高校 → 大学/社会人 → 球団）・在籍した球団と年・入団年とドラフト順位。
 *   **成績・写真・生年月日は載せない。選手ごとの個別ページへのリンクも作らない。**
 * ★**並びは新しい入団の順**（`scripts/build-pro-alumni.mjs` がそろえている）。
 * ★**勝敗・成績の数字を出さない**ので、敗戦数を画面に出さない決めごとにも触れない。
 */
export function SchoolProAlumni({ players, school }: { players: ProPlayer[]; school: string }) {
  return (
    <ul className="mt-3 divide-y divide-line">
      {players.map((p) => (
        <li key={`${p.name}-${p.draft?.year ?? p.entryYear ?? ""}`} className="py-2.5">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-bold text-navy-800">{p.name}</span>
            <span className="text-xs text-ink-muted">{entryText(p)}</span>
            {p.formerName && (
              <span className="text-xs text-ink-faint">（当時の校名：{p.formerName}）</span>
            )}
          </p>
          <p className="mt-0.5">
            <PlayerCareer player={p} school={school} />
          </p>
        </li>
      ))}
    </ul>
  );
}
