import { capLabel } from "@/lib/school-name";
import { cn } from "@/lib/utils";

/**
 * 学校ごとのビジュアル。**写真の代わりに描く、ユニフォームの胸文字を模した記章。**
 *
 * ------------------------------------------------------------------
 * なぜ描くのか
 *
 *   校章は学校（またはデザイナー）の著作物で、多くは商標登録もされている。
 *   ユニフォームやキャップの実物写真も撮影者の著作権が付く。
 *   **装飾として載せる用途では引用も報道も成立しない**ので、
 *   679校ぶんの許諾を取らないかぎり使えない。現実的ではない。
 *
 *   そこで、権利の要らない材料（校名の文字と、slugから決まる色）だけで
 *   1校ずつ違う絵を作る。全3,531校に即座に付き、追加のデータも保存も要らない。
 *
 * ------------------------------------------------------------------
 * キャップの絵はやめた
 *
 *   最初はキャップの形を描いたが、実寸（公立旋風のサムネイルは64×48px）だと
 *   帽子と分かる形にはならず、そのぶん文字が小さくなって読めなくなった。
 *   **この大きさで学校を見分けさせるのは絵ではなく文字**なので、
 *   校名を大きく置き、球の縫い目を背景の装飾にとどめている。
 *
 * ------------------------------------------------------------------
 * 色は「その学校の実際のチームカラー」ではない
 *
 *   本物の色を機械的に当てることはできないし、当て推量で置くと
 *   間違った情報を載せることになる。**slugから決まる、サイトの配色**。
 *   写真（image_url）が入っている学校では、そちらが優先されて出ない。
 */

/**
 * 地色。**白文字が4.5:1を満たす濃さのものだけ**を並べている。
 * 数を増やすほど「実際のチームカラーだ」と誤解されやすくなるので、
 * 見分けが付く最小限（5色）に絞る。
 */
const COLORS = ["#0f2747", "#27507f", "#123f3a", "#5a1f2b", "#3a3f4a"] as const;

/** 文字列から安定した添字を作る（描画のたびに色が変わらないようにする） */
function pickColor(seed: string): string {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) {
    // 単純な和だと文字の並び替えで衝突するので、位置で重みを変える
    total = (total * 31 + seed.charCodeAt(i)) % 100003;
  }
  return COLORS[total % COLORS.length];
}

/**
 * 文字の大きさの決め方。viewBox（120×84）の座標系での値。
 *
 * `chip` … 一覧のサムネイル（64〜112px）。読ませたいので目一杯大きく。
 * `panel` … 学校詳細ページの写真枠（320px前後）。同じ比率で拡大すると
 *   文字が90pxを超えて画面を占領してしまうので、相対的に小さくする。
 */
const SCALE = {
  chip: { width: 104, oneLine: 34, twoLines: 24 },
  panel: { width: 76, oneLine: 22, twoLines: 16 },
} as const;

export type EmblemVariant = keyof typeof SCALE;

/**
 * 何行に折るか・何ptで描くか。
 *
 * 和文は1文字＝1emなので、**文字数×フォントサイズがそのまま幅**になる。
 * これを使って幅から逆算すれば、`textLength` で無理に詰めて字を歪めなくて済む。
 */
function layout(
  label: string,
  variant: EmblemVariant,
): { lines: string[]; fontSize: number } {
  const scale = SCALE[variant];
  const chars = [...label];
  if (chars.length <= 4) {
    return { lines: [label], fontSize: Math.min(scale.oneLine, scale.width / chars.length) };
  }
  // 5文字以上は2行。1行のまま縮めると64pxのサムネイルで読めなくなる
  const half = Math.ceil(chars.length / 2);
  return {
    lines: [chars.slice(0, half).join(""), chars.slice(half).join("")],
    fontSize: Math.min(scale.twoLines, scale.width / half),
  };
}

export function SchoolEmblem({
  name,
  slug,
  variant = "chip",
  className,
}: {
  name: string;
  slug: string;
  variant?: EmblemVariant;
  className?: string;
}) {
  const { lines, fontSize } = layout(capLabel(name, slug), variant);
  const color = pickColor(slug);

  return (
    <div
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: color }}
    >
      <svg
        viewBox="0 0 120 84"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* 球の縫い目。左右の端に寄せて、中央の文字にかからないようにする */}
        <g
          stroke="#fff"
          strokeOpacity="0.13"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M-2 12C22 26 22 58 -2 72" />
          <path d="M122 12C98 26 98 58 122 72" />
        </g>
        <g stroke="#fff" strokeOpacity="0.1" strokeWidth="2" strokeLinecap="round">
          <path d="M6 22h7M4 32h7M4 42h7M4 52h7M6 62h7" />
          <path d="M114 22h-7M116 32h-7M116 42h-7M116 52h-7M114 62h-7" />
        </g>

        {/* ブランドのオレンジ。面では使わない決まりなので下端の線だけ */}
        <rect x="0" y="80" width="120" height="4" fill="#f28c28" />

        <g fill="#fff" fontWeight="700" textAnchor="middle">
          {lines.map((line, i) => (
            <text
              key={line + i}
              x="60"
              /* y はベースライン。文字の中心を合わせるため 0.36em ぶん下げる */
              y={
                lines.length === 1
                  ? 42 + fontSize * 0.36
                  : 34 + i * (fontSize + 4) + fontSize * 0.36
              }
              fontSize={fontSize}
            >
              {line}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
