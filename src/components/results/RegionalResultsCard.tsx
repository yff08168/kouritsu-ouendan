import Link from "next/link";
import { ChevronRight, MapPinned } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { ResultsCarousel } from "@/components/results/ResultsCarousel";
import { cn } from "@/lib/utils";
import { districtOrder } from "@/lib/constants";
import {
  formatRegionalDate,
  gameKey,
  seasonLabel,
  type RegionalPickup,
  type RegionalPickups,
} from "@/lib/regional-results";

/**
 * トップページの地方大会の結果。
 *
 * データは `src/lib/data/regional-pickup.ts`（生成物）。
 * 県ごとの全試合は `src/lib/data/regional/<県>.json` にあり、そちらは
 * 1県あたり約100KBあるのでトップでは読まない。
 *
 * ------------------------------------------------------------------
 * ★★★**出すのは「いちばん新しい日に、公立高校が出た全試合」**（2026-09-06。運営者の指示）。
 *
 * それまでは「公立が勝った試合を優先・1県4件まで」で選んだ抜粋を、
 * 乱数で混ぜて出していた。**その日81試合あったうち画面に出たのは39試合**で、
 * **11試合あった長野も12試合あった新潟も4件で切れていた。**
 * ★**選び方は生成側**（`scripts/build-regional-results.mjs` の `pickupDate`）。
 * **ここでは間引かない。**
 *
 * ------------------------------------------------------------------
 * ★★**県ごとにまとめて、北から順に並べる**（運営者の指示）。
 *
 * ★**日付が全部同じ**になったので、**行から県名と日付を落とせる。**
 * そのぶんの幅は校名に渡している（AGENTS.md「校名を切ってはいけない」）。
 * 日付は説明文に1度だけ書く。
 * ★**並びは `districtOrder`**（JISコード順＝北から南）。**ここに47県の順番を写さない。**
 *
 * ------------------------------------------------------------------
 * ★★**右カラム（勝ち上がっている公立校）は 2026-09-06 に画面から外した**（運営者の指示）。
 * カードが横幅いっぱいになったので**3列**にしてある。
 * ★**データ（`pickups.spotlight`）は残っている。** 戻すのは `src/app/page.tsx` の1か所。
 */
export function RegionalResultsCard({
  pickups,
  rowsPerColumn = 10,
  columns = 3,
  seed,
}: {
  pickups: RegionalPickups;
  /**
   * 1列に入れる行数。**県の見出しも1行として数える**（下の `packColumns`）。
   * ★★**列ごとに変えないこと** —— めくるたびに高さが跳ねる。
   */
  rowsPerColumn?: number;
  /** 1枚あたりの列数。★**狭い画面では CSS が1列・2列に落とす** */
  columns?: number;
  /** 最初に出す枚を決める乱数の種。省略すると毎回変わる（検証用に固定できる） */
  seed?: number;
}) {
  const games = pickups.games;
  const blocks = groupByDistrict(games);
  const columnList = packColumns(blocks, rowsPerColumn);
  const pages = chunk(columnList, columns);

  /*
    ★★**最初に出す枚をずらす**（2026-09-06。運営者の「最初に表示させるのはランダムでOK」）。

    並びは北から南のままで、**どこから読み始めるかだけ**を回す。
    ★**そうしないと、いつ来ても1枚目は青森・茨城で、沖縄は最後の枚にしか出ない。**
    ★**サーバー側で回している** —— クライアントで最初の枚へ飛ばすと、
    **1枚目が一瞬見えてから跳ぶ**（`ResultsCarousel` はDOMの順に並べるだけ）。
  */
  const slides = rotate(pages, pages.length > 1 ? pickStart(pages, seed) : 0);

  const districtCount = new Set(games.map((g) => g.districtSlug)).size;

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
        ★★**説明文で「いつの・何試合か」を言い切る**（2026-09-06）。
        行から日付を落としたぶん、**ここが日付を持つ唯一の場所**になる。
        ★**数は数えたものだけ**（出典が無い日は件数の文が出ない）。
      */}
      <p className="mt-1 text-sm text-ink-muted">
        {pickups.latestDate
          ? `${formatRegionalDate(pickups.latestDate)}の`
          : "直近の"}
        {pickups.spotlightSeason ? seasonLabel(pickups.spotlightSeason) : "地方大会"}
        から、公立高校が出た
        {games.length > 0 && <>{games.length}試合</>}
        {districtCount > 0 && <>（{districtCount}県）</>}
        をすべて出しています
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
          slides={slides.map((page, p) => (
            /*
              ★**列の区切りは縦線1本**（どの列を読んでいるか分かるように）。
              ★**列の数は `columns`。** 狭い画面では1列・2列に落とす
              （半分より狭い幅に校名2つとスコアは入らない）。
            */
            <div
              key={p}
              className="grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:divide-x sm:divide-line lg:grid-cols-3"
            >
              {page.map((column, c) => (
                <div
                  key={c}
                  className="min-w-0 sm:[&:not(:first-child)]:pl-4 sm:[&:not(:last-child)]:pr-4"
                >
                  {column.map((block, b) => (
                    <section key={`${block.slug}-${b}`} className="min-w-0">
                      {/*
                        ★**県名は見出しにして、行からは落としてある。**
                        ★**県のページへのリンク**（その県の全試合とトーナメント表がある）。
                        ★★**列をまたいだ続きには「つづき」と書く** ——
                        同じ県名が2つの列に並ぶので、書かないと別の大会に見える。
                      */}
                      <h3 className="flex items-baseline gap-1.5 border-b border-line pb-1 pt-2 text-xs font-bold text-navy-700 first:pt-0">
                        <Link
                          href={`/prefectures/${block.slug}`}
                          className="hover:underline"
                        >
                          {block.district}
                        </Link>
                        {block.continued && (
                          <span className="font-normal text-ink-faint">つづき</span>
                        )}
                      </h3>
                      <ul className="divide-y divide-line">
                        {block.games.map((game, i) => (
                          <li key={`${block.slug}-${i}`}>
                            <RegionalRow game={game} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ))}
            </div>
          ))}
        />
      )}

      {/*
        ★★**下にも「全国の進捗」への入口を置く**（2026-08-31。運営者の指示）。
        見出しの右にも同じリンクがあるが、**そちらは読み始める前の位置**。
        ★**結果を見終わった人が次に行く先**なので、下にも要る。
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
      */}
    </section>
  );
}

/** 1つの県のかたまり。`continued` は前の列からの続き */
type Block = {
  slug: string;
  district: string;
  games: RegionalPickup[];
  continued: boolean;
};

/**
 * 県ごとにまとめて、北から南へ並べる。
 *
 * ★**並びは `districtOrder`**（JISコード順。北北海道 → 南北海道 → 北海道 → 青森 … 沖縄）。
 * ★**県の中の並びは生成物のまま**（出典が並べた順）。**ここで混ぜない** ——
 * 実行のたびに変わると、試合が増えていなくても差分が出る。
 */
function groupByDistrict(games: RegionalPickup[]): Block[] {
  const bySlug = new Map<string, Block>();
  for (const game of games) {
    const found = bySlug.get(game.districtSlug);
    if (found) found.games.push(game);
    else
      bySlug.set(game.districtSlug, {
        slug: game.districtSlug,
        district: game.district,
        games: [game],
        continued: false,
      });
  }
  return [...bySlug.values()].sort(
    (a, b) => districtOrder(a.slug) - districtOrder(b.slug),
  );
}

/**
 * 県のかたまりを列に詰める。
 *
 * ------------------------------------------------------------------
 * ★★**どの列も行数を同じにする**（見出しも1行として数える）。
 *
 * 行数が列ごとに違うと、**同じ枚の中で列の背の高さが揃わない。**
 * ★**県が列に収まらないときは割って、続きの列に見出しを刷り直す**
 * （新聞の段組と同じ）。**割らない詰め方も試したが、順番が決まっているので
 * 隙間だらけになる**（10試合の県が入らずに列を1つ空ける、が頻発する）。
 *
 * ★**刷り直した見出しも1行として数える** —— 数えないと、その列だけ1行はみ出す。
 */
function packColumns(blocks: Block[], rowsPerColumn: number): Block[][] {
  const columns: Block[][] = [];
  let column: Block[] = [];
  let rows = 0;

  const flush = () => {
    if (column.length > 0) columns.push(column);
    column = [];
    rows = 0;
  };

  for (const block of blocks) {
    let continued = false;
    let rest = block.games;
    while (rest.length > 0) {
      // ★見出しに1行使うので、この列に入れられる試合はあと `rows` 次第
      if (rows >= rowsPerColumn - 1) flush();
      const room = rowsPerColumn - rows - 1;
      const take = rest.slice(0, room);
      column.push({ ...block, games: take, continued });
      rows += take.length + 1;
      rest = rest.slice(room);
      continued = true;
      if (rows >= rowsPerColumn) flush();
    }
  }
  flush();
  return columns;
}

/** 決まった数ずつに切り分ける。★**空の枚は作らない** */
function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** 先頭を `at` 枚ぶん回す（並びは変えず、読み始める場所だけ変える） */
function rotate<T>(items: T[], at: number): T[] {
  if (items.length === 0) return items;
  const n = ((at % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

/**
 * 何枚目から読ませるか。
 *
 * ★**`seed` を渡せば同じ場所から始まる**（検証で並びを固定したいとき）。
 *
 * ★★**「つづき」で始まる枚は選ばない**（2026-09-06 に実測して足した）。
 * 12試合ある県は2列にまたがるので、**回した先が運悪くその途中だと、
 * 最初に見える3列が全部「◯◯ つづき」**になる（実際にそうなった）。
 * **何の続きなのかが画面のどこにも無い**ので、読む人には壊れて見える。
 * ★**先頭の列が県の頭から始まる枚まで進める。** 1枚も無ければ元のまま
 * （1県で全部埋まる日はありうる）。
 */
function pickStart(pages: Block[][][], seed?: number): number {
  const count = pages.length;
  const from = seed === undefined ? Math.floor(Math.random() * count) : seed % count;
  for (let i = 0; i < count; i++) {
    const at = (from + i) % count;
    if (pages[at][0]?.[0]?.continued === false) return at;
  }
  return from;
}

function RegionalRow({ game }: { game: RegionalPickup }) {
  /*
    公立校を先に出す。**両方が公立なら勝ったほうを先にする。**
    ★**勝ったほうの得点をオレンジにする**ので、公立同士の試合で
    負けたほうを先に置くと、公立が勝った試合なのに色が付かない。

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
      ★★★**行そのものを試合のページへの入口にする**（2026-09-06。運営者の指示）。

      ★★**リンクの中にリンクは置けない**（HTMLとして不正）。
      校名は**学校ページへのリンクのまま残したい**ので、
      **行を包むのではなく、行いっぱいに広がる見えないリンクを1枚敷く**
      （`absolute inset-0`）。校名リンクは `relative` で手前に出す。
      ★**この形なら、行のどこを押しても試合ページ・校名を押せば学校ページ**になる。

      ★**読み上げには「◯◯対◯◯の試合結果」と読ませる**（`sr-only`）——
      見えないリンクに名前が無いと、何へ行くのか分からない。
    */
    <div className="group relative py-1.5">
      <Link
        href={`/prefectures/${game.districtSlug}/game/${gameKey(game)}`}
        className="absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-accent-500 group-hover:bg-navy-50/60"
      >
        <span className="sr-only">
          {ours.display}と{other.display}の試合結果
        </span>
      </Link>
      {/*
        ★★**県名と日付はここから消えた**（2026-09-06）。
        **県は見出しに、日付はカードの説明文に**移してあるので、
        ★**残るのは回戦だけ。** 3列にしたぶん行の幅が狭いので、
        **校名に渡せる幅をできるだけ増やす。**
      */}
      <p className="flex items-center gap-1.5 text-[0.6875rem] leading-tight text-ink-faint">
        {/*
          ★**勝敗はスコアの色で分かる**（勝ったほうがオレンジ）。
          ★**読み上げ用の文字だけは残す** —— 色は読み上げに乗らないので、
          **これを消すと目の見えない人には勝敗が伝わらなくなる。**
        */}
        <span className="sr-only">
          {ours.won ? "勝ち" : drawn ? "引き分け" : "負け"}
        </span>
        {/*
          ★**回戦は出典に無いことがある。** 無いものを埋めない
          （推測した回戦を出すほうが害が大きい）。
        */}
        <span className="truncate">{game.round}</span>
      </p>

      {/*
        **スコアの列を固定幅にする。** 横並びにすると「0 - 1」と「0 - 10」で
        幅が変わり、行ごとに校名の右端がずれる（甲子園のカードと同じ理由）。
        ★**3列にしたので幅を 4.5rem → 3.5rem に詰めてある**（校名に回す）。
      */}
      <p className="mt-0.5 grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-baseline gap-x-1">
        <Link
          href={`/schools/${ours.slug}`}
          title={ours.name}
          className="min-w-0 truncate relative text-right text-[0.9375rem] font-bold text-navy-800 hover:underline"
        >
          {ours.display}
        </Link>
        <span
          className={cn(
            "text-center text-base font-bold tabular-nums",
            ours.won ? "text-accent-800" : "text-ink-muted",
          )}
        >
          {ours.score}
          {" - "}
          {other.score}
        </span>
        {/*
          ★**連合チームはリンクにしない**（どの学校の戦績か決められない）。
          ★★**`title` は付ける** —— 3列にすると**連合チームの校名だけは入りきらない**
          （実測：243件のうち切れるのは連合チーム2件だけ。
          `下仁田・藤岡工・吉井大間々` は195px要るのに136pxしかない）。
          **校名を切ってはいけない**という決めごとに対する、ここだけの逃げ道。
        */}
        <span className="min-w-0 truncate text-[0.9375rem] text-ink" title={other.name}>
          {other.slug && !other.combined ? (
            // ★`relative` で、行いっぱいの見えないリンクより手前に出す
            <Link
              href={`/schools/${other.slug}`}
              className="relative font-bold text-navy-800 hover:underline"
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
