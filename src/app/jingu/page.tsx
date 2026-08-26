import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import { finalists, listJinguTournaments } from "@/lib/national-tournaments";
import { jinguPrefectureOf } from "@/lib/jingu-games";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 明治神宮大会（高校の部）の大会一覧（`/jingu`）。
 *
 * ★**甲子園とは別のURLにしている。** 神宮大会は甲子園ではないので、
 * `/koshien/…` の下に置くと**ページの中身と住所が食い違う。**
 *
 * ★**出典は日本学生野球協会**（主催者）。甲子園（Wikipedia）とは別。
 * ★**入っているのは2013〜2025年**（それ以前は出典が空を返す）。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "明治神宮大会（高校の部）の記録",
  description:
    "秋の地区大会を勝ち抜いた学校が集まる明治神宮野球大会 高校の部を、大会ごとにまとめた記録。全試合の結果と、出場した公立高校の成績が分かります。",
  alternates: { canonical: "/jingu" },
};

export default async function JinguIndexPage() {
  const tournaments = listJinguTournaments();
  const index = await getSchoolNameIndex("jingu");
  /*
    ★**神宮の出典は県を書いていない**ので、甲子園の生成物から借りた県で引く
    （`jinguPrefectureOf`。県が1つに決まる校名だけ借りる）。
  */
  const resolve = (display: string, pref?: string) =>
    index.find(display, pref ?? jinguPrefectureOf(display));

  const totalGames = tournaments.reduce((sum, t) => sum + t.games.length, 0);
  const years = tournaments.map((t) => t.year);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "明治神宮大会" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">全国大会</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          明治神宮大会（高校の部）
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          秋の地区大会を勝ち抜いた10校が集まる、その年の実質的な日本一決定戦です。
          優勝した地区には、翌春の選抜大会の出場枠が1つ増えます
          （<strong className="font-bold">神宮大会枠</strong>）。
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {Math.min(...years)}年〜{Math.max(...years)}年の{tournaments.length}大会・
          {totalGames}試合を収録しています。
        </p>
      </header>

      <section
        aria-labelledby="jingu-list"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="jingu-list"
          title="大会をたどる"
          icon={<Trophy size={18} />}
          note="新しい順"
        />
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {tournaments.map((t) => {
            const f = finalists(t);
            const publicChampion = f ? Boolean(resolve(f.champion)) : false;
            return (
              <li key={t.slug}>
                <Link
                  href={`/jingu/${t.slug}`}
                  className="flex min-h-11 items-center gap-3 px-1 py-2.5 hover:bg-navy-50"
                >
                  <span className="w-16 shrink-0 text-sm font-bold tabular-nums text-navy-800">
                    {t.year}年
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {f ? (
                      <>
                        優勝
                        <span
                          className={
                            publicChampion ? "font-bold text-accent-800" : "font-bold"
                          }
                        >
                          {f.champion}
                        </span>
                        <span className="text-ink-muted">　（決勝の相手 {f.runnerUp}）</span>
                      </>
                    ) : (
                      "決勝の記録なし"
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {t.games.length}試合
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <AdSlot slot="sidebar" />

      <aside className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4 text-[0.6875rem] leading-relaxed text-ink-muted">
        出典は
        <a
          href="https://www.student-baseball.or.jp/"
          className="underline underline-offset-2 hover:text-accent-800"
          target="_blank"
          rel="noopener noreferrer"
        >
          公益財団法人 日本学生野球協会
        </a>
        （大会の主催者）です。大学の部は収録していません。
        私立を含む全試合を載せていますが、学校ページにつながるのは公立・国立・高専だけです。
      </aside>
    </Container>
  );
}
