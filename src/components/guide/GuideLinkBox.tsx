import Link from "next/link";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { GUIDE_BY_SLUG } from "@/lib/content/guides";

/**
 * 「関連する解説」への小さな入口。大会ページ・試合ページ・記録ページに置く。
 *
 * ★**解説ページ単体の流入より、7万件の試合ページと1,349の大会ページからの
 *   内部リンクのほうが効く**（2026-09-21。キーワードプランナーの実測から決めた）。
 * ★**押せる文字だけ。説明文は付けない**（同じ文が何千枚にも並ぶと薄いページに見える）。
 * ★**slug が無ければ何も出さない**（解説を消したときにリンク切れを残さない）。
 */
export function GuideLinkBox({
  slugs,
  className,
}: {
  slugs: string[];
  className?: string;
}) {
  const guides = slugs.map((s) => GUIDE_BY_SLUG.get(s)).filter((g) => g !== undefined);
  if (guides.length === 0) return null;

  return (
    <aside
      aria-label="関連する解説"
      className={cn("rounded-xl border border-line bg-navy-50 px-4 py-3", className)}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-navy-800">
        <BookOpen size={14} aria-hidden="true" className="text-accent-500" />
        関連する解説
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guide/${g.slug}`}
              className="inline-flex min-h-8 items-center text-sm text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
            >
              {g.title}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
