import Link from "next/link";
import type { CSSProperties } from "react";
import { PREFECTURES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  /** 都道府県slug -> 収録校数 */
  counts?: Record<string, number>;
  buildHref?: (slug: string) => string;
  activeSlug?: string;
  className?: string;
};

const defaultHref = (slug: string) => `/prefectures/${slug}`;

/**
 * 日本の形に並べた都道府県セレクタ。
 *
 * 実際の県境SVGではなく、同じ大きさのマスを地理的な位置に置いている。
 * 香川や大阪のような面積の小さい県も、北海道と同じ大きさで押せるのが利点。
 *
 * DOMは1つのリストだけ。スマートフォンでは通常の折り返しグリッド、
 * sm以上でマス目の座標を割り当てて地図の形にする。
 * 表示だけを切り替える二重のマークアップにすると、
 * 読み上げで同じリンクが2回読まれてしまうため。
 */
export function PrefectureMap({
  counts,
  buildHref = defaultHref,
  activeSlug,
  className,
}: Props) {
  return (
    // グリッドの定義は globals.css の .prefecture-map にある。
    // Tailwind はテンプレート文字列からクラスを生成できないため、
    // 列数・行数のような算出値をクラス名に埋め込まない。
    <ul className={cn("prefecture-map", className)}>
      {PREFECTURES.map((prefecture) => {
        const count = counts?.[prefecture.slug] ?? 0;
        const isActive = activeSlug === prefecture.slug;

        return (
          <li
            key={prefecture.slug}
            style={
              {
                "--map-col": prefecture.mapCol,
                "--map-row": prefecture.mapRow,
              } as CSSProperties
            }
          >
            <Link
              href={buildHref(prefecture.slug)}
              aria-current={isActive ? "true" : undefined}
              aria-label={
                count > 0
                  ? `${prefecture.name}（${count}校）`
                  : `${prefecture.name}`
              }
              className={cn(
                "flex min-h-11 w-full flex-col items-center justify-center rounded border px-0.5 text-center leading-tight transition-colors",
                "sm:min-h-0 sm:aspect-square",
                isActive
                  ? "border-navy-800 bg-navy-800 text-white"
                  : count > 0
                    ? "border-navy-300 bg-navy-50 text-navy-800 hover:border-navy-600 hover:bg-navy-100"
                    : "border-line bg-white text-ink-faint hover:border-navy-300 hover:text-navy-700",
              )}
            >
              <span
                aria-hidden="true"
                className="text-xs font-medium sm:text-[0.625rem] lg:text-[0.6875rem]"
              >
                {prefecture.name}
              </span>
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "text-[0.625rem] tabular-nums sm:text-[0.5625rem]",
                    isActive ? "text-navy-100" : "text-accent-800",
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
