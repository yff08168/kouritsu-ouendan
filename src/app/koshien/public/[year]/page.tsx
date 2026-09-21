import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { NationalDataNote } from "@/components/results/NationalDataNote";
import { PublicEntrantList } from "@/components/results/PublicEntrantList";
import { KoshienStat } from "@/components/results/KoshienStat";

import { listKoshienTournaments } from "@/lib/national-tournaments";
import {
  buildPublicYearLead,
  listPublicYearsWithEntrants,
  seasonLabel,
  venueLabel,
} from "@/lib/koshien-public";
import { getSchoolNameIndex } from "@/lib/queries/schools";
import { cn } from "@/lib/utils";

/**
 * その年の甲子園（春・夏）に出場した公立高校（`/koshien/public/<年>`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-09-21）
 *
 *   キーワードプランナーの実測で**「公立高校 甲子園」が8月に33,100**検索されている。
 *   中身は `/koshien/<年-季節>` の「この大会に出場した公立高校」の節がすでに持っているが、
 *   **その語を題に持つページが無かった。** 年で束ねて、題に「公立高校」「甲子園」を置く。
 *
 * ★ 数え方は大会ページと同じ（`src/lib/koshien-public.ts` を読むこと）。
 * ★ title の「甲子園」は 1925年以降だけ（それより前は「全国大会」。`venueLabel`）。
 * ★ 公立が1校も結び付かない年は 404（薄いページを作らない）。
 *   ★`generateStaticParams` は DB に触らない（年の一覧は生成物から）。
 *   その年に公立が無ければ描く側で `notFound()` にする。
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ year: string }>;
};

const parseYear = (s: string): number | null =>
  /^\d{4}$/.test(s) ? Number(s) : null;

export async function generateStaticParams() {
  const years = [...new Set(listKoshienTournaments().map((t) => t.year))];
  return years.map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year: raw } = await params;
  const year = parseYear(raw);
  if (year == null) return { title: "年が見つかりません" };

  const index = await getSchoolNameIndex("koshien");
  const y = listPublicYearsWithEntrants((d, p) => index.find(d, p)).find(
    (x) => x.year === year,
  );
  if (!y) return { title: "年が見つかりません" };

  const venue = venueLabel(year);
  /*
    ★★**探す人が打つ語をそのまま置く**（「公立高校 甲子園」「出場校」「成績」に年）。
    ★**「甲子園」と書けるのは 1925年から**（`venueLabel`）。
  */
  const title = `${year}年 ${venue}に出場した公立高校の一覧と成績`;
  const description = buildPublicYearLead(y).slice(0, 2).join("");

  return {
    title,
    description,
    alternates: { canonical: `/koshien/public/${year}` },
    openGraph: { type: "article", title: `${title}｜公立応援団`, description },
  };
}

export default async function KoshienPublicYearPage({ params }: Props) {
  const { year: raw } = await params;
  const year = parseYear(raw);
  if (year == null) notFound();

  const index = await getSchoolNameIndex("koshien");
  const years = listPublicYearsWithEntrants((d, p) => index.find(d, p));
  const at = years.findIndex((x) => x.year === year);
  if (at < 0) notFound();

  const y = years[at];
  // ★一覧は新しい順なので、次の年は手前にある
  const newer = at > 0 ? years[at - 1] : null;
  const older = at < years.length - 1 ? years[at + 1] : null;
  const venue = venueLabel(year);
  const lead = buildPublicYearLead(y);

  /*
    ★★**0を並べない**（AGENTS.md「0勝は言い換えた敗戦数」）。
    勝った試合が無い年・公立が優勝していない年は、その枠ごと出さない。
    残った枠の数で列の数を決める（1915年は出場1校だけ）。
  */
  const tiles: { label: string; value: string; unit: string; accent?: boolean }[] = [
    { label: "公立の出場（のべ）", value: `${y.entrantCount}`, unit: "校" },
  ];
  if (y.wins > 0) {
    tiles.push({ label: "公立が勝った試合", value: `${y.wins}`, unit: "試合" });
  }
  if (y.publicChampions > 0) {
    tiles.push({
      label: "公立が優勝",
      value: `${y.publicChampions}`,
      unit: "大会",
      accent: true,
    });
  }

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "公立高校の出場校", href: "/koshien/public" },
          { label: `${year}年` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">{venue}に出場した公立高校</p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {year}年 {venue}に出場した公立高校
        </h1>

        <dl
          className={cn(
            "mt-4 grid gap-3 text-center",
            tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {tiles.map((tile) => (
            <KoshienStat key={tile.label} {...tile} />
          ))}
        </dl>
      </header>

      <LeadText paragraphs={lead} />

      {y.tournaments.map((s) => {
        const t = s.tournament;
        const badges = new Map<string, string>();
        for (const slug of s.twentyFirst) badges.set(slug, "21世紀枠");
        return (
          <section
            key={t.slug}
            aria-labelledby={`kp-${t.slug}`}
            className="mt-4 rounded-xl border border-line bg-white p-5"
          >
            <SectionHeading
              id={`kp-${t.slug}`}
              title={`${seasonLabel(t)}　${t.name}`}
              icon={<Trophy size={18} />}
              note={
                s.entrants.length > 0
                  ? `公立 ${s.entrants.length}校・勝ち上がった順`
                  : undefined
              }
              moreHref={`/koshien/${t.slug}`}
              moreLabel="大会のページへ"
            />

            {s.finalists && (
              <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-ink-muted">優勝</span>
                  <strong
                    className={
                      s.championIsPublic
                        ? "font-bold text-accent-800"
                        : "font-bold text-navy-800"
                    }
                  >
                    {s.finalists.champion}
                  </strong>
                  {s.championIsPublic && (
                    <span className="text-xs text-accent-800">公立</span>
                  )}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-ink-muted">準優勝</span>
                  <span className="font-medium text-ink">{s.finalists.runnerUp}</span>
                </span>
              </p>
            )}

            {s.entrants.length > 0 ? (
              <div className="mt-3">
                <PublicEntrantList entrants={s.entrants} badges={badges} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                この大会で収録している試合の中に、学校マスタと結び付く公立高校はありません。
              </p>
            )}
          </section>
        );
      })}

      <AdSlot slot="sidebar" />

      <NationalDataNote className="mt-4" />

      {/* ------- 前後の年 ------- */}
      <section
        aria-labelledby="kp-others"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="kp-others"
          title="ほかの年"
          icon={<CalendarDays size={18} />}
          moreHref="/koshien/public"
          moreLabel="年別の一覧へ"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[older, newer]
            .filter((x) => x !== null)
            .map((other) => (
              <li key={other.year}>
                <Link
                  href={`/koshien/public/${other.year}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {other.year}年 {venueLabel(other.year)}に出場した公立高校
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    公立 {other.entrantCount}校
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </Container>
  );
}
