import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { SITE } from "@/lib/constants";
import { HERO_SLIDES } from "@/lib/hero";
import { HeroSlideshow } from "@/components/layout/HeroSlideshow";

/**
 * トップのヒーロー。
 *
 * 背景は球場の写真を一定時間で切り替える（HeroSlideshow）。
 * **写真が1枚も無くても成立するようにしてある。** 写真を外したときは
 * ネイビーのグラデーションと球場をモチーフにした図形だけで表示する。
 *
 * ロゴはキャッチコピーまで入った一式ではなく、マークまでの版を置いている。
 * 一式を縮めるとキャッチコピーの字が小さくなりすぎて読めないため、
 * キャッチコピーは見出しのテキストとして大きく出す。
 * ロゴ画像は alt="" にして、読み上げが見出しと二重にならないようにする。
 */
export function Hero() {
  const hasPhotos = HERO_SLIDES.length > 0;

  return (
    <section className="relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-navy-800 via-navy-700 to-navy-600 px-5 py-10 sm:px-8 sm:py-14">
      {hasPhotos ? <HeroSlideshow slides={HERO_SLIDES} /> : <StadiumBackdrop />}

      <div className="relative max-w-lg">
        <Image
          src="/logo-mark-white.png"
          alt=""
          width={480}
          height={162}
          priority
          sizes="(min-width: 640px) 20rem, 15rem"
          className="h-auto w-full max-w-[15rem] sm:max-w-xs"
        />

        <h1 className="hero-text mt-6 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-[2.5rem]">
          公立高校野球が、
          <br />
          <span className="text-accent-500">もっと面白くなる。</span>
        </h1>

        {/*
          ★**「ニュース」は 2026-08-24 に外した**（運営者の判断。運用予定が無い）。
          ナビからは 2026-08-21 に外れており、ここが最後の入口だった。
          **`/news` のコードとルートは残してある**ので、始めるときは
          この一文に「ニュース、」を戻し、下のボタンの行き先を `/news` にする。
        */}
        <p className="hero-text mt-5 text-[0.9375rem] leading-relaxed text-navy-100 sm:text-base">
          全国の公立高校野球を応援する人のためのサイト。
          <br className="hidden sm:block" />
          学校情報、戦績、歴史、そして公立旋風まで。
          <br className="hidden sm:block" />
          公立高校野球の&ldquo;今&rdquo;を、ここに。
        </p>

        {/*
          ★**ヒーローのボタンは「公立高校を探す」**（元は「最新ニュースを見る」）。
          ヒーローから行き先が無くなると入口として成立しないので、
          **消すのではなく、いま中身のあるページへ向け直してある。**
        */}
        <Link
          href="/schools"
          className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-lg bg-white px-6 text-base font-bold text-navy-800 shadow-sm hover:bg-navy-50"
        >
          <Search size={20} aria-hidden="true" />
          公立高校を探す
        </Link>

        <p className="sr-only">{SITE.fullName}</p>
      </div>
    </section>
  );
}

/** 球場のスタンドと内野を抽象化した背景。装飾なので読み上げ対象外。 */
function StadiumBackdrop() {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMaxYMax slice"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 text-white"
        fill="none"
      >
        {/* 内野のダイヤモンド */}
        <path
          d="M300 120l70 70-70 70-70-70z"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        {/* 外野のライン */}
        <path
          d="M230 190a99 99 0 01140 0"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
        <path
          d="M195 190a134 134 0 01210 0"
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeWidth="2"
        />
        {/* 照明塔 */}
        <g stroke="currentColor" strokeOpacity="0.13" strokeWidth="2">
          <path d="M340 40v40M300 55v25" />
          <rect x="322" y="24" width="36" height="16" rx="2" />
          <rect x="286" y="41" width="28" height="13" rx="2" />
        </g>
      </svg>
      {/* 光の差し込み */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl"
      />
    </>
  );
}
