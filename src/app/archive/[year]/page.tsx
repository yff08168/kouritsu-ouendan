import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Trophy, MapPin } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getArchiveYear,
  jinguOfYear,
  koshienOfYear,
  listArchiveYears,
} from "@/lib/archive";
import { finalists, nationalSeasonLabel } from "@/lib/national-tournaments";
import { seasonLabel } from "@/lib/regional-results";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 年別アーカイブの1年（`/archive/<年>`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-08-29）
 *
 *   **年という軸の入口がどこにも無かった。** 大会ページは602件あるが、
 *   辿れるのは県のページからだけで、しかも8件で畳んである。
 *   ★**602件へ内部リンクを配るハブ**であり、
 *   ★**年つきの検索**（`2019 高校野球 公立`）の受け皿でもある。
 *
 * ★**作るのは地方大会がある年だけ**（`listArchiveYears`）。
 *   甲子園は1915年から収録しているので、全部の年を作ると
 *   **中身の薄いページが80枚以上**できる。理由は `lib/archive.ts` に書いてある。
 */
export const revalidate = 3600;

type Props = { params: Promise<{ year: string }> };

export async function generateStaticParams() {
  const years = await listArchiveYears();
  return years.map((y) => ({ year: String(y.year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const entry = await getArchiveYear(Number(year));
  if (!entry) return { title: "この年の記録はありません" };

  const koshien = koshienOfYear(entry.year);
  const tournaments = entry.districts.reduce(
    (n, d) => n + d.tournaments.length,
    0,
  );

  /*
    ★★**数を書く。定型文にしない**（大会ページの description と同じ考え方）。
    ★**画面に無いことを書かない** —— 甲子園の記事が無い年は触れない。
  */
  const description = [
    `${entry.year}年の高校野球の記録。`,
    `${entry.districts.length}都道府県・${tournaments}大会の地方大会${entry.games.toLocaleString()}試合と、`,
    koshien.length
      ? `${koshien.map((t) => nationalSeasonLabel(t.season)).join("・")}の甲子園の全試合を、`
      : "",
    "公立高校を主役にまとめています。",
  ].join("");

  return {
    title: `${entry.year}年の高校野球｜地方大会と甲子園の記録`,
    description,
    alternates: { canonical: `/archive/${entry.year}` },
    openGraph: {
      type: "article",
      title: `${entry.year}年の高校野球 | 公立応援団`,
      description,
    },
  };
}

export default async function ArchiveYearPage({ params }: Props) {
  const { year } = await params;
  const entry = await getArchiveYear(Number(year));
  if (!entry) notFound();

  const koshien = koshienOfYear(entry.year);
  const jingu = jinguOfYear(entry.year);
  /*
    ★**公立かどうかは学校マスタへの完全一致で決める**（`/koshien` と同じ規則）。
    ★**そろえてあるので「大会ページでは公立なのにここでは違う」が起きない。**
  */
  const index = await getSchoolNameIndex("koshien");

  const years = await listArchiveYears();
  const at = years.findIndex((y) => y.year === entry.year);
  // 一覧は新しい順なので、次の年は前の要素
  const newer = at > 0 ? years[at - 1] : null;
  const older = at >= 0 && at < years.length - 1 ? years[at + 1] : null;

  const tournamentCount = entry.districts.reduce(
    (n, d) => n + d.tournaments.length,
    0,
  );

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "年別アーカイブ", href: "/archive" },
          { label: `${entry.year}年` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">年別アーカイブ</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          {entry.year}年の高校野球
        </h1>
        {/*
          ★★**このページ唯一の地の文。** 数はすべて収録しているデータから出す。
          ★**「盛り上がった」のような書き手の評価を入れない**（データに無い）。
        */}
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {entry.year}年に行われた地方大会のうち、
          <strong className="font-bold">
            {entry.districts.length}都道府県・{tournamentCount}大会の
            {entry.games.toLocaleString()}試合
          </strong>
          を収録しています。
          {koshien.length > 0 && (
            <>
              甲子園は
              {koshien.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && "・"}
                  {nationalSeasonLabel(t.season)}（{t.name}）
                </span>
              ))}
              の全試合が見られます。
            </>
          )}
        </p>
      </header>

      {/* ------- 甲子園 ------- */}
      {koshien.length > 0 && (
        <section
          aria-labelledby="koshien"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="koshien"
            title={`${entry.year}年の甲子園`}
            icon={<Trophy size={18} />}
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {koshien.map((t) => {
              const f = finalists(t);
              const school = f ? index.find(f.champion, f.championPref) : null;
              return (
                <li key={t.slug}>
                  <Link
                    href={`/koshien/${t.slug}`}
                    className="block rounded-lg border border-line p-4 hover:bg-navy-50"
                  >
                    <p className="text-xs text-ink-muted">
                      {nationalSeasonLabel(t.season)}・{t.games.length}試合
                    </p>
                    <p className="mt-0.5 font-bold text-navy-800">{t.name}</p>
                    {/*
                      ★**優勝校は決勝が読めている大会だけ書く**（`finalists` が null を返す）。
                      ★**公立なら色を変える。** それがこのサイトの見どころ
                    */}
                    {f && (
                      <p className="mt-1 text-sm text-ink">
                        優勝{" "}
                        <span
                          className={
                            school
                              ? "font-bold text-accent-800"
                              : "font-bold text-ink"
                          }
                        >
                          {f.champion}
                        </span>
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {jingu && (
            <p className="mt-3 text-sm text-ink-muted">
              秋の
              <Link
                href={`/jingu/${jingu.slug}`}
                className="font-medium text-navy-800 underline hover:text-accent-800"
              >
                明治神宮大会（{jingu.year}年）
              </Link>
              も{jingu.games.length}試合を収録しています。
            </p>
          )}
        </section>
      )}

      <AdSlot slot="sidebar" />

      {/* ------- 地方大会 ------- */}
      <section
        aria-labelledby="regional"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="regional"
          title={`${entry.year}年の地方大会`}
          icon={<MapPin size={18} />}
          note={`${entry.districts.length}都道府県`}
        />
        <p className="mt-2 text-sm text-ink-muted">
          大会名を押すと、その大会の全試合とトーナメント表が見られます。
        </p>
        <ul className="mt-3 divide-y divide-line">
          {entry.districts.map((d) => (
            <li key={d.slug} className="py-3">
              <div className="flex items-baseline gap-2">
                <Link
                  href={`/prefectures/${d.slug}`}
                  className="font-bold text-navy-800 hover:underline"
                >
                  {d.name}
                </Link>
                <span className="text-xs text-ink-muted">
                  {d.games.toLocaleString()}試合
                </span>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {d.tournaments.map((t) => (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink hover:bg-navy-50"
                    >
                      <span className="text-xs text-ink-muted">
                        {seasonLabel(t.season)}
                      </span>
                      <span>{t.label}</span>
                      <span className="text-xs text-ink-faint">{t.games}試合</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {/* ------- 前後の年 ------- */}
      {/*
        ★★**年をまたぐ内部リンク。** これが無いと26枚のページが互いに孤立し、
        `/archive` からしか辿れない。**クローラも利用者も年で行き来する。**
      */}
      <nav
        aria-label="前後の年"
        className="mt-4 flex items-stretch gap-3"
      >
        {older ? (
          <Link
            href={`/archive/${older.year}`}
            className="flex min-h-11 flex-1 items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink hover:bg-navy-50"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {older.year}年
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        <Link
          href="/archive"
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink hover:bg-navy-50"
        >
          <CalendarDays size={16} aria-hidden="true" />
          年の一覧
        </Link>
        {newer ? (
          <Link
            href={`/archive/${newer.year}`}
            className="flex min-h-11 flex-1 items-center justify-end gap-1.5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink hover:bg-navy-50"
          >
            {newer.year}年
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </Container>
  );
}
