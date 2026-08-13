import Link from "next/link";
import { Flame } from "lucide-react";
import { PHENOMENON_LEVELS, SEASONS } from "@/lib/constants";
import { shortSchoolName } from "@/lib/school-name";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import type { PhenomenonSummary } from "@/types/app";

/** 公立旋風の一覧・関連表示で使うカード */
export function PhenomenonCard({ item }: { item: PhenomenonSummary }) {
  return (
    <article className="group relative flex gap-3 rounded-lg border border-line bg-white p-3 hover:border-navy-300">
      <Thumbnail
        image={item.image}
        seed={item.slug}
        label={item.prefecture?.name}
        school={
          item.schoolName && item.schoolSlug
            ? { name: item.schoolName, slug: item.schoolSlug }
            : undefined
        }
        className="h-16 w-20 shrink-0 rounded sm:h-20 sm:w-28"
        sizes="112px"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-navy-600">
            <Flame size={12} aria-hidden="true" className="text-accent-500" />
            {item.year}
            {SEASONS[item.season]}・{PHENOMENON_LEVELS[item.level]}
          </span>
          {item.badge && <Badge variant="accent">{item.badge}</Badge>}
        </div>

        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-ink">
          <Link
            href={`/phenomenon/${item.slug}`}
            className="after:absolute after:inset-0 group-hover:underline"
          >
            {item.title}
          </Link>
        </h3>

        {item.schoolName && (
          <p className="mt-1 text-sm text-ink-muted" title={item.schoolName}>
            {shortSchoolName(item.schoolName, item.schoolSlug ?? undefined)}
            {item.prefecture && `（${item.prefecture.name}）`}
          </p>
        )}
      </div>
    </article>
  );
}
