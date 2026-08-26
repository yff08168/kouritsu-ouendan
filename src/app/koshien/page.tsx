import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, GitBranch } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { NationalDataNote } from "@/components/results/NationalDataNote";
import { KoshienTournamentList } from "@/components/results/KoshienTournamentList";

import {
  finalists,
  listJinguTournaments,
  listKoshienTournaments,
} from "@/lib/national-tournaments";
import { KOSHIEN_TOURNAMENTS } from "@/lib/data/koshien-tournaments";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 甲子園の大会一覧（`/koshien`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-08-26）
 *
 *   甲子園の試合は**学校ページの中でしか見られなかった。**
 *   地方大会には大会ごとのページが514件あるのに、
 *   **全国大会は1枚も無い**という状態だった。
 *
 * ★**この一覧の主語は公立。** 大会名の脇に「公立の出場校数」を出し、
 * **公立が優勝した大会は色を変える**（それがこのサイトの見どころ）。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "甲子園の記録（大会別）",
  description:
    "春の選抜・夏の選手権を大会ごとにまとめた記録。全試合の結果とトーナメント表、その大会に出場した公立高校の成績が分かります。",
  alternates: { canonical: "/koshien" },
};

export default async function KoshienIndexPage() {
  const tournaments = listKoshienTournaments();
  const jingu = listJinguTournaments();
  const index = await getSchoolNameIndex("koshien");
  /*
    ★**県が分かるときは一致を要求する**（2026-08-26）。
    大会記事の校名は略称で、**別の県の同名校に当たる**
    （2003年夏の「金沢」＝石川の私立が、横浜市立金沢として出ていた）。
  */
  const resolve = (display: string, pref?: string) => index.find(display, pref);

  const totalGames = tournaments.reduce((sum, t) => sum + t.games.length, 0);
  /*
    ★**読めていない大会の数は「参照表にあってこちらに無いもの」を数える。**
    引き算（参照199 − こちら201）にすると、**別の出典から補った大会のぶんで負になる。**
  */
  const have = new Set(tournaments.map((t) => `${t.year}:${t.season}`));
  const missing = KOSHIEN_TOURNAMENTS.filter(
    (t) => !have.has(`${t.year}:${t.season}`),
  ).length;
  const years = tournaments.map((t) => t.year);
  // ★公立が優勝した大会。**このサイトがいちばん見せたいもの**
  const publicChampions = tournaments.filter((t) => {
    const f = finalists(t);
    return f ? Boolean(resolve(f.champion, f.championPref)) : false;
  });

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "甲子園の記録" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">全国大会</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          甲子園の記録
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          春の選抜・夏の選手権を、大会ごとにまとめています。
          1つの大会のページでは、
          <strong className="font-bold">全試合の結果</strong>と
          <strong className="font-bold">トーナメント表</strong>、
          そして<strong className="font-bold">その大会に出場した公立高校の成績</strong>
          が分かります。
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="収録した大会" value={`${tournaments.length}`} unit="大会" />
          <Stat label="収録した試合" value={`${totalGames.toLocaleString()}`} unit="試合" />
          <Stat
            label="公立が優勝"
            value={`${publicChampions.length}`}
            unit="大会"
            accent
          />
        </dl>
        <p className="mt-2 text-center text-xs text-ink-faint">
          {Math.min(...years)}年〜{Math.max(...years)}年
        </p>
      </header>

      <NationalDataNote className="mt-4" missing={missing} />

      <section
        aria-labelledby="koshien-list"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="koshien-list"
          title="大会をたどる"
          icon={<Trophy size={18} />}
          note="新しい順"
        />
        <div className="mt-3">
          <KoshienTournamentList
            entries={tournaments.map((t) => {
              const f = finalists(t);
              const champion = f?.champion ?? null;
              const school = champion ? resolve(champion, f?.championPref) : null;
              return {
                slug: t.slug,
                year: t.year,
                season: t.season,
                name: t.name,
                games: t.games.length,
                champion,
                championSlug: school?.slug ?? null,
              };
            })}
          />
        </div>
      </section>

      <AdSlot slot="sidebar" />

      {/* ------- 明治神宮大会 ------- */}
      <section
        aria-labelledby="jingu"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="jingu"
          title="明治神宮大会（高校の部）"
          icon={<GitBranch size={18} />}
          moreHref="/jingu"
          moreLabel="すべて見る"
        />
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          秋の地区大会を勝ち抜いた学校が集まる大会です。翌春の選抜大会で、
          優勝した地区に「神宮大会枠」が1つ増えます。
          <strong className="font-bold text-ink">
            {jingu.length}大会・
            {jingu.reduce((sum, t) => sum + t.games.length, 0)}試合
          </strong>
          を収録しています。
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {jingu.slice(0, 8).map((t) => (
            <li key={t.slug}>
              <Link
                href={`/jingu/${t.slug}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-navy-50"
              >
                {t.year}年
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-2 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <span
          className={
            accent
              ? "text-xl font-bold text-accent-800 sm:text-2xl"
              : "text-xl font-bold text-navy-800 sm:text-2xl"
          }
        >
          {value}
        </span>
        <span className="ml-0.5 text-xs text-ink-muted">{unit}</span>
      </dd>
    </div>
  );
}
