import Link from "next/link";
import { MapPinned } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { cn } from "@/lib/utils";
import {
  groupGamesForDistrict,
  seasonLabel,
  type RegionalDistrict,
  type RegionalGame,
} from "@/lib/regional-results";

/**
 * 県のページ（`/prefectures/<slug>`）に出す、その県の地方大会の結果。
 *
 * ------------------------------------------------------------------
 * ★**トップのカード（`RegionalResultsCard`）とは別物。**
 *
 *   トップ  全国から抜粋した数試合。県名を添えて出す（`regional-pickup.ts`）
 *   ここ    その県の1大会ぶん。県名は自明なので出さない（`regional/<県>.ts`）
 *
 *   見た目は似ているが、読むデータも、出す情報も違う。1つにまとめると
 *   どちらの都合も入って読みにくくなるので分けてある。
 *
 * ------------------------------------------------------------------
 * ★**日付に年を付ける。**
 *
 *   トップは「7月26日」と年を省いているが、これは抜粋が「いちばん新しい
 *   試合から120日以内」に限ってあるため。県のページは**その県で取れている
 *   最新の季節**を出すので、秋のページがまだ前年ぶんしか無い県では
 *   前年の試合が並ぶ。年が無いと今年の試合と見分けが付かない。
 *
 * ------------------------------------------------------------------
 * **出典は県ごとに違う。** 連盟とは限らない（埼玉・神奈川は個人運営の
 * 情報サイト）。**「各都道府県高野連」とまとめて書かないこと。**
 */
export function RegionalDistrictCard({
  district,
  season,
  games,
  total,
  tournaments,
}: {
  district: RegionalDistrict;
  season: Parameters<typeof seasonLabel>[0];
  /** 新しい順 */
  games: RegionalGame[];
  /** その季節に取れている試合の総数 */
  total: number;
  tournaments: string[];
}) {
  const groups = groupGamesForDistrict(games);
  /*
    ★**日付を持たない出典がある**（三重の組合せ表など）。その県は
    日付ではなく**回戦**で見出しを作り、説明文も「回戦順」に変える。
    「新しい順」と書いてあるのに日付が無いと、読む人が戸惑うため。
  */
  const dated = games.some((g) => g.date);

  return (
    <section
      aria-labelledby="pref-regional"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <SectionHeading
        id="pref-regional"
        title={`${district.district}の${seasonLabel(season)}`}
        icon={<MapPinned size={18} />}
      />

      {/*
        ★**大会名を全部つなげない。** 同じ季節に複数の大会が並行して開かれる県がある
        （徳島の新人ブロック大会は南部・中央A・中央B・西部の4つ）。全部つなぐと
        1行が100字を超えて読めない。2つまで出して残りは「ほか」にする。
      */}
      <p className="mt-1 text-sm text-ink-muted">
        {tournaments.length > 0 && (
          <>
            {tournaments.slice(0, 2).join("・")}
            {tournaments.length > 2 && "ほか"}から、
          </>
        )}
        公立高校が出た試合を{dated ? "新しい順" : "回戦の深い順"}に出しています
      </p>

      <div className="mt-4 space-y-4">
        {groups.map(({ key, label, games: groupGames }) => (
          <div key={key}>
            <h3 className="text-xs font-bold text-ink-faint">{label}</h3>
            <ul className="mt-1 divide-y divide-line border-t border-line">
              {groupGames.map((game, i) => (
                <li key={`${key}-${i}`}>
                  <GameRow game={game} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/*
        **取れている試合の総数を必ず出す。** 「これで全部」と読まれると、
        載せていない試合を「行われなかった」と取り違えられる。
      */}
      {total > games.length && (
        <p className="mt-4 text-xs text-ink-faint">
          この大会で公立が出た試合は {total} 件あり、うち新しい {games.length} 件を出しています。
        </p>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
        出典:{" "}
        <Link
          href={district.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-navy-800"
        >
          {district.sourceName}
        </Link>
      </p>
    </section>
  );
}

function GameRow({ game }: { game: RegionalGame }) {
  /*
    公立校を先に出す。**両方が公立なら勝ったほうを先にする**
    （行の先頭の ○ / ● はこの学校の勝敗なので、公立が勝った試合で
    ● が並ぶのを避ける）。トップのカードと同じ決め方。
  */
  const ourCandidates = game.teams.filter((t) => t.slug && !t.combined);
  const ours = ourCandidates.find((t) => t.won) ?? ourCandidates[0];
  const other = game.teams.find((t) => t !== ours);
  if (!ours || !other) return null;

  /*
    ★**引き分けを「負け」と書かない**（2026-08-15）。
    高校野球には**引き分け再試合**がある（岐阜の 市岐阜商 0-0 県岐阜商 が
    翌日 0-10 で再試合になった）。`won` は両方 false になるので、
    「勝っていない＝負け」と読むと**画面に事実と違うことが出る。**
    スコアで引き分けを判定する（`won` の否定では区別が付かない）。
  */
  const drawn = ours.score === other.score;

  return (
    <div className="flex items-center gap-3 py-3 sm:gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1",
          ours.won
            ? "bg-accent-50 text-accent-800 ring-accent-200"
            : "bg-navy-50 text-ink-muted ring-line",
        )}
      >
        {ours.won ? "○" : drawn ? "△" : "●"}
      </span>
      <span className="sr-only">{ours.won ? "勝ち" : drawn ? "引き分け" : "負け"}</span>

      {/*
        ★**回戦は出典に無いことがある**（山梨は準々決勝より前の日に書いていない）。
        推測で埋めず、無ければ列ごと空ける。
      */}
      <p className="w-12 shrink-0 text-xs leading-tight text-ink-faint sm:w-20">
        {game.round}
        {game.venue && <span className="hidden truncate sm:block">{game.venue}</span>}
      </p>

      {/* スコアの列は固定幅。「0 - 1」と「0 - 10」で校名の右端がずれないように */}
      <p className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3">
        <Link
          href={`/schools/${ours.slug}`}
          title={ours.name}
          className="min-w-0 truncate text-right text-sm font-bold text-navy-800 hover:underline sm:text-lg"
        >
          {ours.display}
        </Link>
        <span
          className={cn(
            "text-center text-base font-bold tabular-nums sm:text-xl",
            ours.won ? "text-accent-800" : "text-ink-muted",
          )}
        >
          {ours.score}
          {" - "}
          {other.score}
        </span>
        <span className="min-w-0 truncate text-sm text-ink sm:text-lg">
          {other.slug && !other.combined ? (
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
