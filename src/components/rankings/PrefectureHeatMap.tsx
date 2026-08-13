import Link from "next/link";
import type { CSSProperties } from "react";
import { PREFECTURES, REGIONS } from "@/lib/constants";

/**
 * 色の段階。薄い順。
 *
 * ネイビーの濃淡だけで作っている。オレンジを混ぜた2色スケールにすると
 * 「面でオレンジを使わない」という配色方針に反するうえ、
 * 色覚特性によっては段階の順序が読めなくなる。明度だけで並べれば
 * 白黒印刷でも順序が保たれる。
 */
const STEPS = [
  { bg: "var(--color-navy-50)", fg: "var(--color-navy-800)", border: "var(--color-line)" },
  { bg: "var(--color-navy-100)", fg: "var(--color-navy-800)", border: "var(--color-navy-100)" },
  { bg: "var(--color-navy-300)", fg: "var(--color-navy-900)", border: "var(--color-navy-300)" },
  { bg: "var(--color-navy-600)", fg: "#fff", border: "var(--color-navy-600)" },
  { bg: "var(--color-navy-800)", fg: "#fff", border: "var(--color-navy-800)" },
] as const;

/** 値が0の地区。段階の中に入れると「0と1」が同じ色になってしまうので分ける。 */
const ZERO = { bg: "#fff", fg: "var(--color-ink-faint)", border: "var(--color-line)" };

type Props = {
  /** 地区slug -> 値 */
  values: Record<string, number>;
  /** マスの下に出す単位（「回」など） */
  unit: string;
  /** 読み上げ用の指標名（「甲子園出場回数」など） */
  metricLabel: string;
  buildHref?: (slug: string) => string;
  className?: string;
};

type Band = {
  /** この帯に入る最小値 */
  from: number;
  /** 最大値。最後の帯は上限なしで null */
  to: number | null;
  color: (typeof STEPS)[number];
};

/**
 * 色の帯を決める。
 *
 * 等間隔で切ると、上位が突出しているデータでは下位が全部同じ色になって
 * 差が見えなくなる。**値の分布そのもの（分位）で切る**ことで、
 * どの帯にもおおむね同じ数の地区が入るようにしている。
 *
 * ただし「21世紀枠の選出回数」のように値が1〜4しか無いデータでは、
 * 分位で切ると同じ区切りが重なって「1〜／1〜／1〜」という凡例になる。
 * **値の種類が段階数以下のときは、値ごとに色を割り当てる。**
 */
function buildBands(values: number[]): Band[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const distinct = [...new Set(sorted)];

  const paint = (ranges: { from: number; to: number | null }[]): Band[] =>
    ranges.map((range, index) => ({
      ...range,
      color:
        STEPS[
          ranges.length === 1
            ? STEPS.length - 1
            : Math.round((index * (STEPS.length - 1)) / (ranges.length - 1))
        ],
    }));

  if (distinct.length <= STEPS.length) {
    return paint(distinct.map((value) => ({ from: value, to: value })));
  }

  const cuts = new Set<number>([distinct[0]]);
  for (let i = 1; i < STEPS.length; i++) {
    const at = Math.floor((sorted.length * i) / STEPS.length);
    cuts.add(sorted[Math.min(at, sorted.length - 1)]);
  }

  const bounds = [...cuts].sort((a, b) => a - b);
  return paint(
    bounds.map((from, index) => ({
      from,
      to: index + 1 < bounds.length ? bounds[index + 1] - 1 : null,
    })),
  );
}

/** 値がどの帯に入るか。0（と負）は帯に入れない。 */
function bandOf(value: number, bands: Band[]): Band | null {
  if (value <= 0) return null;
  let hit: Band | null = null;
  for (const band of bands) {
    if (value >= band.from) hit = band;
  }
  return hit;
}

/**
 * 都道府県タイル地図の色分け。
 *
 * 並びと切り替え（狭いときは地方ごとのボタン、広いときは日本の形）は
 * PrefectureMap と同じ globals.css のルールに乗っている。
 * DOMを二重に持たないので、読み上げでリンクが2回読まれることもない。
 */
export function PrefectureHeatMap({
  values,
  unit,
  metricLabel,
  buildHref = (slug) => `/prefectures/${slug}`,
  className,
}: Props) {
  const bands = buildBands(Object.values(values));

  return (
    <div className={className}>
      <div className="prefecture-map-frame">
        <div className="prefecture-map">
          {REGIONS.map((region) => (
            <div key={region} className="prefecture-map__region">
              <span className="prefecture-map__region-name">{region}</span>
              <ul className="prefecture-map__list">
                {PREFECTURES.filter((p) => p.region === region).map((prefecture) => {
                  const value = values[prefecture.slug] ?? 0;
                  const color = bandOf(value, bands)?.color ?? ZERO;

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
                        aria-label={`${prefecture.name}　${metricLabel} ${value}${unit}`}
                        className="prefecture-map__tile rounded border transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: color.bg,
                          color: color.fg,
                          borderColor: color.border,
                        }}
                      >
                        <span aria-hidden="true">{prefecture.name}</span>
                        <span aria-hidden="true" className="prefecture-map__count font-bold">
                          {value}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* 凡例。色だけでは何段階なのか、どちらが多いのか伝わらない。 */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[0.6875rem] text-ink-muted">
        <span>少ない</span>
        <ul className="flex flex-wrap items-center gap-0.5">
          <li
            className="flex h-5 min-w-8 items-center justify-center rounded-sm border px-1 tabular-nums"
            style={{ backgroundColor: ZERO.bg, color: ZERO.fg, borderColor: ZERO.border }}
          >
            0
          </li>
          {bands.map((band) => (
            <li
              key={band.from}
              className="flex h-5 min-w-8 items-center justify-center rounded-sm border px-1 tabular-nums"
              style={{
                backgroundColor: band.color.bg,
                color: band.color.fg,
                borderColor: band.color.border,
              }}
            >
              {band.to === null
                ? `${band.from}〜`
                : band.to === band.from
                  ? band.from
                  : `${band.from}–${band.to}`}
            </li>
          ))}
        </ul>
        <span>多い（{unit}）</span>
      </div>
    </div>
  );
}
