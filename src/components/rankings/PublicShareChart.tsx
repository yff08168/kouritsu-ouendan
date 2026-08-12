import { SEASONS } from "@/lib/constants";
import type { KoshienYearStat } from "@/types/app";

type Props = {
  years: KoshienYearStat[];
  className?: string;
};

/** 描画領域。viewBox で相対指定するので、実寸ではなく比率の基準。 */
const W = 720;
const H = 280;
const PAD = { top: 16, right: 14, bottom: 30, left: 38 };
const PLOT = {
  w: W - PAD.left - PAD.right,
  h: H - PAD.top - PAD.bottom,
};

/**
 * 系列の見分けを**色と線種の両方**で付ける。
 * 色だけで分けると、色覚特性のある人と白黒印刷で区別できなくなる。
 */
const SERIES = [
  { season: "summer" as const, color: "var(--color-navy-800)", dash: undefined },
  { season: "spring" as const, color: "var(--color-navy-600)", dash: "5 4" },
];

/**
 * 甲子園の出場校のうち公立が占める割合の推移。
 *
 * このサイトの主題そのものを1枚で見せる図。年ごとの点は代表49校のうち
 * 十数校という単位なので上下しやすいが、100年ぶんを並べると傾向が出る。
 *
 * ★ 分子は「学校マスタと照合できた公立校」なので、統廃合や表記ゆれで
 *   取りこぼしたぶんだけ**少なめに出る**。図には概数である旨を添える。
 */
export function PublicShareChart({ years, className }: Props) {
  const usable = years.filter((y) => y.totalSchools !== null && y.totalSchools > 0);
  if (usable.length === 0) return null;

  const minYear = Math.min(...usable.map((y) => y.year));
  const maxYear = Math.max(...usable.map((y) => y.year));
  const span = Math.max(maxYear - minYear, 1);

  const x = (year: number) => PAD.left + ((year - minYear) / span) * PLOT.w;
  const y = (share: number) => PAD.top + (1 - share) * PLOT.h;

  const paths = SERIES.map((series) => {
    const points = usable
      .filter((row) => row.season === series.season)
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        year: row.year,
        share: row.publicSchools / (row.totalSchools as number),
      }));

    return {
      ...series,
      d: points
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(p.share).toFixed(1)}`)
        .join(" "),
      last: points[points.length - 1],
    };
  });

  // 20年ごとの目盛り。1915 のような半端な開始年からではなく切りのよい年に合わせる
  const ticks: number[] = [];
  for (let year = Math.ceil(minYear / 20) * 20; year <= maxYear; year += 20) ticks.push(year);

  const gridlines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-labelledby="share-chart-title share-chart-desc"
      >
        <title id="share-chart-title">
          甲子園の出場校に公立が占める割合の推移（{minYear}年〜{maxYear}年）
        </title>
        <desc id="share-chart-desc">
          春の選抜と夏の選手権それぞれについて、出場校のうち公立・国立・高専が
          占める割合を大会ごとに折れ線で示した図。同じ数値は下の表にもあります。
        </desc>

        {gridlines.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(value) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-faint)"
            >
              {Math.round(value * 100)}%
            </text>
          </g>
        ))}

        {ticks.map((year) => (
          <text
            key={year}
            x={x(year)}
            y={H - 10}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-ink-faint)"
          >
            {year}
          </text>
        ))}

        {paths.map((path) => (
          <path
            key={path.season}
            d={path.d}
            fill="none"
            stroke={path.color}
            strokeWidth={1.8}
            strokeDasharray={path.dash}
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-ink-muted">
        {paths.map((path) => (
          <span key={path.season} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="22"
                y2="4"
                stroke={path.color}
                strokeWidth={2}
                strokeDasharray={path.dash}
              />
            </svg>
            {SEASONS[path.season]}
            {path.last && (
              <span className="tabular-nums text-ink-faint">
                （{path.last.year}年 {Math.round(path.last.share * 100)}%）
              </span>
            )}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
