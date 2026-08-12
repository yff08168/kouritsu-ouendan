import Link from "next/link";
import type { CSSProperties } from "react";
import { PREFECTURES, REGIONS } from "@/lib/constants";
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
 * 都道府県セレクタ。
 *
 * 幅が十分にあるときだけ、日本の形に並べたタイル地図になる。
 * 狭いときは地方ごとの見出し＋横並びのボタンに変わる。
 * 切り替えの判定は画面幅ではなく**置かれた場所の幅**（コンテナクエリ）で行う。
 * 画面幅で切り替えると、PCでも幅の狭いカラムに入れたときにマスが潰れて
 * 県名が縦書きのようになってしまうため。
 *
 * DOMはどちらの形でも1つだけ。表示専用のマークアップを二重に持つと、
 * 読み上げで同じリンクが2回読まれてしまう。
 * 並べ替えは globals.css の .prefecture-map* にある。
 */
export function PrefectureMap({
  counts,
  buildHref = defaultHref,
  activeSlug,
  className,
}: Props) {
  return (
    // 幅を測る基準になる要素。これ自体には見た目を持たせない。
    <div className={cn("prefecture-map-frame", className)}>
      <div className="prefecture-map">
        {REGIONS.map((region) => (
          <div key={region} className="prefecture-map__region">
            <span className="prefecture-map__region-name">{region}</span>
            <ul className="prefecture-map__list">
              {PREFECTURES.filter(
                (prefecture) => prefecture.region === region,
              ).map((prefecture) => {
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
                        "prefecture-map__tile rounded border transition-colors",
                        isActive
                          ? "border-navy-800 bg-navy-800 text-white"
                          : count > 0
                            ? "border-navy-300 bg-navy-50 text-navy-800 hover:border-navy-600 hover:bg-navy-100"
                            : "border-line bg-white text-ink-faint hover:border-navy-300 hover:text-navy-700",
                      )}
                    >
                      <span aria-hidden="true">{prefecture.name}</span>
                      {count > 0 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "prefecture-map__count",
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
          </div>
        ))}
      </div>
    </div>
  );
}
