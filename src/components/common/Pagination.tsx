import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  totalPages: number;
  /** ページ番号からURLを組み立てる。呼び出し側で他の検索条件を保持する。 */
  buildHref: (page: number) => string;
};

/** 現在ページの前後2ページ分と、先頭・末尾を出す */
function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) result.push("gap");
    result.push(p);
    previous = p;
  }
  return result;
}

export function Pagination({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  const items = pageNumbers(page, totalPages);

  return (
    <nav aria-label="ページ送り" className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link
              href={buildHref(page - 1)}
              rel="prev"
              className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50"
            >
              <span className="sr-only">前のページ</span>
              <ChevronLeft size={18} aria-hidden="true" />
            </Link>
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink-faint">
              <ChevronLeft size={18} aria-hidden="true" />
            </span>
          )}
        </li>

        {items.map((item, index) =>
          item === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-ink-faint"
            >
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={buildHref(item)}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  "grid h-10 min-w-10 place-items-center rounded-lg border px-2 text-sm font-medium",
                  item === page
                    ? "border-navy-800 bg-navy-800 text-white"
                    : "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50",
                )}
              >
                <span className="sr-only">
                  {item === page ? "現在のページ " : ""}
                </span>
                {item}
              </Link>
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <Link
              href={buildHref(page + 1)}
              rel="next"
              className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50"
            >
              <span className="sr-only">次のページ</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink-faint">
              <ChevronRight size={18} aria-hidden="true" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
