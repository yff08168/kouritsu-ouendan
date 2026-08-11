import Link from "next/link";
import { SITE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  /** ネイビー背景（フッター等）で使う場合は "onDark" */
  tone?: "onLight" | "onDark";
  /** タグラインを出すか。ヘッダーのPC表示とフッターで true */
  withTagline?: boolean;
  className?: string;
};

/**
 * ブランドロゴ。
 * 現在は画像を使わずSVG＋テキストで組んでいる。
 * 正式なロゴ画像が用意できたら、このコンポーネントの中身だけを
 * next/image に差し替えれば全ページに反映される（要件4）。
 */
export function Logo({
  tone = "onLight",
  withTagline = false,
  className,
}: Props) {
  const onDark = tone === "onDark";

  return (
    <Link
      href="/"
      aria-label={`${SITE.name} トップページ`}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <BaseballMark
        className={cn("shrink-0", onDark ? "text-white" : "text-navy-800")}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-xl font-bold tracking-tight sm:text-[1.375rem]",
            onDark ? "text-white" : "text-navy-800",
          )}
        >
          {SITE.name}
        </span>
        {withTagline && (
          <span
            className={cn(
              "mt-1 text-[0.625rem] tracking-tight sm:text-[0.6875rem]",
              onDark ? "text-navy-100" : "text-ink-muted",
            )}
          >
            {SITE.catchphrase}
          </span>
        )}
      </span>
    </Link>
  );
}

/** 野球ボール＋旗のマーク。装飾なので aria-hidden。 */
function BaseballMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width="34"
      height="34"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <circle
        cx="16"
        cy="24"
        r="11"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      {/* ボールの縫い目 */}
      <path
        d="M8.5 16.5c3.2 2.4 4.6 6.2 4.3 10.4M23.5 16.5c-3.2 2.4-4.6 6.2-4.3 10.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* 旗竿 */}
      <path
        d="M27 33V5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* 旗（アクセントカラー） */}
      <path
        d="M27 6.5h9.5c.6 0 .9.7.5 1.1L34 10.5l3 2.9c.4.4.1 1.1-.5 1.1H27z"
        fill="var(--color-accent-500)"
      />
    </svg>
  );
}
