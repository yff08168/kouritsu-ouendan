import Link from "next/link";

import { BracketTeamRow } from "@/components/results/RegionalBracket";
import { cn } from "@/lib/utils";
import {
  formatRegionalDate,
  gameKey,
  type RegionalGame,
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
 * ★★ 1試合を小さな箱にして、2〜3列に並べる（2026-09-25。運営者の指示）
 *
 *   それまでは1試合1行で**縦に積み上げていた**（1回戦だけで42行）。
 *   運営者の「縦に積み上げる形式は見づらい」「トーナメント表の形式が見やすいので、これにして」から、
 *   **トーナメント表と同じ箱**（校名と得点の2行。勝った側が濃い字、公立はオレンジ）にした。
 *   ★**行は表と同じ部品**（`BracketTeamRow`）。**見た目を2つ持たない。**
 *   ★**箱の上に日付・球場・注記を小さく出す**（表には無いが、一覧は日付で追う人がいる）。
 *   ★**列は スマホ2・`sm` から3。**
 *   ★★**読む順は「行ごとに左→右」**（`grid` に流し込む。列で切ると試合の順に読めない）。
 *   ★★**校名は横並びのときより広い幅をもらえる**（1チーム1行なので、箱の幅を丸ごと使える）。
 *   **列を変えたら切れている校名の数を実測すること**（AGENTS の「校名を切ってはいけない」）。
 *
 * ------------------------------------------------------------------
 * ★ 並びは「回戦の浅い順」
 *
 *   大会のページは**勝ち上がりを追って読む**ので、日付の新しい順ではなく
 *   1回戦から並べる。★**日付を持たない出典がある**ので、日付では並べない。
 */
export function RegionalGameList({
  games,
  districtSlug,
}: {
  games: RegionalGame[];
  /**
   * ★★**渡すと、行が試合ごとのページへの入口になる**（2026-09-06。運営者の指示）。
   *
   * ★**渡さない使い方がある** —— この部品は**甲子園と明治神宮のページでも使っている**
   * （`toRegionalGames` で形を寄せてから渡す）。
   * **全国大会の試合には県のファイルが無い**ので、そちらには試合ページが無い。
   * ★**無いものへリンクしない。**
   */
  districtSlug?: string;
}) {
  const groups = groupByRound(games);

  return (
    <div className="mt-3 space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="text-xs font-bold text-ink-faint">
            {group.label}
            <span className="ml-2 font-normal">{group.games.length}試合</span>
          </h3>
          <ul className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {group.games.map((game, i) => (
              <li key={`${group.key}-${i}`}>
                <GameBox game={game} districtSlug={districtSlug} />
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

function GameBox({
  game,
  districtSlug,
}: {
  game: RegionalGame;
  districtSlug?: string;
}) {
  const [a, b] = game.teams;
  if (!a || !b) return null;
  /*
    ★**引き分けを「負け」と書かない。** 高校野球には引き分け再試合がある
    （岐阜の 市岐阜商 0-0 県岐阜商）。`won` は両方 false になるので、
    行はどちらも濃い字にならない（`BracketTeamRow` が `won` だけを見る）。
  */
  /* 日付と球場。★どちらも無い出典があるので、無ければ行ごと出さない */
  const date = game.date ? formatRegionalDate(game.date) : null;

  return (
    /*
      ★★**箱いっぱいに見えないリンクを1枚敷く**（2026-09-06。トップの結果カードと同じ作り）。
      **リンクの中にリンクは置けない**ので、箱を `<a>` で包むと
      **校名から学校ページへ行けなくなる。** 校名側は `relative` で手前に出す。
    */
    <div
      className={cn(
        "relative h-full rounded border border-line bg-white p-1.5",
        districtSlug && "hover:bg-navy-50/60",
      )}
    >
      {districtSlug && (
        <Link
          href={`/prefectures/${districtSlug}/game/${gameKey(game)}`}
          className="absolute inset-0 rounded focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <span className="sr-only">
            {a.display}と{b.display}の試合結果
          </span>
        </Link>
      )}

      {/*
        ★注記（延長・サヨナラ）は**持っている出典だけが出す**（全国大会）。
        ★**日付は縮めない**（`shrink-0`）。縮めるのは球場と注記だけ ——
        スマホの箱は約150pxで、`サヨナラ・延長12回 TB` と並ぶと日付まで「8月…」に切れる。
      */}
      {(date || game.venue || game.note) && (
        <p className="mb-0.5 flex gap-1.5 text-[11px] leading-tight text-ink-faint">
          {date && <span className="shrink-0">{date}</span>}
          {game.venue && (
            <span title={game.venue} className="min-w-0 truncate">
              {game.venue}
            </span>
          )}
          {game.note && (
            <span title={game.note} className="ml-auto min-w-0 truncate">
              {game.note}
            </span>
          )}
        </p>
      )}

      <BracketTeamRow team={a} />
      <BracketTeamRow team={b} />
    </div>
  );
}
