import Image from "next/image";
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
 *
 * 画像は assets/logo-source.png から scripts/build-logo-assets.mjs で書き出す。
 * ネイビー地では線が沈むので、ネイビーを白へ置き換えた版を使う。
 * ここで使うのはマーク＋ロゴタイプまでの切り抜き（logo-mark*.png）で、
 * キャッチコピーはテキストで添える。ヘッダーの高さに対して
 * キャッチコピーまで画像に入れると字が潰れて読めなくなるため。
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
      className={cn("inline-flex flex-col items-start", className)}
    >
      <Image
        src={onDark ? "/logo-mark-white.png" : "/logo-mark.png"}
        alt=""
        width={480}
        height={162}
        priority
        sizes="160px"
        className="h-9 w-auto sm:h-10"
      />
      {withTagline && (
        <span
          className={cn(
            "mt-1 text-[0.625rem] leading-none tracking-tight sm:text-[0.6875rem]",
            onDark ? "text-navy-100" : "text-ink-muted",
          )}
        >
          {SITE.catchphrase}
        </span>
      )}
    </Link>
  );
}
