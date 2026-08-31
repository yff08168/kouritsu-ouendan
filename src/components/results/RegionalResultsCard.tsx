import Link from "next/link";
import { ChevronRight, MapPinned } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { ResultsCarousel } from "@/components/results/ResultsCarousel";
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
  perSlide = 12,
  slides = 4,
  seed,
}: {
  pickups: RegionalPickups;
  /**
   * 1枚に出す試合数。★**枚をまたいで変えないこと**（高さが揃わなくなる）。
   * ★★**2列×6行＝12件**（2026-08-31。運営者の指示）。
   * それまで1列4件で、**校名の字が大きいぶん余白が目立っていた。**
   * ★**狭い画面では1列に落とす**（半分の幅に校名2つとスコアは入らない）。
   */
  perSlide?: number;
  /** 何枚までめくれるようにするか */
  slides?: number;
  /** 同じ並びを再現したいとき（検証用）。省略すると毎回変わる */
  seed?: number;
}) {
  /*
    ★★**抜粋は20試合入っているのに、4試合しか出していなかった**（2026-08-31）。
    **データを増やさずに見せる量を5倍にできる**ので、枚に分けて横へめくる。
    ★**足りなければ枚数が減るだけ**（`chunk` が空の枚を作らない）。
  */
  const games = pickRegionalGames(pickups, perSlide * slides, seed);
  const pages = chunk(games, perSlide);

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
      {/* ★進捗の地図（/regional）への入口。地図から各県の試合とトーナメント表へ行ける */}
      <SectionHeading
        id="regional-heading"
        title="地方大会の結果"
        icon={<MapPinned size={22} />}
        moreHref="/regional"
        moreLabel="全国の進捗を見る"
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
        <ResultsCarousel
          className="mt-4"
          label="地方大会の結果"
          /*
            ★★**中身はここ（サーバー）で全部描いて渡す。**
            カルーセル側で描くと、**検索エンジンには1枚ぶんしか見えない。**
          */
          slides={pages.map((page, p) => (
            /*
              ★★**2列×6行**（2026-08-31）。
              ★**区切り線は列ごとに引く** —— 格子全体に `divide-y` を掛けると
              **左右で線の位置が食い違う**（行の高さが揃わないため）。
              ★**列のあいだに縦線を1本**入れて、どちらの列を読んでいるか分かるようにする。
            */
            <div
              key={p}
              className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-line"
            >
              {chunk(page, Math.ceil(page.length / 2)).map((column, c) => (
                <ul
                  key={c}
                  className="divide-y divide-line sm:first:pr-5 sm:last:pl-5"
                >
                  {column.map((game, i) => (
                    <li key={`${game.districtSlug}-${game.date}-${i}`}>
                      <RegionalRow game={game} />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ))}
        />
      )}

      {/*
        ★★**下にも「全国の進捗」への入口を置く**（2026-08-31。運営者の指示）。
        見出しの右にも同じリンクがあるが、**そちらは読み始める前の位置**。
        ★**結果を見終わった人が次に行く先**なので、下にも要る。
        ★**行き先は同じ `/regional`**（進捗地図。県ごとの試合とトーナメント表へ辿れる）。
      */}
      <Link
        href="/regional"
        className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"
      >
        <MapPinned size={16} aria-hidden="true" className="text-accent-500" />
        全国47地区の進捗を見る
        <ChevronRight size={16} aria-hidden="true" className="text-ink-faint" />
      </Link>

      {/*
        ★**出典の行は 2026-08-21 に運営者の判断で画面から外した。**
        **データ側（`sourceName` / `sourceUrl`）は残してある**ので、戻すのはここだけ。
        ★**どの県をどこから取っているかの記録が消えたわけではない**
        （README とアダプタのコメントにある）。
      */}
    </section>
  );
}

/** 決まった数ずつに切り分ける。★**空の枚は作らない** */
function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
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
    /*
      ★★**県・日付を上の行に逃がしてある**（2026-08-31。2列にしたため）。

        以前は「県・日付」を左の細い列に置いていたが、**2列にすると
        校名に残る幅が50pxしかなくなり、実測で22校が3文字ほどに切れていた**
        （`岡山吉備白陵` → `岡山吉…`）。
        ★**校名はこのサイトの主役。切ってはいけない。**
        上に逃がすと、校名とスコアが列の幅を丸ごと使える。

      ★**丸（○●△）は上の行の先頭に置く。** 2行にまたがせると
      行の高さが揃わず、左右の列で段差が出る。
    */
    <div className="py-2.5">
      <p className="flex items-center gap-1.5 text-[0.6875rem] leading-tight text-ink-faint">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold ring-1",
            ours.won
              ? "bg-accent-50 text-accent-800 ring-accent-200"
              : "bg-navy-50 text-ink-muted ring-line",
          )}
        >
          {ours.won ? "○" : drawn ? "△" : "●"}
        </span>
        <span className="sr-only">
          {ours.won ? "勝ち" : drawn ? "引き分け" : "負け"}
        </span>
        <Link
          href={`/prefectures/${game.districtSlug}`}
          className="font-bold text-navy-700 hover:underline"
        >
          {game.district}
        </Link>
        <span>{formatRegionalDate(game.date)}</span>
        {/*
          ★**回戦は出典に無いことがある。** 山梨は準々決勝より前の日に回戦を
          書いていない。「・」を決め打ちで出すと「秋季大会・」と中黒が宙に浮く。
          **無いものを埋めない**（推測した回戦を出すほうが害が大きい）。
          ★**狭いときは季節を省く**（日付と回戦のほうが効く）。
        */}
        <span className="truncate">
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
      <p className="mt-0.5 grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-baseline gap-x-1.5">
        <Link
          href={`/schools/${ours.slug}`}
          title={ours.name}
          className="min-w-0 truncate text-right text-base font-bold text-navy-800 hover:underline"
        >
          {ours.display}
        </Link>
        <span
          className={cn(
            "text-center text-lg font-bold tabular-nums",
            ours.won ? "text-accent-800" : "text-ink-muted",
          )}
        >
          {ours.score}
          {" - "}
          {other.score}
        </span>
        <span className="min-w-0 truncate text-base text-ink">
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
