import Link from "next/link";
import { PREFECTURES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  /** 都道府県slug -> 収録校数。0件の県は控えめに表示する */
  counts?: Record<string, number>;
  className?: string;
};

/**
 * 都道府県から学校を探すためのチップ一覧。
 * 47件をJISコード順に並べる。タップ領域を確保するため min-h を持たせる。
 */
export function PrefectureSelector({ counts, className }: Props) {
  return (
    <ul
      className={cn(
        "grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {PREFECTURES.map((p) => {
        const count = counts?.[p.slug] ?? 0;
        const hasSchools = count > 0;
        return (
          <li key={p.slug}>
            <Link
              href={`/prefectures/${p.slug}`}
              className={cn(
                "flex min-h-9 items-center justify-center rounded border px-1 text-center text-xs font-medium transition-colors",
                hasSchools
                  ? "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50"
                  : "border-line bg-white text-ink-faint hover:border-navy-300 hover:text-navy-700",
              )}
            >
              {p.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
