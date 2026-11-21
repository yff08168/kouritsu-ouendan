import Link from "next/link";
import { PenLine } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { columnsAbout } from "@/lib/content/columns";

/**
 * 「この大会を観戦したコラム」へのカード（大会ページ・特設ページの下に置く）。
 *
 * ★**公開済みのコラムが無ければ何も出さない**（空の見出しを残さない）。
 * ★**押せる文字だけ。説明文を付けない**（同じ文が並ぶと薄いページに見える。`GuideLinkBox` と同じ構え）。
 */
export function ColumnLinkCard({ about }: { about: string }) {
  const columns = columnsAbout(about);
  if (columns.length === 0) return null;
  return (
    <section
      aria-labelledby="column-link"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <SectionHeading
        id="column-link"
        title="観戦コラム"
        icon={<PenLine size={18} />}
        moreHref="/column"
        moreLabel="コラム一覧"
      />
      <ul className="mt-3 grid gap-2">
        {columns.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/column/${c.slug}`}
              className="flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-navy-50"
            >
              {c.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
