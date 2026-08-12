import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  isEmbeddableVideo,
  summarizeRun,
  type Linescore,
  type RunGame,
  type TournamentRun as Run,
} from "@/lib/content/tournament-runs";

/**
 * 甲子園の勝ち上がりを1試合ずつ縦に並べる。
 *
 * 表ではなく縦のリストにしているのは、狭い画面でも横スクロールが出ないようにするため。
 * 各試合が「回戦・相手・スコア・寸評」を持つので、表にすると列が多くなりすぎる。
 *
 * **敗戦数は出さない**（サイト全体の方針）。1試合ごとの勝敗は物語として出すが、
 * 見出しの集計は勝ち数だけにしている。
 */
export function TournamentRun({ run }: { run: Run }) {
  const { wins, draws } = summarizeRun(run);

  return (
    <section
      aria-labelledby="tournament-run"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="tournament-run" className="text-base font-bold text-navy-800">
          甲子園での勝ち上がり
        </h2>
        <p className="text-xs text-ink-muted">
          {run.tournamentName}
        </p>
      </div>

      <p className="mt-1 text-sm text-ink-muted">
        {run.result}・{wins}勝
        {draws > 0 && `（ほかに引き分け${draws}試合）`}
      </p>

      <ol className="mt-4">
        {run.games.map((game, i) => (
          <GameRow
            key={`${game.round}-${game.opponent}-${i}`}
            game={game}
            isLast={i === run.games.length - 1}
          />
        ))}
      </ol>

      {run.videos && run.videos.length > 0 && <Videos videos={run.videos} />}

      <Sources sources={run.sources} />
    </section>
  );
}

/** 勝敗ごとの見た目。引き分けは勝ちでも負けでもない扱いにする。 */
const OUTCOME_STYLE = {
  win: {
    label: "○",
    badge: "bg-accent-50 text-accent-800 ring-accent-200",
    score: "text-accent-800",
  },
  loss: {
    label: "●",
    badge: "bg-navy-50 text-ink-muted ring-line",
    score: "text-ink-muted",
  },
  draw: {
    label: "△",
    badge: "bg-navy-50 text-ink-muted ring-line",
    score: "text-ink-muted",
  },
} as const;

function GameRow({ game, isLast }: { game: RunGame; isLast: boolean }) {
  const style = OUTCOME_STYLE[game.outcome];

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* 勝ち上がりの縦線。最後の試合の下には引かない */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[0.9375rem] top-8 h-[calc(100%-2rem)] w-px bg-line"
        />
      )}

      <span
        aria-hidden="true"
        className={cn(
          "z-10 mt-0.5 flex size-[1.875rem] shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1",
          style.badge,
        )}
      >
        {style.label}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-navy-800">{game.round}</span>
          {game.date && (
            <span className="text-xs text-ink-faint">{game.date}</span>
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-base font-bold tabular-nums", style.score)}>
            {game.scoreFor}
            {game.walkOff && (
              <>
                <span aria-hidden="true">x</span>
                <span className="sr-only">（サヨナラ）</span>
              </>
            )}
            {" - "}
            {game.scoreAgainst}
          </span>
          <span className="text-sm text-ink">
            {game.opponent}
            {game.opponentPrefecture && (
              <span className="ml-1 text-xs text-ink-faint">
                （{game.opponentPrefecture}）
              </span>
            )}
          </span>
        </p>

        {game.note && (
          <p className="mt-0.5 text-xs text-ink-faint">{game.note}</p>
        )}

        {game.comment && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {game.comment}
          </p>
        )}

        {game.linescore && <LinescoreTable linescore={game.linescore} />}
      </div>
    </li>
  );
}

/**
 * イニングごとの得点表（スコアボード）。
 *
 * 資料がある試合にだけ出る。延長15回まであるので、狭い画面では
 * 表だけを横スクロールさせる（ページ全体は横に流れないようにする）。
 */
function LinescoreTable({ linescore: ls }: { linescore: Linescore }) {
  const innings = Math.max(ls.roadInnings.length, ls.homeInnings.length);
  const headers = Array.from({ length: innings }, (_, i) => i + 1);

  // 安打・失策は資料にあるときだけ列を出す。片方だけ出すと比較にならないので
  // 両チームぶん揃っていることを条件にする。
  const showHits = ls.roadTotals.h != null && ls.homeTotals.h != null;
  const showErrors = ls.roadTotals.e != null && ls.homeTotals.e != null;

  const rows = [
    {
      team: ls.roadTeam,
      cells: ls.roadInnings,
      totals: ls.roadTotals,
      isSubject: ls.subject === "road",
      pitchers: ls.roadPitchers,
      homeRuns: ls.roadHomeRuns,
    },
    {
      team: ls.homeTeam,
      cells: ls.homeInnings,
      totals: ls.homeTotals,
      isSubject: ls.subject === "home",
      pitchers: ls.homePitchers,
      homeRuns: ls.homeHomeRuns,
    },
  ];

  return (
    <div className="mt-3 rounded-lg border border-line bg-navy-50/40 p-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <caption className="sr-only">
            {ls.roadTeam} 対 {ls.homeTeam} のイニングごとの得点
          </caption>
          <thead>
            <tr className="text-ink-faint">
              <th scope="col" className="sr-only">
                チーム
              </th>
              {headers.map((n) => (
                <th
                  key={n}
                  scope="col"
                  className="w-6 px-0.5 py-1 text-center font-medium"
                >
                  {n}
                </th>
              ))}
              <th scope="col" className="w-7 px-0.5 py-1 text-center font-bold">
                R
              </th>
              {showHits && (
                <th
                  scope="col"
                  className="w-7 px-0.5 py-1 text-center font-medium"
                >
                  H
                </th>
              )}
              {showErrors && (
                <th
                  scope="col"
                  className="w-7 px-0.5 py-1 text-center font-medium"
                >
                  E
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team} className="border-t border-line">
                <th
                  scope="row"
                  className={cn(
                    "whitespace-nowrap py-1.5 pr-3 text-left text-xs",
                    row.isSubject
                      ? "font-bold text-navy-800"
                      : "font-medium text-ink-muted",
                  )}
                >
                  {row.team}
                </th>
                {headers.map((_, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-0.5 py-1.5 text-center",
                      row.isSubject ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {row.cells[i] ?? ""}
                  </td>
                ))}
                <td
                  className={cn(
                    "px-0.5 py-1.5 text-center font-bold",
                    row.isSubject ? "text-accent-800" : "text-ink-muted",
                  )}
                >
                  {row.totals.r}
                </td>
                {showHits && (
                  <td className="px-0.5 py-1.5 text-center text-ink-muted">
                    {row.totals.h}
                  </td>
                )}
                {showErrors && (
                  <td className="px-0.5 py-1.5 text-center text-ink-muted">
                    {row.totals.e}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-2 space-y-0.5 text-xs text-ink-faint">
        {rows.map(
          (row) =>
            row.pitchers && (
              <div key={row.team} className="flex gap-1.5">
                <dt className="shrink-0">{row.team} 投手</dt>
                <dd className="min-w-0">{row.pitchers}</dd>
              </div>
            ),
        )}
        {rows.map(
          (row) =>
            row.homeRuns && (
              <div key={`hr-${row.team}`} className="flex gap-1.5">
                <dt className="shrink-0">{row.team} 本塁打</dt>
                <dd className="min-w-0">{row.homeRuns}</dd>
              </div>
            ),
        )}
        {ls.duration && (
          <div className="flex gap-1.5">
            <dt className="shrink-0">試合時間</dt>
            <dd>{ls.duration}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * 動画。
 *
 * **権利者の公式チャンネルのものだけ埋め込む。** テレビ放送を個人が
 * アップロードしたものは、埋め込み自体は技術的にできても、侵害動画と
 * 分かって案内すると幇助になりうるうえ、消されると記事が虫食いになる。
 * 判断は isEmbeddableVideo に閉じ込めてある。
 */
function Videos({ videos }: { videos: NonNullable<Run["videos"]> }) {
  const embeddable = videos.filter(isEmbeddableVideo);

  if (embeddable.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="text-sm font-bold text-navy-800">映像で見る</h3>
      <ul className="mt-3 space-y-4">
        {embeddable.map((video) => (
          <li key={video.url}>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-navy-50">
              <iframe
                src={video.url}
                title={video.title}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 size-full border-0"
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              {video.title}（{video.channel}）
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sources({ sources }: { sources: Run["sources"] }) {
  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="text-xs font-medium text-ink-muted">出典</h3>
      <ul className="mt-1.5 space-y-1">
        {sources.map((source) => (
          <li key={source.url ?? source.label} className="text-xs">
            {/* URLが無い出典もある（運営者自身の記録・書籍など） */}
            {source.url ? (
              <Link
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-baseline gap-1 text-ink-muted underline hover:text-navy-800"
              >
                {source.label}
                <ExternalLink
                  size={11}
                  aria-hidden="true"
                  className="shrink-0"
                />
              </Link>
            ) : (
              <span className="text-ink-muted">{source.label}</span>
            )}
            {source.note && (
              <span className="ml-1 text-ink-faint">— {source.note}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        スコアと対戦相手は上記の出典で確認しています。試合の寸評は出典をもとに
        当サイトが書いたものです。
      </p>
    </div>
  );
}
