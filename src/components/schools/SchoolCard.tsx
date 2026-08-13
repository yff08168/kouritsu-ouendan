import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { establishmentLabel } from "@/lib/constants";
import { shortSchoolName } from "@/lib/school-name";
import { cn } from "@/lib/utils";
import { Thumbnail } from "@/components/common/Thumbnail";
import { Badge } from "@/components/common/Badge";
import type { SchoolSummary } from "@/types/app";

/**
 * 学校の横型カード。
 *
 * `compact` はトップの狭いカラムで何校も並べるとき用。
 * キャッチコピーとボタンを落として1件あたりの高さを半分にする。
 * **1件が高いままだと、5件も並べればスクロールが必要になり
 * 一覧として見渡せなくなる。**
 */
export function SchoolCard({
  school,
  compact = false,
  note,
}: {
  school: SchoolSummary;
  compact?: boolean;
  /** 校名の下に出す短い状況（「2勝で勝ち残り」など） */
  note?: React.ReactNode;
}) {
  const koshienTotal = school.koshienSpringCount + school.koshienSummerCount;

  return (
    <article className={cn("group flex gap-3", compact ? "py-2.5" : "py-3.5")}>
      <Thumbnail
        image={school.image}
        seed={school.slug}
        school={{ name: school.name, slug: school.slug }}
        className={cn(
          "shrink-0 rounded",
          compact ? "h-14 w-20" : "h-[4.5rem] w-24 sm:h-20 sm:w-28",
        )}
        sizes={compact ? "80px" : "112px"}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold leading-snug text-ink">
          <Link
            href={`/schools/${school.slug}`}
            title={school.name}
            className="hover:text-navy-700 hover:underline"
          >
            {shortSchoolName(school.name, school.slug)}
          </Link>
          <span className="ml-1 text-sm font-normal text-ink-muted">
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

        {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}

        {!compact && school.catchcopy && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
            {school.catchcopy}
          </p>
        )}

        {!compact && (
          <Link
            href={`/schools/${school.slug}`}
            className="mt-2 inline-flex min-h-9 items-center gap-0.5 rounded-full border border-line px-3.5 text-sm font-medium text-navy-800 hover:border-navy-600 hover:bg-navy-50"
          >
            学校詳細へ
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
