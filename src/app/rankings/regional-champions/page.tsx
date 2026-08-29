import type { Metadata } from "next";
import Link from "next/link";
import { Info, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import { listPublicChampions } from "@/lib/records";
import { seasonLabel } from "@/lib/regional-results";
import { RANKING_BY_SLUG } from "@/lib/constants";

/**
 * 地方大会で優勝した公立高校（`/rankings/regional-champions`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-08-29）
 *
 *   `/rankings` の5ページは**すべて甲子園の出場歴**から作っている。
 *   地方大会は44,000試合あるのに、**横断して数えた場所が無かった。**
 *   ★**「公立が県で優勝した」は、このサイトにしか無い一覧。**
 *
 * ★**数え方は `lib/records.ts`。** 優勝校は `summarizeTournament` から
 * しか取らない（「決勝がちょうど1試合のときだけ」という規則がそこにある）。
 */
export const revalidate = 3600;

const meta = RANKING_BY_SLUG.get("regional-champions");

export const metadata: Metadata = {
  title: meta?.title ?? "地方大会で優勝した公立高校",
  description: meta?.description,
  alternates: { canonical: "/rankings/regional-champions" },
};

export default async function RegionalChampionsPage() {
  const champions = await listPublicChampions();

  const schools = new Set(champions.map((c) => c.schoolSlug));
  const districts = new Set(champions.map((c) => c.districtSlug));
  const years = champions
    .map((c) => c.year)
    .filter((y): y is number => y !== null);

  // 年ごとにまとめる。年の分からない大会は最後にまとめて出す
  const byYear = new Map<number | null, typeof champions>();
  for (const c of champions) {
    const list = byYear.get(c.year);
    if (list) list.push(c);
    else byYear.set(c.year, [c]);
  }

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "地方大会の優勝" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">記録</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          地方大会で優勝した公立高校
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          春季大会・選手権予選・秋季大会で
          <strong className="font-bold">公立高校が優勝した大会</strong>
          を、収録している全試合から数え上げたものです。
          {champions.length > 0 && (
            <>
              いまのところ
              <strong className="font-bold">
                {districts.size}都道府県・{schools.size}校の{champions.length}大会
              </strong>
              {years.length > 0 && (
                <>
                  （{Math.min(...years)}年〜{Math.max(...years)}年）
                </>
              )}
              が見つかっています。
            </>
          )}
        </p>
      </header>

      {/*
        ★★**何を数えていないかを同じ画面に書く**（`DataNote` と同じ趣旨）。
        ★**`DataNote` は使えない** —— あちらの本文は甲子園の出典（Wikipedia）を
        名指ししている。**このページの出典は県ごとの高野連などで別物。**
      */}
      <aside
        aria-labelledby="note"
        className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4"
      >
        <div className="flex items-center gap-1.5">
          <Info size={15} aria-hidden="true" className="shrink-0 text-navy-600" />
          <h2 id="note" className="text-xs font-bold text-navy-800">
            このページの数字について
          </h2>
        </div>
        <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
          <li>
            <strong className="text-ink">
              収録できている大会の中から数えています。
            </strong>
            都道府県によって、さかのぼれる年も、取れている季節も違います。
            ここに無い＝優勝していない、ではありません。
          </li>
          <li>
            <strong className="text-ink">決勝が1試合だけ読み取れた大会</strong>
            に限っています。ブロックごとに「決勝」がある大会は、優勝校を1つに
            決められないため数えていません。
          </li>
          <li>
            出典は都道府県ごとに違います（各都道府県高等学校野球連盟のほか、
            地域の情報サイトなど）。大会名を押すと、その大会のページで確認できます。
          </li>
          <li>
            連合チームの優勝は数えていません。どの学校の記録にするかを
            決められないためです。
          </li>
        </ul>
      </aside>

      <AdSlot slot="sidebar" />

      <section
        aria-labelledby="list"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="list"
          title="優勝した大会"
          icon={<Trophy size={18} />}
          note="新しい順"
        />

        {champions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            まだ見つかっていません。
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {[...byYear.entries()].map(([year, list]) => (
              <div key={year ?? "unknown"}>
                <h3 className="text-sm font-bold text-navy-800">
                  {year === null ? "年の分からない大会" : `${year}年`}
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    {list.length}大会
                  </span>
                </h3>
                <ul className="mt-2 divide-y divide-line">
                  {list.map((c) => (
                    <li key={c.href} className="py-2.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link
                          href={`/schools/${c.schoolSlug}`}
                          className="font-bold text-accent-800 hover:underline"
                        >
                          {c.school}
                        </Link>
                        <span className="text-xs text-ink-muted">
                          {c.district}・{seasonLabel(c.season)}
                        </span>
                      </div>
                      <Link
                        href={c.href}
                        className="mt-0.5 inline-block text-sm text-ink hover:underline"
                      >
                        {c.tournament}
                        <span className="ml-2 text-xs text-ink-faint">
                          全{c.games}試合
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
