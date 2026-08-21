import Link from "next/link";
import { MapPinned } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { cn } from "@/lib/utils";
import {
  formatRegionalDate,
  pickRegionalGames,
  seasonLabel,
  type RegionalPickup,
  type RegionalPickups,
} from "@/lib/regional-results";

/**
 * トップページの地方大会の結果。
 *
 * データは `src/lib/data/regional-pickup.ts`（生成物・**抜粋だけ**）。
 * 県ごとの全試合は `src/lib/data/regional/<県>.ts` にあり、そちらは
 * 1県あたり約100KBあるのでトップでは読まない。
 *
 * ------------------------------------------------------------------
 * ★**並べ替えはここ（表示時）でやる。生成時ではない。**
 *
 *   生成時に混ぜると、試合が1つも増えていなくても実行のたびに生成物が
 *   変わり、3時間おきのCIが意味のないコミットを積み続ける。
 *   生成側は「公立が勝った試合を優先・新しい順・1県4件まで」で決め打ちに選び、
 *   混ぜるのはここ。ページは ISR（10分）なので、実際に入れ替わるのは再生成のとき。
 *
 * ------------------------------------------------------------------
 * **出典は県ごとに違う。** 連盟とは限らず、埼玉・神奈川は個人運営の
 * 情報サイトから取っている。**1つにまとめて「各都道府県高野連」と
 * 書かないこと。** 出した試合の出典だけを、その名前で並べる。
 */
export function RegionalResultsCard({
  pickups,
  limit = 4,
  seed,
}: {
  pickups: RegionalPickups;
  /** 出す試合数 */
  limit?: number;
  /** 同じ並びを再現したいとき（検証用）。省略すると毎回変わる */
  seed?: number;
}) {
  const games = pickRegionalGames(pickups, limit, seed);

  /*
    ★**出典を並べる処理は 2026-08-21 に消した**（画面から外したため。運営者の判断）。
    戻すときは「**出した試合の出典だけ**を、その名前で並べる」に戻すこと ——
    出していない県の出典を書いたり、1つにまとめて「各都道府県高野連」と
    書いたりしないこと（出典は県ごとに違い、連盟とは限らない）。
  */

  return (
    <section
      aria-labelledby="regional-heading"
      className="rounded-xl border border-line bg-white p-4 sm:p-6"
    >
      <SectionHeading
        id="regional-heading"
        title="地方大会の結果"
        icon={<MapPinned size={22} />}
      />

      {/*
        ★**抜粋はいちばん新しい季節だけ**（2026-08-21 に変えた）。
        以前は春・夏・秋を混ぜていたので「秋季・春季大会と選手権予選から」と
        書いていたが、**いまは1つの季節しか出ない**ので、その季節を名乗る。
        ★**季節が分からないときだけ、元の言い方に落とす。**
      */}
      <p className="mt-1 text-sm text-ink-muted">
        {pickups.spotlightSeason
          ? `各県の${seasonLabel(pickups.spotlightSeason)}から、公立高校の試合を選んで出しています`
          : "各県の地方大会から、公立高校の試合を選んで出しています"}
        {pickups.latestDate && <>・{formatRegionalDate(pickups.latestDate)}の試合まで</>}
      </p>

      {games.length === 0 ? (
        <p className="mt-4 text-base text-ink-muted">
          いまは掲載できる地方大会の結果がありません。
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {games.map((game, i) => (
            <li key={`${game.districtSlug}-${game.date}-${i}`}>
              <RegionalRow game={game} />
            </li>
          ))}
        </ul>
      )}

      {/*
        ★**出典の行は 2026-08-21 に運営者の判断で画面から外した。**
        **データ側（`sourceName` / `sourceUrl`）は残してある**ので、戻すのはここだけ。
        ★**どの県をどこから取っているかの記録が消えたわけではない**
        （README とアダプタのコメントにある）。
      */}
    </section>
  );
}

function RegionalRow({ game }: { game: RegionalPickup }) {
  /*
    公立校を先に出す。**両方が公立なら勝ったほうを先にする。**
    行の先頭に出す ○ / ● はこの学校の勝敗なので、公立同士の試合で
    負けたほうを先に置くと、公立が勝った試合なのに ● が並んでしまう。

    **連合チームは公立扱いにしない**（どの学校の戦績かを決められない）。
  */
  const ourCandidates = game.teams.filter((t) => t.slug && !t.combined);
  const ours = ourCandidates.find((t) => t.won) ?? ourCandidates[0];
  const other = game.teams.find((t) => t !== ours);
  if (!ours || !other) return null;

  // ★引き分けを「負け」と書かない（`RegionalDistrictCard` と同じ理由）
  const drawn = ours.score === other.score;

  return (
    // 甲子園の速報カード（LiveResultsCard）と同じ組み方にそろえてある
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
        {ours.won ? "○" : drawn ? "△" : "●"}
      </span>
      <span className="sr-only">{ours.won ? "勝ち" : drawn ? "引き分け" : "負け"}</span>

      <p className="w-16 shrink-0 text-xs leading-tight text-ink-faint sm:w-28 sm:text-sm">
        <Link
          href={`/prefectures/${game.districtSlug}`}
          className="font-bold text-navy-700 hover:underline"
        >
          {game.district}
        </Link>
        <span className="block">{formatRegionalDate(game.date)}</span>
        {/*
          ★**回戦は出典に無いことがある。** 山梨は準々決勝より前の日に回戦を
          書いていない。「・」を決め打ちで出すと「選手権予選・」と中黒が宙に浮く。
          **無いものを埋めない**（推測した回戦を出すほうが害が大きい）。
        */}
        <span className="block">
          <span className="hidden sm:inline">
            {seasonLabel(game.season)}
            {game.round && "・"}
          </span>
          {game.round}
        </span>
      </p>

      {/*
        **スコアの列を固定幅にする。** 横並びにすると「0 - 1」と「0 - 10」で
        幅が変わり、行ごとに校名の右端がずれる（甲子園のカードと同じ理由）。
      */}
      <p className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] sm:gap-x-3">
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
          {" - "}
          {other.score}
        </span>
        <span className="min-w-0 text-base text-ink sm:truncate sm:text-xl">
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
