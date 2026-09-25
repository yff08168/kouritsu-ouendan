import Link from "next/link";
import { MapPinned } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { ResultsViewSwitch } from "@/components/results/ResultsViewSwitch";
import { cn } from "@/lib/utils";
import {
  gameKey,
  groupGamesForDistrict,
  seasonLabel,
  type RegionalDistrict,
  type RegionalGame,
} from "@/lib/regional-results";
import { tournamentDisplayName } from "@/lib/regional-tournaments";

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
 *
 * ------------------------------------------------------------------
 * ★★ 「公立が出た試合」と「全試合」を切り替えられる（2026-09-25。運営者の提案）
 *
 *   `games` には**その大会の全試合**（私立どうしを含む）が来る。
 *   **最初は公立が出た試合だけを見せ**、ボタンで全試合に切り替える（`ResultsViewSwitch`）。
 *   ★**件数で切らない**（運営者の「24件で切る必要はない」）。
 *   ★**私立どうしの試合が1つも無い大会ではボタンを出さない**（切り替えても何も変わらない）。
 */
/**
 * 「公立が出た試合」を選んでいるあいだ隠す行・見出しに付けるクラス。
 * ★**Tailwind が拾えるよう文字列のまま1か所に置く**（組み立てない）。
 * ★**`ResultsViewSwitch` の `group/view` と `data-view` が対になっている。**
 * ★**クライアント部品のファイルから書き出さないこと** —— サーバー側で読むと
 * 文字列ではなくクライアント部品への参照が返る。
 */
const HIDDEN_WHEN_PUBLIC = "group-data-[view=public]/view:hidden";

/** 公立が絡む試合か。`latestSeasonGames` の絞り込みと同じ決め方 */
function isPublicGame(game: RegionalGame): boolean {
  return game.teams.some((t) => t.slug && !t.combined);
}

export function RegionalDistrictCard({
  district,
  season,
  games,
  tournaments,
}: {
  district: RegionalDistrict;
  season: Parameters<typeof seasonLabel>[0];
  /** その大会の全試合（私立どうしを含む）。新しい順 */
  games: RegionalGame[];
  tournaments: string[];
}) {
  const groups = groupGamesForDistrict(games);
  const publicCount = games.filter(isPublicGame).length;
  const hasPrivateOnly = publicCount < games.length;
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
      {/*
        ★**見出しに「結果」を入れる**（2026-09-06）。
        `神奈川の秋季大会` だけだと**このカードに何が並んでいるか書いていない。**
        県のページで**h1 の次に来る見出し**なので、
        **「◯◯ 高校野球 結果」で来た人が着地を確かめる場所**でもある。
        ★**中身は試合の結果そのもの**なので、書いてあることと画面が食い違わない。
      */}
      <SectionHeading
        id="pref-regional"
        title={`${district.district}の${seasonLabel(season)} 結果`}
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
            {/* ★**出典のページ見出しを落として出す**（`tournamentDisplayName`） */}
            {tournaments.slice(0, 2).map(tournamentDisplayName).join("・")}
            {tournaments.length > 2 && "ほか"}から、
          </>
        )}
        {hasPrivateOnly ? "試合" : "公立高校が出た試合"}を{dated ? "新しい順" : "回戦の深い順"}に出しています
        {hasPrivateOnly && "。最初は公立高校が出た試合だけです"}
      </p>

      {hasPrivateOnly ? (
        <ResultsViewSwitch publicCount={publicCount} allCount={games.length}>
          <GameGroups groups={groups} districtSlug={district.slug} />
        </ResultsViewSwitch>
      ) : (
        <GameGroups groups={groups} districtSlug={district.slug} />
      )}

      {/*
        ~~取れている試合の総数を必ず出す（「N件あり、うち新しいM件」）~~ →
        ★**2026-09-25 に件数の上限を外したので、出している試合がその大会の全部。**
        **件数は切り替えボタンに出している**（ボタンが無い大会は公立が出た試合＝全試合）。
      */}

      {/*
        ★**出典の行は 2026-08-21 に運営者の判断で画面から外した**
        （トップの `RegionalResultsCard` と揃えてある）。
        **`district.sourceName` / `sourceUrl` は残してある**ので、戻すのはここだけ。
      */}
    </section>
  );
}

/** 日付（無ければ回戦）ごとの見出しと、その下の試合の格子 */
function GameGroups({
  groups,
  districtSlug,
}: {
  groups: ReturnType<typeof groupGamesForDistrict>;
  districtSlug: string;
}) {
  return (
      <div className="mt-4 space-y-4">
        {groups.map(({ key, label, games: groupGames }) => (
          /*
            ★**私立どうしの試合しか無い日は、見出しごと隠す**
            （公立のみの表示で「日付だけあって中身が空」の見出しを出さない）。
          */
          <div
            key={key}
            className={cn(!groupGames.some(isPublicGame) && HIDDEN_WHEN_PUBLIC)}
          >
            <h3 className="text-xs font-bold text-ink-faint">{label}</h3>
            {/*
              ★★**2列にする**（2026-09-08。運営者の指示「結果欄についても2列表示にして」）。
              **速報の盤と同じ作り** —— `grid` に流し込むので、
              **読む順は「行ごとに左→右」**のまま（列で切ると新しい順に読めなくなる）。
              ★**区切りは行ごとの下線だけ**（縦線は入れない）。
              ★**狭い画面では1列**（半分の幅に校名2つとスコアは入らない）。
              ★★**広げるのは `lg` から** —— `sm`（640px）で割ると
              **半分が約280pxしかなく、校名が切れる**（AGENTS の「校名を切ってはいけない」）。
            */}
            <ul className="mt-1 grid border-t border-line lg:grid-cols-2 lg:gap-x-6">
              {groupGames.map((game, i) => (
                <li
                  key={`${key}-${i}`}
                  className={cn("border-b border-line", !isPublicGame(game) && HIDDEN_WHEN_PUBLIC)}
                >
                  <GameRow game={game} districtSlug={districtSlug} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
  );
}

function GameRow({ game, districtSlug }: { game: RegionalGame; districtSlug: string }) {
  /*
    公立校を先に出す。**両方が公立なら勝ったほうを先にする**
    （行の先頭の ○ / ● はこの学校の勝敗なので、公立が勝った試合で
    ● が並ぶのを避ける）。トップのカードと同じ決め方。
  */
  const ourCandidates = game.teams.filter((t) => t.slug && !t.combined);
  const ours = ourCandidates.find((t) => t.won) ?? ourCandidates[0];
  const other = game.teams.find((t) => t !== ours);
  // ★公立が絡まない試合（「全試合」のときだけ見える）は別の行で描く
  if (!ours) return <PrivateGameRow game={game} districtSlug={districtSlug} />;
  if (!other) return null;

  /*
    ★**引き分けを「負け」と書かない**（2026-08-15）。
    高校野球には**引き分け再試合**がある（岐阜の 市岐阜商 0-0 県岐阜商 が
    翌日 0-10 で再試合になった）。`won` は両方 false になるので、
    「勝っていない＝負け」と読むと**画面に事実と違うことが出る。**
    スコアで引き分けを判定する（`won` の否定では区別が付かない）。
  */
  const drawn = ours.score === other.score;

  return (
    /*
      ★★**行いっぱいに見えないリンクを1枚敷く**（2026-09-06。他の一覧と同じ作り）。
      **リンクの中にリンクは置けない**ので、校名側は `relative` で手前に出す。
    */
    <div className="group relative flex items-center gap-3 py-3 sm:gap-4">
      <Link
        href={`/prefectures/${districtSlug}/game/${gameKey(game)}`}
        className="absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-accent-500 group-hover:bg-navy-50/60"
      >
        <span className="sr-only">
          {ours.display}と{other.display}の試合結果
        </span>
      </Link>
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
      {/*
        ★★★**スマホでは回戦を上の行へ逃がす**（2026-09-08。運営者の指示）。

        **横に並べると校名に63pxしか残らず、`川崎総合科学` `茅ケ崎北陵` `横須賀総合` など
        16件が切れていた**（実測 84>63）。
        ★**トップの結果カードで踏んだのと同じ形**（AGENTS の
        「県・日付・回戦を上の行へ逃がして、校名とスコアに列幅を丸ごと渡す」）。
        ★**行が1行ぶん高くなるが、校名はこのサイトの主役**なのでそちらを採る。
        ★**`sm` から先は今までどおり横並び**（`sm:flex`）。
      */}
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        {/*
          ★**2列にしたぶん、回戦の列を詰める**（2026-09-08）。
          **1024px で `川崎総合科学` が8px足りずに切れていた**（実測 108>100）。
          **校名はこのサイトの主役**なので、幅は回戦・球場のほうから渡す。
        */}
        <p className="shrink-0 text-xs leading-tight text-ink-faint sm:w-20 lg:w-16">
          {game.round}
          {game.venue && <span className="hidden truncate sm:block">{game.venue}</span>}
        </p>

        {/* スコアの列は固定幅。「0 - 1」と「0 - 10」で校名の右端がずれないように */}
        <p className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-baseline gap-x-2 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3">
        <Link
          href={`/schools/${ours.slug}`}
          title={ours.name}
          className="relative min-w-0 truncate text-right text-sm font-bold text-navy-800 hover:underline sm:text-lg"
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
    </div>
  );
}

/**
 * 公立が絡まない試合の行。**「全試合」を選んだときだけ見える。**
 *
 * ★**公立の行と列の位置をそろえる**（○●の欄は空けて残す）。混ざって並ぶので、
 * ずれると表として読めない。
 * ★**着目するところは公立**なので、こちらは目立たせない。
 * 校名は灰色で、**勝った側だけ濃い字**。得点も灰色（公立が勝った行のオレンジは使わない）。
 * ★**並びは出典の順のまま**（勝った側を左に寄せるような並べ替えはしない）。
 * ★私立と連合チームには当サイトの学校ページが無いので、校名はリンクにしない。
 */
function PrivateGameRow({ game, districtSlug }: { game: RegionalGame; districtSlug: string }) {
  const [a, b] = game.teams;
  if (!a || !b) return null;
  const nameClass = (won: boolean) =>
    cn("min-w-0 truncate text-sm sm:text-lg", won ? "font-bold text-ink" : "text-ink-muted");

  return (
    <div className="group relative flex items-center gap-3 py-3 sm:gap-4">
      <Link
        href={`/prefectures/${districtSlug}/game/${gameKey(game)}`}
        className="absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-accent-500 group-hover:bg-navy-50/60"
      >
        <span className="sr-only">
          {a.display}と{b.display}の試合結果
        </span>
      </Link>
      <span aria-hidden="true" className="size-6 shrink-0" />

      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <p className="shrink-0 text-xs leading-tight text-ink-faint sm:w-20 lg:w-16">
          {game.round}
          {game.venue && <span className="hidden truncate sm:block">{game.venue}</span>}
        </p>
        <p className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-baseline gap-x-2 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:gap-x-3">
          <span title={a.name} className={cn(nameClass(a.won), "text-right")}>
            {a.display}
          </span>
          <span className="text-center text-base font-bold tabular-nums text-ink-muted sm:text-xl">
            {a.score}
            {" - "}
            {b.score}
          </span>
          <span title={b.name} className={nameClass(b.won)}>
            {b.display}
          </span>
        </p>
      </div>
    </div>
  );
}
