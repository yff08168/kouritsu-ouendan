import Link from "next/link";
import { Flame, Trophy } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { cn } from "@/lib/utils";
import {
  latestGameDate,
  sortGamesByRecency,
  type LiveGame,
  type LiveResults,
} from "@/lib/live-results";

/**
 * トップページの結果速報。
 *
 * データは `src/lib/data/live-results.ts`（生成物）。GitHub Actions が
 * 3時間おきに Wikipedia から取り直してコミットする。
 *
 * **公立校が絡む試合しか入っていない。** それがこのサイトの切り口で、
 * 大手のニュースサイトには無いもの。速さでは勝てないが、
 * 「今日勝った公立校だけ」という絞り込みは他にない。
 */
export function LiveResultsCard({
  results,
  limit = 6,
}: {
  results: LiveResults;
  limit?: number;
}) {
  const games = sortGamesByRecency(results.games).slice(0, limit);
  const latest = latestGameDate(results.games);

  return (
    <section
      aria-labelledby="results-heading"
      className="rounded-xl border border-line bg-white p-4 sm:p-6"
    >
      <SectionHeading
        id="results-heading"
        title="結果速報"
        icon={<Flame size={22} />}
      />

      <p className="mt-1 text-sm text-ink-muted">
        {results.tournamentTitle}
        {latest && <>・{latest}の試合まで</>}
      </p>

      {results.alive.length > 0 && <AliveSchools alive={results.alive} />}

      {games.length === 0 ? (
        <p className="mt-4 text-base text-ink-muted">
          いまは大会期間外です。春の選抜と夏の選手権が始まると、
          公立高校が出場した試合の結果をここに出します。
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {games.map((game, i) => (
            <li key={`${game.date}-${game.order}-${i}`}>
              <GameRow game={game} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
        公立高校が出場した試合だけを載せています。出典:{" "}
        <Link
          href={results.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-navy-800"
        >
          日本高等学校野球連盟「{results.tournamentTitle}」試合日程・結果
        </Link>
      </p>
    </section>
  );
}

/**
 * まだ負けていない公立校。
 *
 * **敗退した学校は自然に消える**（負けた時点で一覧から外れる）ので、
 * 「勝ち残り」という状態をそのまま出せる。
 */
function AliveSchools({ alive }: { alive: LiveResults["alive"] }) {
  return (
    <div className="mt-4 rounded-lg bg-accent-50 p-3.5">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-accent-800">
        <Trophy size={16} aria-hidden="true" />
        勝ち残っている公立校
      </h3>
      <ul className="mt-2.5 space-y-2.5">
        {alive.map((school) => (
          <li key={school.slug}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={`/schools/${school.slug}`}
                title={school.name}
                className="text-lg font-bold text-navy-800 hover:underline"
              >
                {school.display}
              </Link>
              {school.prefecture && (
                <span className="text-sm text-ink-muted">
                  （{school.prefecture}）
                </span>
              )}
              <span className="text-base font-bold text-accent-800">
                {school.wins}勝
              </span>
            </p>

            {/*
              次戦。日付・第何試合・開始時刻まで出せるのは出典が高野連だから。
              **日程が発表されていない試合はページ自体が無い**ので、
              「相手だけ分かっていて日付が空」という状態にはならない。
            */}
            {school.next ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 rounded bg-white/70 px-2.5 py-1.5 text-sm">
                <span className="rounded bg-accent-500 px-1.5 py-0.5 text-xs font-bold text-navy-900">
                  次戦
                </span>
                <span className="font-bold text-ink">
                  {school.next.date}
                  {school.next.startTime && (
                    <span className="ml-1.5">{school.next.startTime}</span>
                  )}
                </span>
                <span className="text-ink-muted">
                  {school.next.order && <>第{school.next.order}試合・</>}
                  {school.next.round}
                </span>
                <span className="text-ink">vs {school.next.opponent}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">
                次戦の日程はまだ発表されていません
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GameRow({ game }: { game: LiveGame }) {
  // 公立校を先に出す。両方が公立なら元の順のまま。
  const ours = game.teams.find((t) => t.slug);
  const other = game.teams.find((t) => t !== ours);

  if (!ours || !other) return null;

  return (
    /*
      横一列のスコアボードにしてある。日付を左の固定幅に置き、対戦を
      「自校 ─ スコア ─ 相手」の3分割にすると、行をまたいでスコアの
      位置が揃い、カードの幅を端まで使える。
    */
    <div className="flex items-center gap-3 py-3.5 sm:gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1",
          ours.won
            ? "bg-accent-50 text-accent-800 ring-accent-200"
            : "bg-navy-50 text-ink-muted ring-line",
        )}
      >
        {ours.won ? "○" : "●"}
      </span>
      <span className="sr-only">{ours.won ? "勝ち" : "負け"}</span>

      <p className="w-16 shrink-0 text-xs leading-tight text-ink-faint sm:w-28 sm:text-sm">
        {game.date}
        {/* 開始時刻は高野連の一次情報。実施済みの試合は実際に始まった時刻 */}
        {game.startTime && (
          <span className="ml-1 hidden sm:inline">{game.startTime}</span>
        )}
        <span className="block">
          {game.order && <span className="hidden sm:inline">第{game.order}試合・</span>}
          {game.round}
        </span>
      </p>

      {/*
        **スコアの列を固定幅にする。** 横並び（flex）にすると
        「0 - 1」と「0 - 10」で幅が変わり、行ごとに校名の右端が数pxずれる。
        真ん中を固定した3列グリッドにすれば、どの行でも位置が揃う。
      */}
      <p className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] sm:gap-x-3">
        {/*
          **略称で揃える。** 学校マスタの「佐賀商業高校」を出すと、
          相手校（大会記事の略称「拓大紅陵」）と並んだときに
          公立校だけ「高校」が付いて不揃いに見える。
        */}
        <Link
          href={`/schools/${ours.slug}`}
          title={ours.name}
          className="min-w-0 text-right text-base font-bold text-navy-800 hover:underline sm:truncate sm:text-xl"
        >
          {ours.display}
        </Link>
        <span
          className={cn(
            "text-center text-lg font-bold tabular-nums sm:text-2xl",
            ours.won ? "text-accent-800" : "text-ink-muted",
          )}
        >
          {ours.score}
          {game.walkOff && ours.won && (
            <>
              <span aria-hidden="true">x</span>
              <span className="sr-only">（サヨナラ）</span>
            </>
          )}
          {" - "}
          {other.score}
        </span>
        <span className="min-w-0 text-base text-ink sm:truncate sm:text-xl">
          {other.slug ? (
            <Link
              href={`/schools/${other.slug}`}
              title={other.name}
              className="font-bold text-navy-800 hover:underline"
            >
              {other.display}
            </Link>
          ) : (
            other.display
          )}
        </span>
      </p>
    </div>
  );
}
