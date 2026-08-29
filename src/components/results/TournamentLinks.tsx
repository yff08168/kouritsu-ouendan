import Link from "next/link";

import { seasonLabel } from "@/lib/regional-results";
import type { RegionalSeason } from "@/lib/regional-results";
import type { TournamentEntry } from "@/lib/regional-tournaments";

/**
 * 大会へのリンクの一覧。県のページと大会のページで同じものを使う。
 *
 * ------------------------------------------------------------------
 * ★★ 年でまとめる（2026-08-25）
 *
 *   大会が多い県は**年でまとめて、いちばん新しい年だけ開いて出す。**
 *   佐賀64・長野61・熊本46 という県があり、平らに並べると
 *   **どの年のものか分からないまま何十行も続く。**
 *
 *   ★**「年度」ではなく「年」。** データが持っているのは暦年で、
 *   高校野球の年度（4月〜翌3月）とは**秋がずれる。**
 *   「2025年度」と書くと秋の扱いを言い切ることになるので、
 *   **「2025年」の春・夏・秋**と出す。
 *
 *   ★★**1つの年×季節に大会が複数ある県がある**（徳島の秋は5大会、
 *   長野は地区予選まで1大会ずつ）。**春/夏/秋の3つに決め打ちしないこと。**
 *
 *   ★**大会が少ない県はまとめない。** 41県のうち**23県は3大会以下**で、
 *   そこに年の入れ子を足すと階層が増えるだけになる。
 *
 * ------------------------------------------------------------------
 * ★★ タブ（JavaScript）にしないこと
 *
 *   ★**`<details>` で畳む。** JavaScript を使わないので、
 *   **畳んだままでも `Ctrl+F` で当たり、クローラからも見える。**
 *   タブに変えると**過去の大会がクローラから見えなくなり、
 *   大会ページへの内部リンクが死ぬ。**
 *
 *   ★**「ほか63件」と数だけ書いて省かないこと** —— 過去の大会に辿り着けなくなる。
 */
export function TournamentLinks({
  prefectureSlug,
  entries,
  groupFrom = 6,
}: {
  prefectureSlug: string;
  entries: TournamentEntry[];
  /** この数を超えたら年でまとめる */
  groupFrom?: number;
}) {
  if (!entries.length) return null;

  // 少ない県は今までどおり平らに
  if (entries.length <= groupFrom) {
    return <List prefectureSlug={prefectureSlug} entries={entries} />;
  }

  const years = groupByYear(entries);

  return (
    <div className="space-y-2">
      {years.map((group, i) => (
        <details
          key={group.key}
          // ★いちばん新しい年だけ開いておく（`listTournaments` が新しい順に返す）
          open={i === 0}
          className="group rounded-lg border border-line"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-navy-800 hover:bg-navy-50">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {group.label}
              <span className="text-xs font-normal text-ink-muted">
                {group.seasons.join("・")}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-ink-muted">
              {group.entries.length}大会
              <span className="group-open:hidden" aria-hidden="true">
                ▼
              </span>
              <span className="hidden group-open:inline" aria-hidden="true">
                ▲
              </span>
            </span>
          </summary>
          <div className="border-t border-line p-3">
            <List prefectureSlug={prefectureSlug} entries={group.entries} />
          </div>
        </details>
      ))}
    </div>
  );
}

type YearGroup = {
  key: string;
  label: string;
  /** その年に入っている季節（重複を畳んだもの）。見出しの脇に出す */
  seasons: string[];
  entries: TournamentEntry[];
};

/**
 * 年でまとめる。**並び順は元のまま**（`listTournaments` が新しい順にしている）。
 * ★**年が分からない大会がある**（日付を1つも持たない出典が9県ある）ので、
 * その受け皿を必ず用意する。**捨てないこと。**
 */
function groupByYear(entries: TournamentEntry[]): YearGroup[] {
  const groups = new Map<string, YearGroup>();
  for (const e of entries) {
    const key = e.year == null ? "unknown" : String(e.year);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: e.year == null ? "年が分からない大会" : `${e.year}年`,
        seasons: [],
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(e);
    const label = seasonLabel(e.season as RegionalSeason);
    if (!group.seasons.includes(label)) group.seasons.push(label);
  }
  return [...groups.values()];
}

function List({
  prefectureSlug,
  entries,
}: {
  prefectureSlug: string;
  entries: TournamentEntry[];
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {entries.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/prefectures/${prefectureSlug}/${t.slug}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {/* ★**`name` ではなく `displayName`**（並び・スラッグは `name` のまま） */}
              {t.displayName ?? `${t.year ?? ""}年${seasonLabel(t.season)}`}
            </span>
            <span className="shrink-0 text-xs text-ink-muted">
              {t.games.length}試合
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
