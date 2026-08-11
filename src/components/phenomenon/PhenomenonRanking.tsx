import Link from "next/link";
import { Flame } from "lucide-react";
import { SEASONS } from "@/lib/constants";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Thumbnail } from "@/components/common/Thumbnail";
import { Badge } from "@/components/common/Badge";
import type { PhenomenonSummary } from "@/types/app";

/**
 * トップページの「公立旋風」枠。
 * このサイト独自のコンテンツなので、ヒーローの隣に置いて最も目に入る位置にする。
 */
export function PhenomenonRanking({
  phenomena,
}: {
  phenomena: PhenomenonSummary[];
}) {
  return (
    <section
      aria-labelledby="phenomenon-heading"
      className="rounded-xl bg-navy-800 p-4 sm:p-5"
    >
      <SectionHeading
        id="phenomenon-heading"
        title="公立旋風"
        note="注目の公立高校"
        icon={<Flame size={18} />}
        moreHref="/phenomenon"
        tone="onDark"
        className="mb-3"
      />

      <ol className="space-y-2">
        {phenomena.map((item, index) => (
          <li key={item.id}>
            <Link
              href={`/phenomenon/${item.slug}`}
              className="group flex items-stretch gap-3 rounded-lg bg-white p-2.5 hover:bg-navy-50"
            >
              <span
                aria-hidden="true"
                className="grid w-5 shrink-0 place-items-start pt-0.5 text-lg font-bold leading-none text-accent-500"
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-ink group-hover:underline">
                    {item.schoolName ?? item.title}
                  </span>
                  {item.prefecture && (
                    <span className="text-xs text-ink-muted">
                      （{item.prefecture.name}）
                    </span>
                  )}
                  {item.badge && (
                    <Badge variant="accent">{item.badge}</Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-ink-muted">
                  {item.year}
                  {SEASONS[item.season]}　{item.title}
                </p>
              </div>

              <Thumbnail
                image={item.image}
                seed={item.slug}
                className="h-12 w-16 shrink-0 rounded"
                sizes="64px"
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
