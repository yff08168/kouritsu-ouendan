"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { HERO_FADE_MS, HERO_SLIDE_INTERVAL_MS, type HeroSlide } from "@/lib/hero";

type Props = {
  slides: HeroSlide[];
};

/**
 * ヒーローの背景写真を一定時間で切り替える。
 *
 * ------------------------------------------------------------------
 * 写真の上に必ず**無彩色の黒**の膜を重ねている（`.hero-veil`。globals.css）。
 *
 *   写真は明るさがばらばら（青空の球場もあれば夕暮れもある）。素のまま
 *   文字を載せるとコントラストが写真次第になり、読めない組み合わせが出る。
 *   かといって一様に濃くすると写真が何も見えない。**PCでは見出しのある
 *   左側だけを濃くして、右側は薄くして写真を見せる。** 濃さの根拠は
 *   globals.css の `.hero-veil` に書いてある。
 *
 *   **色はネイビーではなく黒。**（2026-08-13 に変更）ネイビーだと写真全体が
 *   青くカブって見づらい、という指摘があった。青に戻さないこと。
 *
 * ------------------------------------------------------------------
 * 「動きを減らす」設定のときは切り替えない。
 *
 *   自動で動き続ける背景は、設定で止められる必要がある（WCAG 2.2.2）。
 *   ここでは prefers-reduced-motion に従って**回転そのものを止める**。
 *   止めても1枚目が出るので、情報が失われることはない。
 *   設定を途中で変えた場合にも追従するよう、change を購読している。
 *
 * ------------------------------------------------------------------
 * 写真は装飾なので alt="" にして読み上げから外す。ヒーローの意味は
 * 見出しのテキストが持っている。ただし**クレジットは読み上げ対象に残す**
 * （帰属表示は装飾ではなくライセンス上の義務）。
 */
export function HeroSlideshow({ slides }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;

    const apply = () => {
      clearInterval(timer);
      if (query.matches) {
        setIndex(0);
        return;
      }
      timer = setInterval(
        () => setIndex((current) => (current + 1) % slides.length),
        HERO_SLIDE_INTERVAL_MS,
      );
    };

    apply();
    query.addEventListener("change", apply);

    return () => {
      clearInterval(timer);
      query.removeEventListener("change", apply);
    };
  }, [slides.length]);

  const current = slides[index];

  return (
    <>
      <div aria-hidden="true" className="absolute inset-0">
        {slides.map((slide, i) => (
          <Image
            key={slide.url}
            src={slide.url}
            alt=""
            fill
            // 1枚目だけ優先で読む。残りは後から読み込まれても切り替えに間に合う
            priority={i === 0}
            sizes="(min-width: 1024px) 60vw, 100vw"
            className={cn(
              "object-cover transition-opacity ease-in-out",
              // 被写体が左に寄っている写真は反転させて、見出しと重ならないようにする
              slide.flipHorizontal && "-scale-x-100",
            )}
            style={{
              opacity: i === index ? 1 : 0,
              transitionDuration: `${HERO_FADE_MS}ms`,
            }}
          />
        ))}

        <div className="hero-veil" />
      </div>

      {current.credit && (
        <p className="absolute bottom-1.5 right-3 z-10 text-right text-[0.625rem] leading-tight text-navy-100/70">
          {current.sourceUrl ? (
            <a
              href={current.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              {current.credit}
            </a>
          ) : (
            current.credit
          )}
        </p>
      )}

      {/* 何枚目かを示す点。切り替わったことが分かるようにする（装飾） */}
      {slides.length > 1 && (
        <div
          aria-hidden="true"
          className="absolute bottom-4 left-5 z-10 flex gap-1.5 sm:left-8"
        >
          {slides.map((slide, i) => (
            <span
              key={slide.url}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === index ? "w-5 bg-accent-500" : "w-1.5 bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
