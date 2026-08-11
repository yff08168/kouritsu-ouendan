import Link from "next/link";
import { NEWS_CATEGORIES } from "@/lib/constants";
import { formatDate, toDateAttr } from "@/lib/utils";
import { Thumbnail } from "@/components/common/Thumbnail";
import type { NewsSummary } from "@/types/app";

/** ニュース一覧の1行。トップの「最新ニュース」と /news で共用する。 */
export function NewsCard({ news }: { news: NewsSummary }) {
  return (
    <article className="group">
      <Link
        href={`/news/${news.slug}`}
        className="flex gap-3 py-3.5 sm:gap-4"
      >
        <Thumbnail
          image={news.image}
          seed={news.slug}
          label={news.prefecture?.name}
          className="h-16 w-20 shrink-0 rounded sm:h-[4.5rem] sm:w-28"
          sizes="112px"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold text-navy-600">
            {NEWS_CATEGORIES[news.category]}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-ink group-hover:text-navy-700 group-hover:underline sm:text-[0.9375rem]">
            {news.title}
          </h3>
          <time
            dateTime={toDateAttr(news.publishedAt)}
            className="mt-1.5 block text-xs text-ink-faint"
          >
            {formatDate(news.publishedAt)}
          </time>
        </div>
      </Link>
    </article>
  );
}
