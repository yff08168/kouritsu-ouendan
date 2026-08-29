import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import {
  formatRegionalDateWithYear,
  seasonLabel,
  type RegionalUpcoming,
} from "@/lib/regional-results";
import { tournamentDisplayName } from "@/lib/regional-tournaments";

/**
 * これからの試合（組み合わせ）。
 *
 * ------------------------------------------------------------------
 * ★**結果のカードとは別に出す。**
 *
 *   スコアの無い行を結果の一覧に混ぜると、**「0-0で終わった試合」に見える。**
 *   データの側でも `games` と `upcoming` を分けてある（`RegionalDistrict`）。
 *
 * ★**勝者が決まっていない枠は作らない。** 準決勝・決勝は
 * 「誰が上がるか」がまだ決まっていないので、**枠だけ置いて相手を空にしない**
 * （甲子園の準々決勝以降と同じ考え方で、推測で埋めない）。
 */
export function RegionalUpcomingCard({
  games,
  districtName,
}: {
  games: RegionalUpcoming[];
  districtName: string;
}) {
  if (!games.length) return null;
  const season = games[0].season;
  const tournaments = [...new Set(games.map((g) => g.tournament).filter(Boolean))];

  return (
    <section
      aria-labelledby="pref-upcoming"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <SectionHeading
        id="pref-upcoming"
        title={`${districtName}のこれからの試合`}
        icon={<CalendarClock size={18} />}
      />
      <p className="mt-1 text-sm text-ink-muted">
        {seasonLabel(season)}の組み合わせです。
        {tournaments.length === 1 && <>（{tournamentDisplayName(tournaments[0])}）</>}
      </p>

      <ul className="mt-3 divide-y divide-line">
        {games.map((g, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <span className="w-28 shrink-0 text-xs text-ink-muted">
              {g.date ? formatRegionalDateWithYear(g.date) : "日程未定"}
            </span>
            <span className="shrink-0 rounded bg-navy-50 px-1.5 py-0.5 text-xs font-bold text-navy-700">
              {g.round ?? "回戦未定"}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm">
              {g.teams.map((t, j) => (
                <span key={j} className="contents">
                  {j > 0 && <span className="text-xs text-ink-faint">対</span>}
                  {/* 公立は学校ページへ。私立に個別ページは無い */}
                  {t.slug ? (
                    <Link
                      href={`/schools/${t.slug}`}
                      className="font-bold text-accent-800 hover:underline"
                    >
                      {t.display}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">{t.display}</span>
                  )}
                </span>
              ))}
            </span>
            {g.venue && (
              <span className="shrink-0 text-xs text-ink-faint">{g.venue}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        ※ まだ行われていない試合です。
        <strong className="font-medium text-accent-800">オレンジ</strong>
        は公立高校です。
        <br />※ 勝ち上がりで相手が決まる試合（準決勝・決勝など）は、
        <strong className="font-medium">対戦相手が決まってから</strong>出します。
      </p>
    </section>
  );
}
