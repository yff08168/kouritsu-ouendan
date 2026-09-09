"use client";

import { useEffect, useRef } from "react";

/**
 * ★★**横に広い表に、上にもスクロールバーを出す**（2026-09-09。運営者の指示
 * 「上にもスクロールバーがほしい」）。
 *
 * ------------------------------------------------------------------
 * ★**なぜ要るか** —— トーナメント表は**縦にとても長い**（東東京の2回戦は56試合）。
 * 下端のスクロールバーは**画面の何倍も下**にあるので、
 * 表の頭を見ているあいだは**横に動かす手段が画面の中に無い。**
 *
 * ------------------------------------------------------------------
 * ★★**CSSの `rotateX(180deg)` で「バーだけ上に出す」細工は使わない。**
 * **回戦の見出しが `sticky top-0`** なので、**上下が反転すると見出しが下に貼り付く。**
 *
 * ★**代わりに、中身を持たない細い帯をもう1本置いて左右の位置を合わせる。**
 * ★★**片方が動いたらもう片方も動かす。往復で無限に呼び合わないよう、
 * 「いま合わせている最中か」の札を立てる。**
 *
 * ★★**`scroll` が発火しない環境がある**（カルーセルで踏んだ。AGENTS の「動かない壊れ方」）。
 * **そのときは上の帯が動かないだけで、下のスクロールバーは今までどおり効く。**
 */
export function BracketScroller({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = topRef.current;
    const body = bodyRef.current;
    const spacer = spacerRef.current;
    if (!top || !body || !spacer) return;

    /*
      ★**帯の中身は幅だけ**（中身を2度描かない）。
      本体の中身の幅に合わせておけば、バーの長さと動く量が本体と同じになる。
    */
    const sync = () => {
      spacer.style.width = `${body.scrollWidth}px`;
      /*
        ★**横に溢れていないときは帯ごと消す** —— 幅の足りる画面で
        **押せない飾りのバーを出さない**（AGENTS の決めごと）。
      */
      top.hidden = body.scrollWidth <= body.clientWidth + 1;
    };
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(body);

    /*
      ★★★**「いま合わせている最中」の札を立てて `requestAnimationFrame` で降ろす作りにしないこと**
      （2026-09-09。**実際にそれで動かなかった**）。
      **裏に回ったタブでは rAF が呼ばれない**ので、**札が立ったまま二度と降りず、
      それ以降のスクロールが片方に伝わらなくなる。**

      ★**代わりに「すでに同じ位置なら何もしない」だけにする** ——
      片方を動かすともう片方の `scroll` が鳴るが、そのときは値が揃っているので**そこで止まる。**
      **札もタイマーも要らない。**
    */
    const follow = (from: HTMLDivElement, to: HTMLDivElement) => () => {
      if (Math.abs(to.scrollLeft - from.scrollLeft) < 1) return;
      to.scrollLeft = from.scrollLeft;
    };
    const onTop = follow(top, body);
    const onBody = follow(body, top);
    top.addEventListener("scroll", onTop, { passive: true });
    body.addEventListener("scroll", onBody, { passive: true });

    return () => {
      observer.disconnect();
      top.removeEventListener("scroll", onTop);
      body.removeEventListener("scroll", onBody);
    };
  }, []);

  return (
    <>
      {/*
        ★**読み上げからは外す**（中身が無い帯なので読むものが無い）。
        ★**既定では隠しておく** —— JavaScript が動かない環境で
        **動かせない帯だけが残らないように**（上の `sync` が出す）。
      */}
      <div
        ref={topRef}
        aria-hidden="true"
        hidden
        className="overflow-x-auto overflow-y-hidden"
      >
        <div ref={spacerRef} className="h-px" />
      </div>
      <div ref={bodyRef} className="overflow-x-auto pb-2">
        {children}
      </div>
    </>
  );
}
