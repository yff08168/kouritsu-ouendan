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
      className="rounded-xl border border-line bg-white p-4 sm:p-5"
    >
      <SectionHeading
        id="results-heading"
        title="結果速報"
        icon={<Flame size={18} />}
      />

      <p className="mt-1 text-xs text-ink-muted">
        {results.tournamentTitle}
        {latest && <>・{latest}の試合まで</>}
      </p>

      {results.alive.length > 0 && <AliveSchools alive={results.alive} />}

      {games.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
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
          {results.tournamentTitle}
        </Link>
        （Wikipedia・CC BY-SA）
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
    <div className="mt-3 rounded-lg bg-accent-50 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-accent-800">
        <Trophy size={13} aria-hidden="true" />
        勝ち残っている公立校
      </h3>
      <ul className="mt-2 space-y-1.5">
        {alive.map((school) => (
          <li key={school.slug} className="text-sm">
            <Link
              href={`/schools/${school.slug}`}
              title={school.name}
              className="font-bold text-navy-800 hover:underline"
            >
              {school.display}
            </Link>
            {school.prefecture && (
              <span className="ml-1 text-xs text-ink-muted">
                （{school.prefecture}）
              </span>
            )}
            <span className="ml-1.5 text-xs font-medium text-accent-800">
              {school.wins}勝
            </span>

            {school.next && (
              <span className="ml-2 text-xs text-ink-muted">
                次戦 {school.next.round}
                {/* 日付はブラケットに入っていないことが多い。無いときは触れない */}
                {school.next.date && <>・{school.next.date}</>}
                {" "}vs {school.next.opponent}
              </span>
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
    <div className="flex items-baseline gap-2.5 py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold ring-1",
          ours.won
            ? "bg-accent-50 text-accent-800 ring-accent-200"
            : "bg-navy-50 text-ink-muted ring-line",
        )}
      >
        {ours.won ? "○" : "●"}
      </span>
      <span className="sr-only">{ours.won ? "勝ち" : "負け"}</span>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-faint">
          {game.date}
          <span className="ml-1.5">{game.round}</span>
        </p>

        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          {/*
            **略称で揃える。** 学校マスタの「佐賀商業高校」を出すと、
            相手校（大会記事の略称「拓大紅陵」）と並んだときに
            公立校だけ「高校」が付いて不揃いに見える。
          */}
          <Link
            href={`/schools/${ours.slug}`}
            title={ours.name}
            className="text-sm font-bold text-navy-800 hover:underline"
          >
            {ours.display}
          </Link>
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
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
          <span className="text-sm text-ink">
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
    </div>
  );
}
