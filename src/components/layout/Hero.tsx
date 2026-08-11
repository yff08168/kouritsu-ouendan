import Link from "next/link";
import { Newspaper } from "lucide-react";
import { SITE } from "@/lib/constants";

/**
 * トップのヒーロー。
 * 背景写真ありきにせず、ネイビーのグラデーションと球場をモチーフにした
 * 図形だけで成立させている。写真を入れる場合はこの背景の上に重ねる。
 */
export function Hero() {
  return (
    <section className="relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-navy-800 via-navy-700 to-navy-600 px-5 py-10 sm:px-8 sm:py-14">
      <StadiumBackdrop />

      <div className="relative max-w-lg">
        <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-[2.5rem]">
          公立高校野球が、
          <br />
          <span className="text-accent-500">もっと面白くなる。</span>
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-navy-100 sm:text-[0.9375rem]">
          全国の公立高校野球を応援する人のためのサイト。
          <br className="hidden sm:block" />
          ニュース、学校情報、戦績、歴史、そして公立旋風まで。
          <br className="hidden sm:block" />
          公立高校野球の&ldquo;今&rdquo;を、ここに。
        </p>

        <Link
          href="/news"
          className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-lg bg-white px-6 text-sm font-bold text-navy-800 shadow-sm hover:bg-navy-50"
        >
          <Newspaper size={18} aria-hidden="true" />
          最新ニュースを見る
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
