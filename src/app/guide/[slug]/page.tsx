import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ExternalLink, Link2 } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";

import { GUIDES, findGuide, type GuideBlock, type GuideDataId } from "@/lib/content/guides";
import {
  inningsStats,
  jinguLatest,
  kokutaiChampions,
  koshienDrawShape,
  koshienExtraStats,
  samePrefectureGames,
  twentyFirstLatest,
  type InningsExample,
} from "@/lib/guide-data";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/** 校名 → 学校マスタ。**県まで渡して引く**（同名の別校に当てない。AGENTS.md） */
type Resolve = (display: string, pref?: string) => { slug: string; name: string } | null;

/**
 * ★**索引が取れなくてもページを落とさない**（Supabase が止まっていた日にビルドが
 *   丸ごと失敗した経緯。`/features` と同じ構え）。取れなければ公立の印を付けずに描く。
 */
async function loadResolve(): Promise<Resolve | null> {
  try {
    const index = await getSchoolNameIndex("koshien");
    return (d, p) => index.find(d, p);
  } catch {
    return null;
  }
}
import { formatDateLong, toDateAttr } from "@/lib/utils";

/**
 * 解説の1ページ（`/guide/<slug>`）。本文は `src/lib/content/guides.ts`（手書き）。
 *
 * ★**「データで見る」の部分だけ描画時に生成物から数える**（`src/lib/guide-data.ts`）。
 *   本文に数字を書き写さない（データが増えた瞬間に嘘になる）。
 * ★**出典は必ず本文の下に出す**（規則の中身は日本高野連の一次資料。歴史は ja.wikipedia）。
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) return { title: "解説が見つかりません" };
  return {
    title: guide.searchTitle,
    description: guide.description,
    alternates: { canonical: `/guide/${guide.slug}` },
    openGraph: {
      type: "article",
      title: `${guide.searchTitle}｜公立応援団`,
      description: guide.description,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) notFound();

  const others = GUIDES.filter((g) => g.slug !== guide.slug);
  // ★校名索引は、学校マスタと突き合わせる部品があるページだけ引く（DB を無駄に叩かない）
  const needsResolve = guide.sections.some((s) =>
    s.blocks.some((b) => b.type === "data" && b.id === "kokutai-champions"),
  );
  const resolve = needsResolve ? await loadResolve() : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[{ label: "ルールと制度の解説", href: "/guide" }, { label: guide.title }]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">ルールと制度の解説</p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">{guide.title}</h1>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          {guide.basis}に基づいています。最終確認{" "}
          <time dateTime={toDateAttr(guide.checkedOn)}>{formatDateLong(guide.checkedOn)}</time>。
          規則は毎年変わるので、出典のページで最新の条文を確かめてください。
        </p>
      </header>

      <LeadText paragraphs={guide.lead} />

      {guide.sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`g-${section.id}`}
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <h2 id={`g-${section.id}`} className="text-base font-bold text-navy-800">
            {section.heading}
          </h2>
          <div className="mt-3 space-y-3">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} resolve={resolve} />
            ))}
          </div>
        </section>
      ))}

      <AdSlot slot="sidebar" />

      {/* ------- 出典 ------- */}
      <section
        aria-labelledby="g-sources"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="g-sources" title="出典" icon={<ExternalLink size={18} />} />
        <ul className="mt-3 space-y-1.5 text-sm">
          {guide.sources.map((s) => (
            <li key={s.name} className="text-ink">
              {s.url ? (
                <a
                  href={s.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="underline decoration-line underline-offset-2 hover:text-accent-800"
                >
                  {s.name}
                </a>
              ) : (
                s.name
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          規則の中身は日本高野連の一次資料に基づき、歴史や経緯で一次資料に無いものは出典を明記しています。
          出典に無いことは書いていません。
        </p>
      </section>

      {/* ------- 関連するページ ------- */}
      <section
        aria-labelledby="g-related"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="g-related" title="関連するページ" icon={<Link2 size={18} />} />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {guide.related.map((r) => (
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

      {/* ------- ほかの解説 ------- */}
      <section
        aria-labelledby="g-others"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="g-others"
          title="ほかの解説"
          icon={<BookOpen size={18} />}
          moreHref="/guide"
          moreLabel="一覧へ"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {others.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guide/${g.slug}`}
                className="flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-navy-50"
              >
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

function Block({ block, resolve }: { block: GuideBlock; resolve: Resolve | null }) {
  switch (block.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-ink">{block.text}</p>;
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                {block.head.map((h) => (
                  <th key={h} scope="col" className="py-1.5 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="py-2 pr-4 align-top text-ink">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.note && <p className="mt-2 text-xs text-ink-faint">{block.note}</p>}
        </div>
      );
    case "data":
      return <DataBlock id={block.id} resolve={resolve} />;
  }
}

/**
 * 生成物から描画時に数える部分。
 * ★**数えるだけ。無いときは「無い」と書かず、その部分ごと出さない。**
 */
function DataBlock({ id, resolve }: { id: GuideDataId; resolve: Resolve | null }) {
  switch (id) {
    case "kokutai-champions": {
      const { rows, source } = kokutaiChampions();
      if (rows.length === 0) return null;
      const mark = (t: { name: string; prefecture: string | null }) => {
        const school = resolve ? resolve(t.name, t.prefecture ?? undefined) : null;
        return school ? (
          <Link href={`/schools/${school.slug}`} className="font-bold text-accent-800 underline decoration-line underline-offset-2">
            {t.name}
          </Link>
        ) : (
          <span className="text-ink">{t.name}</span>
        );
      };
      const pref = (t: { prefecture: string | null }) =>
        t.prefecture ? <span className="ml-1 text-xs text-ink-faint">{t.prefecture}</span> : null;
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink">
            {rows[rows.length - 1].year}年の第1回から{rows[0].year}年の第{rows[0].edition}回までの{rows.length}大会です。
            オレンジの校名は、このサイトが学校ページを持つ公立・国立・高専の学校です。
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">年（回）</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">優勝</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium tabular-nums">決勝</th>
                  <th scope="col" className="py-1.5 font-medium">準優勝</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.year}-${r.edition}`} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-ink">
                      {r.year}年（{r.edition === "特" ? "特別" : `第${r.edition}回`}）
                    </td>
                    <td className="py-2 pr-3">
                      {r.champions.length === 0 ? (
                        <span className="text-ink-muted">優勝校なし</span>
                      ) : (
                        r.champions.map((c, i) => (
                          <span key={c.name} className="block">
                            {mark(c)}
                            {pref(c)}
                            {i === r.champions.length - 1 && r.note && (
                              <span className="ml-1 text-xs text-ink-faint">（{r.note}）</span>
                            )}
                          </span>
                        ))
                      )}
                      {r.champions.length === 0 && r.note && (
                        <span className="ml-1 text-xs text-ink-faint">（{r.note}）</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-ink">{r.score ?? ""}</td>
                    <td className="py-2">
                      {r.runnerUp ? (
                        <>
                          {mark(r.runnerUp)}
                          {pref(r.runnerUp)}
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-faint">
            出典: {source.title}（{source.license}）の歴代優勝校一覧から、回・年・優勝校・県・決勝のスコア・準優勝校だけを取り込んでいます。
            軟式の部は載せていません。
          </p>
        </div>
      );
    }
    case "cold-stats": {
      const s = inningsStats();
      if (s.total === 0) return null;
      const pct = Math.round((s.short / s.total) * 1000) / 10;
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink">
            このサイトが各回の得点まで持っている地方大会の試合は{s.total.toLocaleString()}試合
            {s.from && s.to && `（${formatDateLong(s.from)}から${formatDateLong(s.to)}まで）`}で、
            そのうち{s.short.toLocaleString()}試合が9回より前に終わっています。
            {pct}%です。
          </p>
          <DistrictTable
            rows={s.byDistrict.slice(0, 12)}
            metric="short"
            label="9回より前に終わった試合"
          />
          <ExampleList title="9回より前に終わった試合の例（新しい順）" items={s.shortExamples} />
        </div>
      );
    }
    case "extra-stats": {
      const s = inningsStats();
      if (s.total === 0) return null;
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink">
            このサイトが各回の得点まで持っている地方大会の試合{s.total.toLocaleString()}試合のうち、
            10回以上まで行ったのは{s.long.toLocaleString()}試合です。
          </p>
          <ExampleList title="10回以上まで行った試合の例（新しい順）" items={s.longExamples} />
        </div>
      );
    }
    case "koshien-extra": {
      const k = koshienExtraStats();
      if (k.games === 0) return null;
      return (
        <p className="text-sm leading-relaxed text-ink">
          このサイトが収録している甲子園の{k.games.toLocaleString()}試合（{k.from}年〜{k.to}年）のうち、
          延長に入った試合は{k.extra.toLocaleString()}試合、そのうちタイブレークが導入された2018年以降は
          {k.extraSince2018}試合です。引き分けとして記録されている試合は{k.draws}試合あります。
          {k.tieBreak > 0 && `出典の記事がタイブレークと明記している延長は${k.tieBreak}試合です。`}
        </p>
      );
    }
    case "koshien-draw": {
      const d = koshienDrawShape();
      if (!d.summer && !d.spring) return null;
      const seasonName = (s: "spring" | "summer") => (s === "spring" ? "春の選抜" : "夏の選手権");
      const line = (x: NonNullable<typeof d.summer>) => (
        <li key={x.slug}>
          {x.year}年の{seasonName(x.season)}
          {x.no ? `（第${x.no}回）` : ""}は{x.schools}校が出場し、1回戦は{x.firstRoundGames}試合でした。
          {x.fromSecondRound > 0
            ? `${x.fromSecondRound}校は2回戦から登場しています。`
            : "全校が1回戦から登場しています。"}
          <Link href={`/koshien/${x.slug}`} className="ml-1 underline decoration-line underline-offset-2 hover:text-accent-800">
            この大会の全試合
          </Link>
        </li>
      );
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          {d.summer && line(d.summer)}
          {d.spring && line(d.spring)}
        </ul>
      );
    }
    case "same-pref-games": {
      const games = samePrefectureGames();
      if (games.length === 0) return null;
      const seasonShort = (s: "spring" | "summer") => (s === "spring" ? "春" : "夏");
      return (
        <div className="text-sm leading-relaxed text-ink">
          <p>該当する試合は{games.length}試合です。新しい順に並べています。</p>
          <ul className="mt-2 space-y-1">
            {games.map((g) => (
              <li key={`${g.slug}-${g.teams.map((t) => t.name).join("-")}-${g.round ?? ""}`} className="flex flex-wrap gap-x-2">
                <Link href={`/koshien/${g.slug}`} className="whitespace-nowrap underline decoration-line underline-offset-2 hover:text-accent-800">
                  {g.year}年{seasonShort(g.season)}
                </Link>
                <span className="whitespace-nowrap text-ink-muted">{g.round ?? ""}</span>
                <span>
                  {g.winner && g.loser
                    ? `${g.winner.name}（${g.winner.pref}） ${g.winner.score}-${g.loser.score} ${g.loser.name}（${g.loser.pref}）`
                    : g.teams.map((t) => `${t.name}（${t.pref}） ${t.score}`).join(" - ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "jingu-latest": {
      const j = jinguLatest();
      if (!j) return null;
      return (
        <p className="text-sm leading-relaxed text-ink">
          このサイトが収録している直近の明治神宮大会は{j.year}年で、優勝は{j.champion}、準優勝は
          {j.runnerUp}でした。
          <Link href={`/jingu/${j.slug}`} className="ml-1 underline decoration-line underline-offset-2 hover:text-accent-800">
            {j.year}年の明治神宮大会の全試合
          </Link>
        </p>
      );
    }
    case "twenty-first-latest": {
      const t = twentyFirstLatest();
      if (!t || t.schools.length === 0) return null;
      return (
        <p className="text-sm leading-relaxed text-ink">
          {t.year}年の21世紀枠は
          {t.schools.map((s, i) => (
            <span key={s.name}>
              {i > 0 && "、"}
              {s.slug ? (
                <Link href={`/schools/${s.slug}`} className="underline decoration-line underline-offset-2 hover:text-accent-800">
                  {s.name}
                </Link>
              ) : (
                s.name
              )}
              {s.prefecture && `（${s.prefecture}）`}
            </span>
          ))}
          でした。
          <Link href="/rankings/21seiki-waku" className="ml-1 underline decoration-line underline-offset-2 hover:text-accent-800">
            歴代の21世紀枠の出場校
          </Link>
        </p>
      );
    }
  }
}

function DistrictTable({
  rows,
  metric,
  label,
}: {
  rows: { slug: string; district: string; total: number; short: number; long: number }[];
  metric: "short" | "long";
  label: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-4 font-medium">地区</th>
            <th scope="col" className="py-1.5 pr-4 text-right font-medium">各回を持つ試合</th>
            <th scope="col" className="py-1.5 text-right font-medium">{label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-4">
                <Link href={`/prefectures/${r.slug}`} className="text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800">
                  {r.district}
                </Link>
              </td>
              <td className="py-1.5 pr-4 text-right text-ink">{r.total}</td>
              <td className="py-1.5 text-right font-bold text-ink">{r[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-faint">
        各回の得点を出典が出している地区だけです。多い順に並べています。
      </p>
    </div>
  );
}

function ExampleList({ title, items }: { title: string; items: InningsExample[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold text-ink-muted">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((g) => (
          <li key={g.href}>
            <Link
              href={g.href}
              className="flex min-h-9 flex-wrap items-baseline gap-x-2 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-navy-50"
            >
              <span className="text-xs text-ink-faint">
                {g.district}
                {g.date && `　${formatDateLong(g.date)}`}
                {g.round && `　${g.round}`}
              </span>
              <span className="font-medium text-ink">
                {g.teams[0].display} {g.teams[0].score}－{g.teams[1].score} {g.teams[1].display}
              </span>
              <span className="text-xs text-ink-muted">{g.innings}回</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
