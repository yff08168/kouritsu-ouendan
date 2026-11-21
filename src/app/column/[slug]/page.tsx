import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ChevronRight, Link2 } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { SectionHeading } from "@/components/common/SectionHeading";
import { JsonLd } from "@/components/common/JsonLd";
import { NewsBody } from "@/components/news/NewsBody";
import { GameSummaryCard } from "@/components/column/GameSummaryCard";
import { AdSlot } from "@/components/ads/AdSlot";

import { COLUMNS, findColumn, listColumns, type ColumnGame } from "@/lib/content/columns";
import { articleJsonLd } from "@/lib/seo";
import { formatDateLong, toDateAttr } from "@/lib/utils";

/**
 * コラムの1本（`/column/<slug>`）。本文は `src/lib/content/columns.ts`（手書き）。
 *
 * ★**書き手は運営者。** 「観た人の所感」であることを記事の下に必ず書く
 *   （試合の結果は公式の記録・大会ページを見てもらう）。
 * ★**観戦した試合のカードは `games` から描く**（本文に点数を書き写さない。
 *   `scripts/verify-column.mjs` が大会の公式データと突き合わせる）。
 * ★**下書きは本番では 404**（`findColumn`）。`next dev` では下書きの帯を出して見られる。
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return COLUMNS.filter((c) => c.published).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const column = findColumn(slug);
  if (!column) return { title: "コラムが見つかりません" };
  return {
    title: column.searchTitle,
    description: column.description,
    alternates: { canonical: `/column/${column.slug}` },
    openGraph: {
      type: "article",
      title: `${column.searchTitle}｜公立応援団`,
      description: column.description,
    },
    // ★下書きは検索エンジンに出さない（本番では 404 なので、これが効くのは dev のときだけ）
    ...(column.published ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ColumnPage({ params }: Props) {
  const { slug } = await params;
  const column = findColumn(slug);
  if (!column) notFound();

  const others = listColumns().filter((c) => c.slug !== column.slug && c.published);

  return (
    <Container size="narrow" className="pb-4">
      {column.published && (
        <JsonLd
          data={articleJsonLd({
            title: column.title,
            description: column.description,
            path: `/column/${column.slug}`,
            publishedAt: column.publishedOn,
            imageUrl: null,
          })}
        />
      )}
      <Breadcrumb items={[{ label: "コラム", href: "/column" }, { label: column.title }]} />

      {!column.published && (
        <p className="mb-3 rounded-lg border border-accent-500 bg-accent-50 px-4 py-2.5 text-sm font-bold text-accent-800">
          下書きです（本番には出ません。公開するときは columns.ts の published を true にします）。
        </p>
      )}

      <article className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>コラム</Badge>
            <Badge variant="outline">{column.topic}</Badge>
            {column.publishedOn && (
              <time dateTime={toDateAttr(column.publishedOn)} className="text-xs text-ink-faint">
                {formatDateLong(column.publishedOn)}
              </time>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-snug text-navy-800 sm:text-2xl">
            {column.title}
          </h1>
          <p className="mt-2 text-xs text-ink-muted">
            書き手：{column.author}
            {column.watchedOn && <>　観戦日：{formatDateLong(column.watchedOn)}</>}
            {column.updatedOn && <>　更新：{formatDateLong(column.updatedOn)}</>}
          </p>

          <div className="mt-5 space-y-3">
            {column.lead.map((p) => (
              <p key={p} className="text-sm leading-relaxed text-ink">
                {p}
              </p>
            ))}
          </div>

          {column.games.length > 0 && (
            <section aria-labelledby="c-games" className="mt-6 rounded-lg border border-line bg-navy-50/50 p-4">
              <h2 id="c-games" className="text-sm font-bold text-navy-800">
                観戦した試合
              </h2>
              <ul className="mt-2 space-y-2">
                {column.games.map((g) => (
                  <GameLine key={`${g.date}-${g.time ?? ""}-${g.teams[0].name}`} game={g} />
                ))}
              </ul>
            </section>
          )}

          {/*
            ★**節ごとに描く。** `game` がある節は、見出しを試合から自動で組み、
            **見出しの下に試合の概要カード**（回ごとの得点・試合時間・観衆）を出す。
          */}
          <div className="mt-2">
            {column.sections.map((section, i) => {
              const game = section.game !== undefined ? column.games[section.game] : undefined;
              const heading = section.heading ?? (game ? gameHeading(game) : "");
              return (
                <section key={i} aria-labelledby={`c-s${i}`}>
                  <div className="markdown">
                    <h2 id={`c-s${i}`}>{heading}</h2>
                  </div>
                  {game && <GameSummaryCard game={game} />}
                  <div className="mt-3">
                    <NewsBody markdown={section.body} />
                  </div>
                </section>
              );
            })}
          </div>

          {column.photos.length > 0 && (
            <section aria-labelledby="c-photos" className="mt-8">
              <h2 id="c-photos" className="text-base font-bold text-navy-800">
                写真
              </h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                {column.photos.map((p) => (
                  <li key={p.src}>
                    <figure>
                      <Image
                        src={p.src}
                        alt={p.alt}
                        width={p.width}
                        height={p.height}
                        sizes="(max-width: 768px) 100vw, 360px"
                        className="h-auto w-full rounded-lg border border-line"
                      />
                      <figcaption className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                        {p.caption && <span>{p.caption}　</span>}
                        <span className="text-ink-faint">{p.credit}</span>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
            このコラムは、{column.author}が球場で観た試合についての個人の観戦記・所感です。
            試合の結果や記録は、各大会のページと主催者の発表をご確認ください。
          </p>
        </div>
      </article>

      <AdSlot slot="news-article-bottom" />

      {column.related.length > 0 && (
        <section
          aria-labelledby="c-related"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="c-related" title="関連するページ" icon={<Link2 size={18} />} />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {column.related.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-navy-50"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section
          aria-labelledby="c-others"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="c-others"
            title="ほかのコラム"
            icon={<BookOpen size={18} />}
            moreHref="/column"
            moreLabel="一覧へ"
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {others.map((c) => (
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
      )}
    </Container>
  );
}

/** 試合の節の見出し。**点数は `games` から**組む（見出しに手で書き写さない） */
function gameHeading(game: ColumnGame): string {
  const [a, b] = game.teams;
  return `第${game.order}試合　${a.name} ${a.score}－${b.score} ${b.name}`;
}

/** 観戦した試合の1行。点数は `games` から（本文には書き写さない） */
function GameLine({ game }: { game: ColumnGame }) {
  const [a, b] = game.teams;
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="text-xs text-ink-muted">
        {formatDateLong(game.date)}
        {game.time && `　${game.time}`}　{game.round}
      </span>
      <span className="font-bold text-navy-800">
        {a.name} {a.score}－{b.score} {b.name}
      </span>
      <Link
        href={game.href}
        className="inline-flex items-center gap-0.5 text-xs text-ink-muted underline decoration-line underline-offset-2 hover:text-accent-800"
      >
        大会ページ
        <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </li>
  );
}
