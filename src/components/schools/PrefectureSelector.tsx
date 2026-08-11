import Link from "next/link";
import { PREFECTURES, REGIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  /** 都道府県slug -> 収録校数。0件の県は控えめに表示する */
  counts?: Record<string, number>;
  /** リンク先の組み立て。既定は都道府県ページ */
  buildHref?: (slug: string) => string;
  /** 選択中の都道府県slug（絞り込みUIで使う） */
  activeSlug?: string;
  /** 地方ごとに見出しを付けて並べる（一覧ページ向け） */
  groupByRegion?: boolean;
  className?: string;
};

const defaultHref = (slug: string) => `/prefectures/${slug}`;

/**
 * 都道府県から探すためのチップ一覧。
 * トップの小さい枠と、一覧ページの絞り込みの両方で使う。
 */
export function PrefectureSelector({
  counts,
  buildHref = defaultHref,
  activeSlug,
  groupByRegion = false,
  className,
}: Props) {
  if (!groupByRegion) {
    return (
      <ul
        className={cn(
          "grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5",
          className,
        )}
      >
        {PREFECTURES.map((p) => (
          <li key={p.slug}>
            <PrefectureChip
              name={p.name}
              href={buildHref(p.slug)}
              count={counts?.[p.slug]}
              isActive={activeSlug === p.slug}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {REGIONS.map((region) => {
        const items = PREFECTURES.filter((p) => p.region === region);
        return (
          <div key={region}>
            <h3 className="text-xs font-bold text-ink-muted">{region}</h3>
            <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-8">
              {items.map((p) => (
                <li key={p.slug}>
                  <PrefectureChip
                    name={p.name}
                    href={buildHref(p.slug)}
                    count={counts?.[p.slug]}
                    isActive={activeSlug === p.slug}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function PrefectureChip({
  name,
  href,
  count,
  isActive,
}: {
  name: string;
  href: string;
  count?: number;
  isActive: boolean;
}) {
  const hasSchools = (count ?? 0) > 0;

  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "flex min-h-9 items-center justify-center gap-1 rounded border px-1 text-center text-xs font-medium transition-colors",
        isActive
          ? "border-navy-800 bg-navy-800 text-white"
          : hasSchools
            ? "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50"
            : "border-line bg-white text-ink-faint hover:border-navy-300 hover:text-navy-700",
      )}
    >
      {name}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[0.625rem]",
            isActive ? "text-navy-100" : "text-ink-faint",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
