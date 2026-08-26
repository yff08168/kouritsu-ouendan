import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  formatRegionalDate,
  type RegionalGame,
  type RegionalTeam,
} from "@/lib/regional-results";

/**
 * 1つの大会の**全試合**。大会のページ（`/prefectures/<県>/<大会>`）で使う。
 *
 * ------------------------------------------------------------------
 * ★★ `RegionalDistrictCard` の `GameRow` とは別物
 *
 *   あちらは**公立を主語にした行**で、「公立が絡む試合」しか描けない
 *   （`ours` が取れないと null を返す）。
 *   ★**ここは私立どうしの試合も出す。** 大会を通して見に来た人に、
 *   **枝の途中が抜けた一覧を見せない。**
 *
 *   ★**着目するところは色で示す** —— `RegionalBracket` と同じで、
 *   **公立はオレンジ**（面ではなく字の色。アクセントは小面積のみ）。
 *
 * ------------------------------------------------------------------
 * ★ 並びは「回戦の浅い順」
 *
 *   大会のページは**勝ち上がりを追って読む**ので、日付の新しい順ではなく
 *   1回戦から並べる。★**日付を持たない出典がある**ので、日付では並べない。
 */
export function RegionalGameList({ games }: { games: RegionalGame[] }) {
  const groups = groupByRound(games);

  return (
    <div className="mt-3 space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="text-xs font-bold text-ink-faint">
            {group.label}
            <span className="ml-2 font-normal">{group.games.length}試合</span>
          </h3>
          <ul className="mt-1 divide-y divide-line border-t border-line">
            {group.games.map((game, i) => (
              <li key={`${group.key}-${i}`}>
                <GameRow game={game} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * 回戦ごとにまとめる。
 *
 * ★**回戦の呼び名から深さを出す**（`regional-bracket.ts` と同じ考え方）。
 * 出典によっては回戦が空なので、そのときは末尾にまとめる。
 */
const ROUND_DEPTH: Record<string, number> = {
  "1回戦": 1,
  "2回戦": 2,
  "3回戦": 3,
  "4回戦": 4,
  "5回戦": 5,
  "6回戦": 6,
  準々決勝: 7,
  準決勝: 8,
  "3位決定戦": 9,
  決勝: 10,
};

function groupByRound(games: RegionalGame[]) {
  const map = new Map<string, RegionalGame[]>();
  for (const g of games) {
    const key = g.round ?? "";
    const list = map.get(key);
    if (list) list.push(g);
    else map.set(key, [g]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key: key || "unknown",
      label: key || "回戦の記載なし",
      games: list,
      depth: ROUND_DEPTH[key] ?? 99,
    }))
    .sort((a, b) => a.depth - b.depth);
}

function GameRow({ game }: { game: RegionalGame }) {
  const [a, b] = game.teams;
  if (!a || !b) return null;
  /*
    ★**引き分けを「負け」と書かない。** 高校野球には引き分け再試合がある
    （岐阜の 市岐阜商 0-0 県岐阜商）。`won` は両方 false になるので、
    **スコアで判定する。**
  */
  const drawn = a.score === b.score;

  return (
    <div className="flex items-center gap-3 py-3 sm:gap-4">
      {/* 日付と球場。★どちらも無い出典があるので、無ければ列ごと空ける */}
      <p className="w-14 shrink-0 text-xs leading-tight text-ink-faint sm:w-24">
        {game.date && formatRegionalDate(game.date)}
        {game.venue && (
          <span className="hidden truncate sm:block">{game.venue}</span>
        )}
      </p>

      {/* スコアの列は固定幅。「0 - 1」と「0 - 10」で校名の右端がずれないように */}
      <p className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3">
        <TeamName team={a} align="right" />
        <span
          className={cn(
            "text-center text-base font-bold tabular-nums sm:text-lg",
            drawn ? "text-ink-muted" : "text-navy-800",
          )}
        >
          {a.score}
          {" - "}
          {b.score}
        </span>
        <TeamName team={b} align="left" />
      </p>

      {/* ★注記（延長・サヨナラ）。**持っている出典だけが出す**（全国大会） */}
      {game.note && (
        <p className="hidden w-24 shrink-0 truncate text-xs text-ink-faint sm:block">
          {game.note}
        </p>
      )}
    </div>
  );
}

function TeamName({
  team,
  align,
}: {
  team: RegionalTeam;
  align: "left" | "right";
}) {
  const name = (
    <span
      className={cn(
        "block truncate",
        align === "right" ? "text-right" : "text-left",
        team.won ? "font-bold" : "text-ink-muted",
        // ★公立はオレンジ。**面ではなく字の色**（アクセントは小面積のみ）
        team.slug && !team.combined
          ? "text-accent-800"
          : team.won
            ? "text-navy-800"
            : undefined,
      )}
    >
      {team.display}
    </span>
  );

  // 公立は学校ページへ。私立と連合チームは当サイトに個別ページが無い
  return team.slug && !team.combined ? (
    <Link
      href={`/schools/${team.slug}`}
      title={team.name}
      className="min-w-0 text-sm hover:underline sm:text-base"
    >
      {name}
    </Link>
  ) : (
    <span title={team.name} className="min-w-0 text-sm sm:text-base">
      {name}
    </span>
  );
}
