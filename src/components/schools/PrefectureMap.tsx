import Link from "next/link";
import type { CSSProperties } from "react";
import { PREFECTURES, REGIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LatestPublicByPrefecture } from "@/lib/queries/rankings";

type Props = {
  /** 都道府県slug -> 収録校数 */
  counts?: Record<string, number>;
  /**
   * 地区slug -> 春・夏それぞれで直近に甲子園へ出た公立校。
   * 渡すとマスの中に校名が出る（幅が足りるときだけ）。
   */
  latest?: LatestPublicByPrefecture;
  /**
   * 「今年」の年。春・夏の両方でこの年の出場がある地区に色を付ける。
   * `latest` を渡すときだけ意味を持つ。
   */
  highlightYear?: number | null;
  buildHref?: (slug: string) => string;
  activeSlug?: string;
  className?: string;
};

const defaultHref = (slug: string) => `/prefectures/${slug}`;

/**
 * 都道府県セレクタ。
 *
 * 幅が十分にあるときだけ、甲子園の出場校一覧でおなじみの
 * タイル地図（北海道・東北が右上、残りが10列×4行）になる。
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
  latest,
  highlightYear,
  buildHref = defaultHref,
  activeSlug,
  className,
}: Props) {
  return (
    // 幅を測る基準になる要素。これ自体には見た目を持たせない。
    <div className={cn("prefecture-map-frame", className)}>
      <div className={cn("prefecture-map", latest && "prefecture-map--detailed")}>
        {REGIONS.map((region) => (
          <div key={region} className="prefecture-map__region">
            <span className="prefecture-map__region-name">{region}</span>
            <ul className="prefecture-map__list">
              {PREFECTURES.filter(
                (prefecture) => prefecture.region === region,
              ).map((prefecture) => {
                const count = counts?.[prefecture.slug] ?? 0;
                const isActive = activeSlug === prefecture.slug;
                const seasons = latest?.[prefecture.slug];

                // 春も夏も「今年」に公立が出ている地区。今年いちばん熱い場所。
                const isHot =
                  highlightYear != null &&
                  seasons?.spring?.year === highlightYear &&
                  seasons?.summer?.year === highlightYear;

                return (
                  <li
                    key={prefecture.slug}
                    style={
                      {
                        "--map-col": prefecture.mapCol,
                        "--map-row": prefecture.mapRow,
                        "--map-span": prefecture.mapSpan ?? 1,
                      } as CSSProperties
                    }
                  >
                    <Link
                      href={buildHref(prefecture.slug)}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={prefectureLabel(
                        prefecture.name,
                        count,
                        seasons,
                        isHot,
                      )}
                      className={cn(
                        "prefecture-map__tile rounded border transition-colors",
                        isActive
                          ? "border-navy-800 bg-navy-800 text-white"
                          : isHot
                            ? "border-accent-500 bg-accent-50 text-navy-900 hover:bg-accent-100"
                            : count > 0
                              ? "border-navy-300 bg-navy-50 text-navy-800 hover:border-navy-600 hover:bg-navy-100"
                              : "border-line bg-white text-ink-faint hover:border-navy-300 hover:text-navy-700",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="prefecture-map__name"
                      >
                        {prefecture.name}
                      </span>
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

                      {seasons && (
                        <span
                          aria-hidden="true"
                          className="prefecture-map__seasons"
                        >
                          <SeasonLine
                            label="春"
                            entry={seasons.spring}
                            isActive={isActive}
                            isThisYear={seasons.spring?.year === highlightYear}
                          />
                          <SeasonLine
                            label="夏"
                            entry={seasons.summer}
                            isActive={isActive}
                            isThisYear={seasons.summer?.year === highlightYear}
                          />
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

/**
 * マスの中の1行（「春 佐賀商業 '26」）。
 *
 * 校名だけでは「いつの話か」が分からず、2026年の代表校だと
 * 誤解されかねない。年は必ず添える。
 */
function SeasonLine({
  label,
  entry,
  isActive,
  isThisYear,
}: {
  label: string;
  entry: { display: string; year: number } | null;
  isActive: boolean;
  isThisYear: boolean;
}) {
  return (
    <span className="prefecture-map__season">
      <span
        className={cn(
          "prefecture-map__season-label",
          isActive
            ? "bg-white/20 text-white"
            : isThisYear
              ? "bg-accent-500 text-navy-900"
              : "bg-navy-100 text-navy-700",
        )}
      >
        {label}
      </span>
      {entry ? (
        <>
          <span className="prefecture-map__season-school">{entry.display}</span>
          <span className="prefecture-map__season-year">
            &apos;{String(entry.year).slice(-2)}
          </span>
        </>
      ) : (
        <span className="prefecture-map__season-school opacity-60">—</span>
      )}
    </span>
  );
}

/** 読み上げ用の文。マスの中身をそのまま読んでも意味が通らないので組み立てる。 */
function prefectureLabel(
  name: string,
  count: number,
  seasons: LatestPublicByPrefecture[string] | undefined,
  isHot: boolean,
): string {
  const parts = [name];
  if (count > 0) parts.push(`${count}校`);
  if (seasons) {
    parts.push(
      seasons.spring
        ? `春に最後に出た公立校は${seasons.spring.year}年の${seasons.spring.name}`
        : "春の公立校の出場なし",
    );
    parts.push(
      seasons.summer
        ? `夏に最後に出た公立校は${seasons.summer.year}年の${seasons.summer.name}`
        : "夏の公立校の出場なし",
    );
    if (isHot) parts.push("今年は春夏とも公立が出場");
  }
  return parts.join("、");
}
