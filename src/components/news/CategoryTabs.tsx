import Link from "next/link";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  activeCategory?: NewsCategory;
  /** カテゴリ（未選択は undefined）からURLを組み立てる */
  buildHref: (category?: NewsCategory) => string;
};

const CATEGORY_KEYS = Object.keys(NEWS_CATEGORIES) as NewsCategory[];

export function CategoryTabs({ activeCategory, buildHref }: Props) {
  return (
    <nav aria-label="ニュースのカテゴリ">
      <ul className="flex flex-wrap gap-1.5">
        <li>
          <CategoryChip
            label="すべて"
            href={buildHref(undefined)}
            isActive={!activeCategory}
          />
        </li>
        {CATEGORY_KEYS.map((key) => (
          <li key={key}>
            <CategoryChip
              label={NEWS_CATEGORIES[key]}
              href={buildHref(key)}
              isActive={activeCategory === key}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CategoryChip({
  label,
  href,
  isActive,
}: {
  label: string;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
        isActive
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50",
      )}
    >
      {label}
    </Link>
  );
}
