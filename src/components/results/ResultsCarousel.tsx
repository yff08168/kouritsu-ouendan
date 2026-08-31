"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { readAutoplay, subscribeAutoplay, writeAutoplay } from "@/lib/preferences";

/**
 * 結果カードの横スライド。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ作ったか**（2026-08-31。運営者の提案）
 *
 * トップの「地方大会の結果」は**4試合を固定で出していた**が、
 * 抜粋の生成物（`regional-pickup.ts`）には**20試合（6県）**入っている。
 * ★**16試合は、データとしてあるのに一度も画面に出ていなかった。**
 * 横にめくれるようにすれば、**データを増やさずに見せる量が5倍**になる。
 *
 * ------------------------------------------------------------------
 * ★★★**スライドは全部サーバーで描いてDOMに置く。**
 *
 * 「いま見えている1枚だけ描く」作りにすると、**検索エンジンには1枚ぶんしか
 * 見えない。** せっかく見せる量を増やしても、**インデックスされる中身は
 * むしろ減る**（このサイトはSEOでストック側を取りに行っている）。
 * ★**めくるのは CSS のスクロール**（`snap`）で、JavaScript は
 * **位置合わせと自動送りだけ**を担う。**JSが動かなくても横スクロールで読める。**
 *
 * ------------------------------------------------------------------
 * ★★**自動で動くものには必ず止める手段を付ける**（WCAG 2.2.2）。
 *
 * ヒーローの写真は**装飾**なので `prefers-reduced-motion` だけで足りていたが、
 * ★**こちらは試合結果＝情報**で、読んでいる最中に動くと実害がある。
 * そこで次の4つを入れてある:
 *
 *   ①**目に見える「自動でめくる」の切り替え**（設定はこの端末に残る）
 *   ②**指・マウス・キーボードが触れているあいだは止める**
 *   ③**タブが裏にいるあいだは止める**（戻ったとき何枚も飛んでいるのを防ぐ）
 *   ④**手でめくったら、そこから数え直す**（読み始めた直後に送られない）
 *
 * ★★**`prefers-reduced-motion` では既定で止める。**
 * ただし**その人が自分で「めくる」を選んだなら、その選択を尊重する**
 * （`readAutoplay()` が `null`＝未設定 と `false` を区別しているのはこのため）。
 */

/** 自動で送る間隔。★ヒーロー（7秒）より長い —— 読む内容なので */
const INTERVAL_MS = 9000;

type Props = {
  /** 1枚ぶんの中身。**サーバーで描いたものを受け取る** */
  slides: React.ReactNode[];
  /** 読み上げ用の名前（例:「地方大会の結果」） */
  label: string;
  className?: string;
};

export function ResultsCarousel({ slides, label, className }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /** 指・マウス・キーボードが触れている、またはタブが裏にいる */
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);

  // ★localStorage は React の外の状態。サーバー描画では必ず null（＝未設定）
  const saved = useSyncExternalStore(
    subscribeAutoplay,
    readAutoplay,
    () => null as boolean | null,
  );
  /*
    ★**既定は「めくる」。** ただし「動きを減らす」設定の人には既定で止める。
    ★**保存された選択があれば、それが最優先**（OSの設定より本人の選択）。
  */
  const autoplay = saved ?? !reduced;

  // ---- 「動きを減らす」設定を購読する（ヒーローと同じ作法） ----
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // ---- タブが裏にいるあいだは止める ----
  useEffect(() => {
    const apply = () => setHeld(document.visibilityState === "hidden");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  /**
   * その枚数へスクロールする。★位置はCSSのsnapが決める。JSは合わせるだけ。
   *
   * ------------------------------------------------------------------
   * ★★★**`scrollTo({behavior:"smooth"})` を使わないこと**（2026-08-31 に実測）。
   *
   * **環境によっては何も起きない。** 実際、検証に使ったブラウザでは
   * `behavior:"auto"` は動くのに **`"smooth"` だけが無反応**だった
   * （アニメーションを切っている環境では起こりうる）。
   * ★**そのとき自動送りは「タイマーは動いているのに1枚も進まない」**という、
   * **エラーも警告も出ない壊れ方**をする。
   *
   * ★**CSS の `scroll-behavior: smooth` に逃がすのも駄目だった** ——
   * **同じ環境では `scrollLeft` への代入まで無反応になる**（実測）。
   *
   * ★★**そこで「頼んだあと、動いたかを確かめる」。**
   * なめらかに頼んで、**少し待っても1ピクセルも動いていなければ瞬間移動させる。**
   * 効く環境ではなめらかに、効かない環境でも**必ず動く。**
   */
  const goTo = useCallback(
    (next: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = ((next % slides.length) + slides.length) % slides.length;
      const left = clamped * track.clientWidth;
      const from = track.scrollLeft;
      /*
        ★★**こちらが動かしたぶんは、その場で state も進める。**
        下のスクロール監視に任せると、**`scroll` が発火しない環境で
        「点が1枚目のまま」「自動送りが2枚目から先へ行かない」**になる
        （実測でそうなった。`scroll` も `IntersectionObserver` も来ない環境がある）。
        ★**手で払ってめくったぶんは、下の監視が拾って直す。**
      */
      setIndex(clamped);
      track.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });

      /*
        ★**250ミリ秒。** 効いている環境ならこの時点で必ず動き始めている
        （なめらかな移動は数百ミリ秒かかるので、途中でも `from` からは離れる）。
        ★**「目的地に着いたか」ではなく「動き出したか」で見る。**
      */
      window.setTimeout(() => {
        const now = trackRef.current;
        if (!now) return;
        const stuck = Math.abs(now.scrollLeft - from) < 1;
        const notThere = Math.abs(now.scrollLeft - left) >= 1;
        if (stuck && notThere) now.scrollTo({ left, behavior: "auto" });
      }, 250);
    },
    [slides.length, reduced],
  );

  // ---- 手で払ってめくられたぶんを拾う ----
  /*
    ★**ボタン・点・自動送りのぶんは `goTo` が state を進めている。**
    ここが受け持つのは**指でスワイプされたとき**だけ。
    放っておくと state と実際の位置がずれ、**次の自動送りで1枚飛ぶ。**

    ------------------------------------------------------------------
    ★★★**`IntersectionObserver` を使わないこと**（2026-08-31 に実測）。

    最初はそれで書いたが、**検証に使ったブラウザでは1度も発火しなかった**
    （観測を始めた直後の1回すら来ない）。**エラーも警告も出ない。**
    ★**`scroll` イベントも来ない環境だった**（`scrollLeft` は変わるのに0件）。
    ★★**だから「位置の監視」だけに頼る作りにしない。**
    ここはあくまで**補正**で、主導権は `goTo` にある。

    ★**位置から枚を出すのは割り算でよい。**
    スクロールは `snap` で1枚ずつ吸い付くので、**四捨五入で枚が決まる。**
  */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const read = () => {
      const width = track.clientWidth;
      if (width === 0) return;
      const at = Math.round(track.scrollLeft / width);
      setIndex(Math.min(Math.max(at, 0), slides.length - 1));
    };

    read();
    // ★**受け身で聞く**（スクロールを妨げない）
    track.addEventListener("scroll", read, { passive: true });
    // ★**画面幅が変わると1枚の幅も変わる。** 位置を読み直す
    window.addEventListener("resize", read);
    return () => {
      track.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [slides.length]);

  // ---- 自動で送る ----
  /*
    ★**`index` を依存に入れてある。** 手でめくると index が変わり、
    **タイマーが張り直される**＝そこから数え直す。
    読み始めた直後に送られない、という②③④のうちの④がこれ。
  */
  useEffect(() => {
    if (!autoplay || held || slides.length <= 1) return;
    const timer = setTimeout(() => goTo(index + 1), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [autoplay, held, index, slides.length, goTo]);

  if (slides.length === 0) return null;
  // ★1枚しかないなら、めくる仕掛けを出さない（点も矢印も意味が無い）
  if (slides.length === 1) return <div className={className}>{slides[0]}</div>;

  return (
    <div
      className={className}
      role="group"
      aria-roledescription="カルーセル"
      aria-label={label}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
    >
      <div
        ref={trackRef}
        /*
          ★**横スクロールそのものは CSS。** JSが止まっても指で読める。
          ★**スクロールバーは隠す**（1枚ずつ吸い付くので、位置は下の点が示す）。
          ★**`overscroll-x-contain`** —— 端まで来たときにページごと横に
          動いてしまうのを止める。
        */
        /*
          ★★**`scroll-behavior` をCSSで指定しないこと**（`goTo` の説明を読むこと）。
          **指定すると、なめらかな移動が効かない環境で
          `scrollTo({behavior:"auto"})` の逃げ道まで塞がれる。**
        */
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        /*
          ★**読み上げの更新通知は、自動で動いているあいだは出さない**
          （勝手に動くものを読み上げ続けると邪魔になる。APGの指針）。
          手で送っているときだけ知らせる。
        */
        aria-live={autoplay && !held ? "off" : "polite"}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            data-index={i}
            className="w-full shrink-0 snap-start"
            role="group"
            aria-roledescription="スライド"
            aria-label={`${i + 1} / ${slides.length}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* ------- 操作 ------- */}
      <div className="mt-3 flex items-center gap-2">
        <Arrow
          direction="prev"
          onClick={() => goTo(index - 1)}
          label="前の結果"
        />
        <Arrow
          direction="next"
          onClick={() => goTo(index + 1)}
          label="次の結果"
        />

        {/* 何枚目か。★点も押せるようにする（見えているのに押せないのは分かりにくい） */}
        <ul className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1}枚目を見る`}
                aria-current={i === index ? "true" : undefined}
                // ★**押せる範囲は44px確保する**（見た目の点は小さいまま）
                className="flex size-11 items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-1.5 rounded-full transition-all",
                    i === index
                      ? "w-5 bg-accent-500"
                      : "w-1.5 bg-line hover:bg-navy-300",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>

        {/*
          ★★**自動で動くものを止める手段**（WCAG 2.2.2）。
          ★**アイコンだけにしない** —— 何が起きるのかを文字で書く。
        */}
        <button
          type="button"
          onClick={() => writeAutoplay(!autoplay)}
          aria-pressed={autoplay}
          /*
            ★**狭い画面では文字が隠れてアイコンだけになる。**
            そのとき幅が30pxまで縮むので、**`min-w-11` で押せる幅を確保する**
            （高さは `min-h-11` で確保済み）。
          */
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-ink-muted hover:bg-navy-50 hover:text-navy-800"
        >
          {autoplay ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {autoplay ? "自動でめくる：オン" : "自動でめくる：オフ"}
          </span>
          <span className="sr-only sm:hidden">
            {autoplay ? "自動でめくるのを止める" : "自動でめくる"}
          </span>
        </button>
      </div>
    </div>
  );
}

function Arrow({
  direction,
  onClick,
  label,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  label: string;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      /*
        ★**狭い画面では出さない。** 指で払えばめくれるうえ、
        矢印2つ（88px）と点5つ（220px）と切り替えを1行に並べると、
        375pxの画面では点が2段に折り返して操作列だけが太る。
      */
      className="hidden size-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-navy-50 hover:text-navy-800 sm:flex"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
