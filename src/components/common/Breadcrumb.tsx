import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  /** 最後の項目（現在地）には href を付けない */
  href?: string;
};

/** パンくず。回遊導線とSEOの両方で効く（要件23）。 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="パンくずリスト" className="py-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
        <li className="flex items-center gap-1">
          <Link href="/" className="hover:text-navy-800 hover:underline">
            ホーム
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              <ChevronRight
                size={13}
                aria-hidden="true"
                className="text-ink-faint"
              />
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-navy-800 hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink">
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
