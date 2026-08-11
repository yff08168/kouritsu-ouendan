import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { establishmentLabel } from "@/lib/constants";
import { Thumbnail } from "@/components/common/Thumbnail";
import { Badge } from "@/components/common/Badge";
import type { SchoolSummary } from "@/types/app";

/** 「注目の公立高校」で使う横型カード */
export function SchoolCard({ school }: { school: SchoolSummary }) {
  const koshienTotal = school.koshienSpringCount + school.koshienSummerCount;

  return (
    <article className="group flex gap-3 py-3.5">
      <Thumbnail
        image={school.image}
        seed={school.slug}
        label={school.prefecture.name}
        className="h-[4.5rem] w-24 shrink-0 rounded sm:h-20 sm:w-28"
        sizes="112px"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold leading-snug text-ink">
          <Link
            href={`/schools/${school.slug}`}
            className="hover:text-navy-700 hover:underline"
          >
            {school.name}
          </Link>
          <span className="ml-1 text-xs font-normal text-ink-muted">
            （{school.prefecture.name}）
          </span>
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline">
            {establishmentLabel(school.establishment, school.prefecture.name)}
          </Badge>
          {koshienTotal > 0 && (
            <Badge>甲子園 {koshienTotal}回</Badge>
          )}
        </div>

        {school.catchcopy && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
            {school.catchcopy}
          </p>
        )}

        <Link
          href={`/schools/${school.slug}`}
          className="mt-2 inline-flex min-h-8 items-center gap-0.5 rounded-full border border-line px-3 text-xs font-medium text-navy-800 hover:border-navy-600 hover:bg-navy-50"
        >
          学校詳細へ
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
