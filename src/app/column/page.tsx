import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { AdSlot } from "@/components/ads/AdSlot";

import { listColumns } from "@/lib/content/columns";
import { formatDateLong, toDateAttr } from "@/lib/utils";

/**
 * コラムの一覧（`/column`）。**運営者が球場で観たことと、思ったこと。**
 *
 * ★**公開済みが1本も無いあいだは 404**（本番では下書きを数えない）。
 *   **中身の無い一覧を検索エンジンに出さない**（薄いページを作らない）。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "コラム｜高校野球の観戦記と所感",
  description:
    "公立応援団の運営者が、球場で観た試合の内容と思ったことを書いています。出場校がすべて私学の大会でも、公立高校の目線で観ます。",
  alternates: { canonical: "/column" },
};

export default function ColumnIndexPage() {
  const columns = listColumns();
  if (columns.length === 0) notFound();

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "コラム" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <PenLine size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">コラム</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          運営者が球場で観た試合の内容と、思ったことを書いています。
          試合の結果や記録は各大会のページに、ここには観た人の目で見たことを載せています。
        </p>
      </header>

      <section aria-labelledby="column-list" className="mt-4">
        <h2 id="column-list" className="sr-only">
          コラム一覧
        </h2>
        <ul className="grid gap-3">
          {columns.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/column/${c.slug}`}
                className="block rounded-xl border border-line bg-white p-5 transition-colors hover:border-navy-300 hover:bg-navy-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{c.topic}</Badge>
                  {c.published && c.publishedOn ? (
                    <time dateTime={toDateAttr(c.publishedOn)} className="text-xs text-ink-faint">
                      {formatDateLong(c.publishedOn)}
                    </time>
                  ) : (
                    <span className="text-xs font-bold text-accent-800">下書き（本番には出ません）</span>
                  )}
                </div>
                <h3 className="mt-2 text-base font-bold leading-snug text-navy-800">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{c.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
