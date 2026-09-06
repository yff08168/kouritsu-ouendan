import {
  formatRegionalDate,
  publicTeams,
  type RegionalPickup,
  type RegionalPickups,
} from "@/lib/regional-results";

/**
 * 電光掲示板（球場のリボンボード）。
 *
 * ------------------------------------------------------------------
 * ★★**遊び心の飾り**（2026-08-31。運営者の提案）。
 * トップのヒーローと結果カードのあいだに、細い横帯として敷く。
 *
 * ------------------------------------------------------------------
 * ★★★**JavaScriptを1行も使っていない。**
 *
 * 流すのは CSS のアニメーションだけ（`globals.css` の `.ticker`）。
 * ★**サーバーコンポーネントのまま**なので、
 * **バンドルも増えず、`scroll` や `IntersectionObserver` が効かない環境でも壊れない**
 * （`ResultsCarousel` で実際に踏んだ罠）。
 *
 * ------------------------------------------------------------------
 * ★★**止めるボタンは付けない**（運営者の判断:
 * 「常に情報が流れるイメージなので停止させる必要なし」）。
 *
 * ★**そのかわり文字をリンクにしていない。** 動いているものは押せないので、
 * **リンクは下の結果カードに任せて、ここは眺めるものに徹する。**
 * ★**押せない飾りにリンクの見た目を与えないこと**（押せると思わせない）。
 *
 * ★**「動きを減らす」設定のときだけ流さない**（`globals.css`）。
 * これは止めるボタンとは別で、**めまいを起こす人が自分で設定しているもの。**
 * ヒーローの写真も同じ規則で切り替えを止めており、サイト全体でそろえてある。
 *
 * ------------------------------------------------------------------
 * ★★**読み上げからは外す**（`aria-hidden`）。
 *
 * **同じ試合が、すぐ下の結果カードにリンク付きで並んでいる。**
 * 読み上げに2度出すと、**動いているほうを先に読まされて邪魔になる。**
 * ★**見えるものは残し、聞こえるものは1つにする。**
 */

/**
 * 1秒あたり何ピクセル流すか。
 * ★**遅いと止まって見え、速いと読めない。**
 * ★★**本番で見て決めた値**（2026-08-31）—— 90 では速すぎるという運営者の指摘で 65 に下げた。
 * ★**秒数のほうを決め打ちにしないこと**（試合数が増えたときだけ速くなる）。
 */
const PIXELS_PER_SECOND = 65;
/**
 * 1試合ぶんのおおよその幅（px）。1周の秒数の見積もりに使う。
 * ★**実測値**（画面で測って300px）。校名の長さで多少ぶれるが、
 * **ぶれても「流れる速さが少し変わる」だけ**で、継ぎ目には影響しない
 * （継ぎ目は CSS の `translateX(-50%)` が決めており、幅の見積もりとは無関係）。
 */
const APPROX_ITEM_WIDTH = 300;

/**
 * ★★★**帯に流す試合数の上限**（2026-09-06）。
 *
 * 抜粋が「いちばん新しい日の**全試合**」になったので、
 * **夏の予選の山では1日342試合**（実測。2019-07-15）まで増えうる。
 * ★★**この帯は同じ並びを2回描く**ので、**342試合なら幅がおよそ20万ピクセル**になる。
 *
 * ★**帯は `will-change: transform` で合成レイヤーに載せてある**
 * （`globals.css`。載せないと毎秒65pxの動きが整数に丸められてカクつく）。
 * **レイヤーは幅×高さぶんのメモリを食う**ので、20万pxでは30MBを超える。
 * ★**そこまで行くとレイヤーに載せてもらえず、直そうとしたカクつきが戻る。**
 *
 * ★**30試合なら幅およそ1万8千px（3MBほど）** —— 実測 1試合294px。
 * ★★**下のカードには全試合が出ている。** ここは眺めるための飾りなので、
 * **全部を流す必要がない**（読ませたいものは下にリンク付きで並んでいる）。
 */
const MAX_TICKER_GAMES = 30;

export function ResultsTicker({ pickups }: { pickups: RegionalPickups }) {
  /*
    ★**間引くときは等間隔で拾う。** 先頭から30件だと**同じ1〜2県で埋まる**
    （抜粋は県ごとにまとまって並んでいる）。
    ★**乱数を使わない** —— 描くたびに並びが変わると、
    ページを開き直すたびに帯の中身が入れ替わって落ち着かない。
  */
  const games = sampleEvenly(pickups.games, MAX_TICKER_GAMES);
  // ★**流すものが無ければ帯ごと出さない**（空の黒帯が残るのを防ぐ）
  if (games.length === 0) return null;

  /*
    ★★**同じ並びを2回描く。**
    半分ぶん（＝1周ぶん）動かしたところで元と同じ絵になるので、
    そこで先頭に戻せば**継ぎ目が見えない。**
  */
  const loop = [...games, ...games];

  /*
    ★**速さを一定にする。** 秒数を決め打ちにすると、
    試合数が増えたときだけ速くなる（同じ時間で長い列を流すため）。
    ★**長さに比例させれば、件数が変わっても流れる速さは変わらない。**
  */
  const seconds = Math.round(
    (games.length * APPROX_ITEM_WIDTH) / PIXELS_PER_SECOND,
  );

  return (
    <div
      className="ticker py-2.5"
      aria-hidden="true"
      // ★1周の秒数はCSS変数で渡す（`.ticker__track` が使う）
      style={{ "--ticker-duration": `${seconds}s` } as React.CSSProperties}
    >
      <div className="ticker__track">
        {loop.map((game, i) => (
          <TickerItem key={i} game={game} />
        ))}
      </div>
    </div>
  );
}

/** 等間隔に `max` 件まで拾う。★**元の並びは崩さない** */
function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

function TickerItem({ game }: { game: RegionalPickup }) {
  /*
    ★**公立を先に出す。両方が公立なら勝ったほうを先。**
    結果カード（`RegionalResultsCard`）と同じ並べ方にそろえてある。
    ★**連合チームは公立扱いにしない**（どの学校の記録か決められない）。
  */
  const ours = publicTeams(game).find((t) => t.won) ?? publicTeams(game)[0];
  const other = game.teams.find((t) => t !== ours);
  if (!ours || !other) return null;

  /*
    ★★**◆は試合と試合の「あいだ」に立たせる**（2026-09-06。運営者から
    「ダイヤマークが中途半端な位置にある」）。

    ★**実測すると左20ポイント・右40ポイント**で、**左の試合にくっついていた。**
    内訳は次のとおり:

        左 … `gap-2.5`(10) ＋ ◆の `pl-2.5`(10)          = 20
        右 … この試合の右余白(20) ＋ 次の試合の左余白(20) = 40

    ★**◆は各試合の末尾に置いてある**（そうしないと**2周ぶんを並べて
    `translateX(-50%)` で戻す継ぎ目**が合わない）ので、
    **左右の余白は別々の場所から来る。** 片方だけ足しても揃わない。

    ★**左右とも30になるように振り直した**（`px` 20→15、◆の `pl` 10→20）。
    ★★**試合と試合の間隔（74ポイント）は変えていない** ——
    間隔を変えると1周の長さが変わり、**流れる速さの見積もり
    （`APPROX_ITEM_WIDTH`）とずれる。**
  */
  return (
    <span className="ticker__item inline-flex items-center gap-2.5 px-[0.9375rem] text-sm">
      <span className="ticker__meta text-xs">
        {game.district}
        {game.date && ` ${formatRegionalDate(game.date)}`}
      </span>
      <span className="font-bold">{ours.display}</span>
      <span className="ticker__score font-bold">
        {ours.score} - {other.score}
      </span>
      <span>{other.display}</span>
      <span className="ticker__divider pl-5">◆</span>
    </span>
  );
}
