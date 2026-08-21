import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PREFECTURES, REGIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LatestPublicByPrefecture } from "@/lib/queries/rankings";

type Props = {
  /** 都道府県slug -> 収録校数 */
  counts?: Record<string, number>;
  /**
   * タイル地図の**左上の空き**に入れる内容。
   *
   * 49地区を日本の形に並べると、左上（1〜8列目・1〜5行目）が丸ごと空く。
   * 北海道と東北が右端に寄るためで、ここは何を置いても地図の形を崩さない。
   *
   * `heading` は1〜2行目に固定で入る（セクションの見出しを想定）。
   * **地図の外に置くと、地図の左上が見出しのぶんだけ下から始まって
   * 右隣の北北海道と上端が揃わず、そこに空きができる。**
   *
   * `aside` は残りの3〜5行目に入るが、**入り切る幅のときだけ**。
   * 足りなければ地図の下に回る（globals.css の `.prefecture-map__aside`）。
   *
   * **狭いときは地図が横並びのボタンに変わる**ので、その場合は普通の
   * 縦並びに戻し、見出しを先頭・案内を最後に置く（`order`）。
   */
  heading?: ReactNode;
  aside?: ReactNode;
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
  /**
   * ★**マスの中に自由な行を出す**（2026-08-22 に追加。地方大会の進捗地図のため）。
   *
   * `latest` は甲子園の「春・夏それぞれの直近の公立校」専用なので、
   * **別の中身を出したいときはこちら。** 見た目（マスの高さ・行の詰め方）は
   * `latest` とまったく同じCSSを使う（`prefecture-map--detailed`）。
   *
   * ★**`latest` と同時に渡さないこと。** 渡した場合は `detail` を優先する。
   * ★**行は2行までにすること。** 3行入れると**その行のマスだけ背が高くなり、
   * 同じ行の他県まで引き伸ばされる**（AGENTS の「割り当てた行ぶんの高さに収める」）。
   */
  detail?: Record<string, PrefectureMapDetail>;
  buildHref?: (slug: string) => string;
  activeSlug?: string;
  className?: string;
};

/** `detail` の1行。`latest` の「春 ◯◯高校 '26」と同じ形に描かれる */
export type PrefectureMapLine = {
  /** 行頭の小さなラベル（「秋」「済」）。省略できる */
  label?: string;
  text: string;
  /** 行末の小さな文字（年・件数） */
  suffix?: string;
};

export type PrefectureMapDetail = {
  /** ★**2行まで**（上の注意を読むこと） */
  lines: PrefectureMapLine[];
  /** オレンジの枠で目立たせる（「いま動いている」など） */
  highlight?: boolean;
  /** 読み上げ用の文。**マスの中身をそのまま読んでも意味が通らない**ので必ず渡す */
  label: string;
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
  heading,
  aside,
  latest,
  highlightYear,
  detail,
  buildHref = defaultHref,
  activeSlug,
  className,
}: Props) {
  return (
    // 幅を測る基準になる要素。これ自体には見た目を持たせない。
    <div className={cn("prefecture-map-frame", className)}>
      <div
        className={cn(
          "prefecture-map",
          (latest || detail) && "prefecture-map--detailed",
        )}
      >
        {heading && <div className="prefecture-map__heading">{heading}</div>}
        {aside && <div className="prefecture-map__aside">{aside}</div>}
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
                /* ★`detail` を渡したときは `latest` を見ない（同時に渡さない決まり） */
                const cell = detail?.[prefecture.slug];

                // 春も夏も「今年」に公立が出ている地区。今年いちばん熱い場所。
                const isHot = cell
                  ? Boolean(cell.highlight)
                  : highlightYear != null &&
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
                      aria-label={
                        cell
                          ? cell.label
                          : prefectureLabel(prefecture.name, count, seasons, isHot)
                      }
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

                      {cell ? (
                        <span
                          aria-hidden="true"
                          className="prefecture-map__seasons"
                        >
                          {cell.lines.map((line, i) => (
                            <DetailLine
                              key={i}
                              line={line}
                              isActive={isActive}
                              isHighlight={Boolean(cell.highlight)}
                            />
                          ))}
                        </span>
                      ) : (
                        seasons && (
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
                        )
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

/**
 * `detail` の1行。**`SeasonLine` と同じマークアップ**にしてあるので、
 * マスの高さ・行の詰まり方は甲子園の地図とまったく同じになる。
 */
function DetailLine({
  line,
  isActive,
  isHighlight,
}: {
  line: PrefectureMapLine;
  isActive: boolean;
  isHighlight: boolean;
}) {
  return (
    <span className="prefecture-map__season">
      {line.label && (
        <span
          className={cn(
            "prefecture-map__season-label",
            isActive
              ? "bg-white/20 text-white"
              : isHighlight
                ? "bg-accent-500 text-navy-900"
                : "bg-navy-100 text-navy-700",
          )}
        >
          {line.label}
        </span>
      )}
      <span className="prefecture-map__season-school">{line.text}</span>
      {line.suffix && (
        <span className="prefecture-map__season-year">{line.suffix}</span>
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
