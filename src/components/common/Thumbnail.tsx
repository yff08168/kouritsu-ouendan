import Image from "next/image";
import type { ImageRef } from "@/types/app";
import { cn } from "@/lib/utils";
import { SchoolEmblem, type EmblemVariant } from "@/components/schools/SchoolEmblem";

type Props = {
  image: ImageRef | null;
  /** 画像が無いときにフォールバック内に表示する短いテキスト（県名など） */
  label?: string;
  /** 同じ見た目が並ばないよう、この文字列からパターンを決める */
  seed?: string;
  /**
   * 学校が主役のカードで渡す。写真が無いとき、共通のグラデーションではなく
   * その学校の記章（`SchoolEmblem`）を出す。
   */
  school?: { name: string; slug: string };
  /** 記章の描き分け。大きな枠（学校詳細ページ）では "panel" を渡す */
  emblemVariant?: EmblemVariant;
  className?: string;
  sizes?: string;
  /** 画像のクレジットを重ねて表示するか（詳細ページのメイン画像で使う） */
  showCredit?: boolean;
};

/**
 * カードのサムネイル。
 *
 * 高校野球は試合写真の権利が重く、実データでも画像が無い記事・学校が多く出る。
 * そのため「画像が無い状態が通常」と考え、フォールバックを手抜きの灰色ではなく
 * ブランドの一部として設計している（要件33）。
 */
export function Thumbnail({
  image,
  label,
  seed = "",
  school,
  emblemVariant = "chip",
  className,
  sizes = "(max-width: 768px) 100vw, 33vw",
  showCredit = false,
}: Props) {
  if (image) {
    return (
      <div className={cn("relative overflow-hidden bg-navy-100", className)}>
        <Image
          src={image.url}
          alt={image.alt ?? ""}
          fill
          sizes={sizes}
          className="object-cover"
        />
        {showCredit && image.credit && (
          <span className="absolute bottom-0 right-0 bg-navy-900/70 px-2 py-0.5 text-[0.625rem] text-white">
            {image.credit}
          </span>
        )}
      </div>
    );
  }

  // 学校が主役なら、どの学校か分かる記章を出す（共通の絵だと全部同じに見える）
  if (school) {
    return (
      <SchoolEmblem
        name={school.name}
        slug={school.slug}
        variant={emblemVariant}
        className={className}
      />
    );
  }

  return <FallbackVisual label={label} seed={seed} className={className} />;
}

/** 文字列から 0〜2 の安定した値を作る（描画のたびに変わらないようにする） */
function pickVariant(seed: string): 0 | 1 | 2 {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
  return (total % 3) as 0 | 1 | 2;
}

const GRADIENTS = [
  "from-navy-800 to-navy-600",
  "from-navy-700 to-navy-800",
  "from-navy-600 to-navy-900",
] as const;

function FallbackVisual({
  label,
  seed = "",
  className,
}: {
  label?: string;
  seed?: string;
  className?: string;
}) {
  const variant = pickVariant(seed || label || "");

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden bg-gradient-to-br",
        GRADIENTS[variant],
        className,
      )}
    >
      {/* ボールの縫い目をモチーフにした装飾 */}
      <svg
        viewBox="0 0 120 120"
        className="absolute -right-6 -top-6 h-[130%] w-auto text-white/10"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="3" />
        <path
          d="M30 28c12 9 18 24 17 40M90 28c-12 9-18 24-17 40"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M27 40h8M25 50h8M25 60h8M27 70h8M93 40h-8M95 50h-8M95 60h-8M93 70h-8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {/* 芝のライン */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-900/40 to-transparent" />

      {label && (
        <span className="absolute bottom-2 left-3 text-xs font-bold tracking-wide text-white/85">
          {label}
        </span>
      )}
    </div>
  );
}
