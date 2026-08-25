import Link from "next/link";
import { Flame } from "lucide-react";
import { PHENOMENON, SEASONS } from "@/lib/constants";
import { shortSchoolName } from "@/lib/school-name";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Thumbnail } from "@/components/common/Thumbnail";
import { Badge } from "@/components/common/Badge";
import type { PhenomenonSummary } from "@/types/app";

/**
 * トップページの「公立旋風」枠。
 * このサイト独自のコンテンツなので、ヒーローの隣に置いて最も目に入る位置にする。
 *
 * ★★**順位を付けるのをやめた**（2026-08-24。運営者の判断）。
 *   以前は `highlight_rank` の順に3件出して 1・2・3 と番号を振っていたが、
 *   **いまは全件からランダムに選んで枠いっぱいに出す**（`getRandomPhenomena`）。
 *   ★**番号を残すと「1位＝いちばんすごい旋風」に見える。**
 *   毎回入れ替わるものに順位を付けない。
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
        title={PHENOMENON.label}
        note={PHENOMENON.tagline}
        icon={<Flame size={22} />}
        moreHref="/phenomenon"
        tone="onDark"
        className="mb-1"
      />
      {/* 名前だけでは何のことか伝わらないため、狭い画面でも説明を出す */}
      <p className="mb-3 text-xs text-navy-100/80 sm:hidden">
        {PHENOMENON.tagline}
      </p>

      {/* ★順位ではないので `ol` ではなく `ul`（読み上げが「1番目」と言わないように） */}
      <ul className="space-y-2">
        {phenomena.map((item) => (
          <li key={item.id}>
            <Link
              href={`/phenomenon/${item.slug}`}
              className="group flex items-stretch gap-3 rounded-lg bg-white p-2.5 hover:bg-navy-50"
            >
              {/* ★番号の代わりに炎の印。**順位に見えないもの**にしてある */}
              <Flame
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent-500"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    title={item.schoolName ?? undefined}
                    className="text-base font-bold text-ink group-hover:underline"
                  >
                    {item.schoolName
                      ? shortSchoolName(item.schoolName, item.schoolSlug ?? undefined)
                      : item.title}
                  </span>
                  {item.prefecture && (
                    <span className="text-sm text-ink-muted">
                      （{item.prefecture.name}）
                    </span>
                  )}
                  {item.badge && (
                    <Badge variant="accent">{item.badge}</Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-ink-muted">
                  {item.year}
                  {SEASONS[item.season]}　{item.title}
                </p>
              </div>

              <Thumbnail
                image={item.image}
                seed={item.slug}
                school={
                  item.schoolName && item.schoolSlug
                    ? { name: item.schoolName, slug: item.schoolSlug }
                    : undefined
                }
                className="h-12 w-16 shrink-0 rounded"
                sizes="64px"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
