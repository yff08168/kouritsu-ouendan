import Link from "next/link";
import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RegionalBracket as Bracket } from "@/lib/regional-bracket";
import type { RegionalTeam } from "@/lib/regional-results";

/**
 * 地方大会のトーナメント表。
 *
 * ------------------------------------------------------------------
 * ★**回戦ごとの縦の列**にしている（木を線で描いていない）。
 *
 *   線で結ぶ表は**横に非常に広く**なり、スマホでは読めない。
 *   このサイトはスマホ優先なので、**回戦ごとに列を並べ、
 *   各試合に「どこから上がってきたか」を持たせる**形にした。
 *   ★**枝そのものは `buildRegionalBracket` が検算済み**なので、
 *   線を描かなくても「勝ち上がり」は正しく表せている。
 *
 * ★**横スクロールはこの中だけに閉じ込める**（ページの本文は横に流れない）。
 *
 * ------------------------------------------------------------------
 * ★★**私立の試合もそのまま出す。**
 *
 *   トーナメント表は**全試合が揃って初めて表になる。**
 *   公立だけを抜くと枝が切れ、**次の公立の試合に誰が上がってきたのかが
 *   読めなくなる。** 表の中では私立も並ぶが、
 *   **公立はオレンジで示して「着目するところ」を分けている。**
 */
export function RegionalBracket({
  bracket,
  className,
}: {
  bracket: Bracket;
  className?: string;
}) {
  return (
    <div className={cn("mt-3", className)}>
      {/* 横に広い表はこの中だけでスクロールさせる */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {bracket.rounds.map((round) => (
            <section
              key={round.round}
              aria-label={`${round.round}（${round.games.length}試合）`}
              className="w-56 shrink-0"
            >
              <h4 className="sticky top-0 z-10 rounded bg-navy-50 px-2 py-1 text-center text-xs font-bold text-navy-800">
                {round.round}
                <span className="ml-1 font-medium text-ink-muted">
                  {round.games.length}
                </span>
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {round.games.map((g) => (
                  <li
                    key={g.index}
                    className="rounded border border-line bg-white p-1.5"
                  >
                    {g.seats.map((seat, i) => (
                      <TeamRow
                        key={i}
                        team={seat.team}
                        /* ★シード（前の回戦に出ていない）は印を出す */
                        seeded={seat.from === null && round.round !== "1回戦"}
                      />
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        ※ 勝った学校を
        <strong className="font-medium text-ink-muted">濃い字</strong>
        で示しています。
        <strong className="font-medium text-accent-800">オレンジ</strong>
        は公立高校です。
        <br />※ この表は{bracket.total}試合から組み直したものです。
        <strong className="font-medium">私立を含む全試合</strong>
        で組んでいます（枝が切れると勝ち上がりが追えないため）。
        「シ」はその回戦から登場した学校です。
      </p>
    </div>
  );
}

function TeamRow({ team, seeded }: { team: RegionalTeam; seeded: boolean }) {
  const name = (
    <span
      className={cn(
        "truncate",
        team.won ? "font-bold" : "text-ink-muted",
        // ★公立はオレンジ。**面ではなく字の色**（アクセントは小面積のみ）
        team.slug ? "text-accent-800" : team.won ? "text-navy-800" : undefined,
      )}
    >
      {team.display}
    </span>
  );

  return (
    <div className="flex items-baseline gap-1.5 text-xs leading-snug">
      {seeded && (
        <span
          aria-label="この回戦から登場"
          className="flex-none rounded-sm bg-navy-100 px-1 text-[0.5625rem] font-bold text-navy-700"
        >
          シ
        </span>
      )}
      {/* 公立は学校ページへ。私立は当サイトに個別ページが無い */}
      {team.slug ? (
        <Link
          href={`/schools/${team.slug}`}
          className="min-w-0 flex-1 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="min-w-0 flex-1">{name}</span>
      )}
      <span
        className={cn(
          "flex-none font-variant-numeric tabular-nums",
          team.won ? "font-bold text-navy-800" : "text-ink-muted",
        )}
      >
        {team.score}
      </span>
      {team.won && (
        <Trophy
          size={10}
          aria-hidden="true"
          className="flex-none text-accent-500"
        />
      )}
    </div>
  );
}
