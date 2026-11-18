import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { StatTile } from "@/components/rankings/StatTile";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";

import {
  AUTUMN_SUMMARY_YEARS,
  getAutumnSummary,
  type AutumnPrefecture,
  type AutumnTeam,
} from "@/lib/autumn-summary";

/**
 * 秋季都道府県大会のまとめ（10地区別）。
 *
 * ★★**新しい出典は無い。** 地方大会の生成物の並べ替えだけ（`src/lib/autumn-summary.ts`）。
 *   データはデプロイで固まるので、ページは1時間の ISR。
 * ★**優勝校は「決勝がちょうど1試合」のときだけ**（`summarizeTournament`）。
 * ★**地区大会（東北大会・関東大会など）は、読める地区だけ載せる**（`areaTournament`）。
 *   載っていない地区を「結果なし」と書かない（取り込んでいないだけ）。
 *   ★**載せていない理由を「まだ」と書かない** —— 事実は作業が追いついていないのではなく、
 *   出典の利用条件を確認したうえで見送っていること（連盟を非難する書き方にもしない）。
 */
export const revalidate = 3600;
export const dynamicParams = false;

const YEARS = AUTUMN_SUMMARY_YEARS;

type Props = { params: Promise<{ year: string }> };

export function generateStaticParams() {
  return YEARS.map((y) => ({ year: String(y) }));
}

const yearOf = (raw: string): number | null => {
  const y = Number(raw);
  return YEARS.includes(y) ? y : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = yearOf((await params).year);
  if (year === null) return {};
  return {
    title: `${year}年 秋季高校野球大会のまとめ 都道府県大会の優勝校・結果`,
    description: `${year}年の秋季都道府県大会の優勝校・準優勝校・ベスト4を、北海道・東北・関東・東京・北信越・東海・近畿・中国・四国・九州の10地区ごとに一覧にしました。公立高校の結果はそれぞれの学校ページと大会ページから見られます。`,
    alternates: { canonical: `/regional/autumn/${year}` },
  };
}

function TeamName({ team }: { team: AutumnTeam }) {
  return team.slug ? (
    <Link
      href={`/schools/${team.slug}`}
      className="font-bold text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
    >
      {team.display}
    </Link>
  ) : (
    <span className="font-bold text-ink">{team.display}</span>
  );
}

function PrefectureRow({ p }: { p: AutumnPrefecture }) {
  const tournamentHref =
    p.tournamentSlug !== null ? `/prefectures/${p.slug}/${p.tournamentSlug}` : null;

  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[4rem_1fr_auto]">
      <div className="text-xs font-bold text-ink-muted">
        <Link href={`/prefectures/${p.slug}`} className="hover:text-accent-800">
          {p.name}
        </Link>
      </div>

      <div className="min-w-0 text-sm">
        {p.state === "done" && p.champion ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Badge variant="accent">優勝</Badge>
              <TeamName team={p.champion} />
              {p.runnerUp && (
                <span className="text-xs text-ink-muted">
                  準優勝 <TeamName team={p.runnerUp} />
                </span>
              )}
            </p>
            {p.semifinalists.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">
                ベスト4{" "}
                {p.semifinalists.map((t, i) => (
                  <span key={t.display}>
                    {i > 0 && "・"}
                    <TeamName team={t} />
                  </span>
                ))}
              </p>
            )}
          </>
        ) : p.state === "playing" ? (
          <p className="text-ink-muted">
            収録は{p.deepestRound ? `${p.deepestRound}まで` : `${p.games}試合`}です。
            優勝校はまだ決まっていないか、収録できていません。
          </p>
        ) : (
          <p className="text-ink-faint">この年の秋季大会は収録していません</p>
        )}
      </div>

      {tournamentHref && (
        <p className="col-start-2 text-[0.6875rem] sm:col-start-3 sm:text-right">
          <Link
            href={tournamentHref}
            className="text-navy-600 underline decoration-line underline-offset-2 hover:text-accent-800"
          >
            全試合とトーナメント表
          </Link>
        </p>
      )}
    </li>
  );
}

export default async function AutumnSummaryPage({ params }: Props) {
  const year = yearOf((await params).year);
  if (year === null) notFound();

  const areas = await getAutumnSummary(year);
  const all = areas.flatMap((a) => a.prefectures);
  const done = all.filter((p) => p.state === "done");
  const playing = all.filter((p) => p.state === "playing");
  const publicChampions = done.filter((p) => p.champion?.slug);

  const lead = [
    `${year}年の秋季都道府県大会は、このサイトに収録している${all.length}地区のうち${done.length}地区で決勝まで終わっています。` +
      (playing.length > 0
        ? `${playing.map((p) => p.name).join("・")}は決勝までの試合を収録できていません。`
        : "") +
      (publicChampions.length > 0
        ? `優勝校が公立だったのは${publicChampions.length}地区（${publicChampions.map((p) => p.name).join("・")}）です。`
        : ""),
    `地区は選抜の一般選考と同じ10地区（北海道・東北・関東・東京・北信越・東海・近畿・中国・四国・九州）で並べています。` +
      `都道府県大会の上位校は、この先の秋季地区大会（東北大会・関東大会など）に進み、地区大会の成績が来春のセンバツの出場校選考の資料になります。`,
  ];

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "地方大会", href: "/regional" },
          { label: `${year}年 秋季大会のまとめ` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Trophy size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            {year}年 秋季高校野球大会のまとめ
          </h1>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          都道府県大会の優勝校・準優勝校・ベスト4（10地区別）
        </p>
      </header>

      <LeadText paragraphs={lead} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="決勝まで終わった地区"
          value={String(done.length)}
          unit={`/ ${all.length}`}
          note="収録している試合から決勝が読めたもの"
        />
        <StatTile
          label="決勝を収録できていない地区"
          value={String(playing.length)}
          unit="地区"
          note="開催中か、出典に決勝が載っていない"
        />
        <StatTile
          label="優勝校が公立の地区"
          value={String(publicChampions.length)}
          unit="地区"
          note="学校ページのある公立・国立・高専"
        />
        <StatTile
          label="秋季大会の収録試合"
          value={all.reduce((n, p) => n + p.games, 0).toLocaleString("ja-JP")}
          unit="試合"
          note="私立どうしの試合も含む"
        />
      </div>

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection"]} />

      <div className="mt-4 space-y-4">
        {areas.map((area) => (
          <section
            key={area.name}
            aria-labelledby={`area-${area.name}`}
            className="rounded-xl border border-line bg-white p-5"
          >
            <h2 id={`area-${area.name}`} className="text-sm font-bold text-navy-800">
              {area.name}
              {area.note && (
                <span className="ml-2 text-[0.6875rem] font-normal text-ink-muted">
                  {area.note}
                </span>
              )}
            </h2>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {area.prefectures.map((p) => (
                <PrefectureRow key={p.slug} p={p} />
              ))}
            </ul>

            {area.areaTournament && (
              <div className="mt-3 rounded-lg border border-accent-500 bg-white px-3 py-2.5">
                <p className="text-xs font-bold text-navy-800">
                  {year}年 秋季{area.areaTournament.label}（地区大会）
                </p>
                {area.areaTournament.champion ? (
                  <div className="mt-1.5 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Badge variant="accent">優勝</Badge>
                      <TeamName team={area.areaTournament.champion} />
                      {area.areaTournament.champion.note && (
                        <span className="text-[0.6875rem] text-ink-faint">
                          {area.areaTournament.champion.note}
                        </span>
                      )}
                      {area.areaTournament.runnerUp && (
                        <span className="text-xs text-ink-muted">
                          準優勝 <TeamName team={area.areaTournament.runnerUp} />
                        </span>
                      )}
                    </p>
                    {area.areaTournament.semifinalists.length > 0 && (
                      <p className="mt-1 text-xs text-ink-muted">
                        ベスト4{" "}
                        {area.areaTournament.semifinalists.map((t, i) => (
                          <span key={t.display}>
                            {i > 0 && "・"}
                            <TeamName team={t} />
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">
                    {area.areaTournament.games}試合を収録（優勝校は収録できていません）
                  </p>
                )}
                <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
                  {(area.areaTournament.champion?.note || area.areaTournament.runnerUp?.note) &&
                    `「${area.areaTournament.champion?.note ?? area.areaTournament.runnerUp?.note}」などは、都道府県大会での順位です。`}
                  {area.areaTournament.hostName
                    ? `${year}年の開催県（${area.areaTournament.hostName}）の${area.areaTournament.sourceName}が公開している結果から読んでいます（${area.areaTournament.games}試合）。`
                    : `${area.areaTournament.sourceName}に載っていた試合から読んでいます。`}
                </p>
              </div>
            )}
          </section>
        ))}
      </div>

      <aside className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4">
        <h2 className="text-xs font-bold text-navy-800">このページについて</h2>
        <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
          <li>
            優勝校・準優勝校は、決勝がちょうど1試合として収録できた大会だけに載せています。
            ブロックごとに決勝がある予選や、試合の欠けた大会は、優勝校を決めずに「開催中」と表示します。
          </li>
          <li>
            ベスト4は準決勝で敗れた2校です。3位決定戦を行わない大会があるため「第3位」とは書いていません。
          </li>
          <li>
            地区大会（東北大会・関東大会など）の結果は、
            <strong className="text-ink">
              その年の開催県の連盟が公開している結果と、県大会と同じページに載せていた出典から読める地区だけ
            </strong>
            載せています。開催県の連盟の結果は、優勝校が明治神宮大会の出場校（各地区の優勝校）と一致することを確かめてから載せています。
            {areas.filter((a) => !a.note && !a.areaTournament).length > 0 && (
              <>
                {areas
                  .filter((a) => !a.note && !a.areaTournament)
                  .map((a) => `${a.name}大会`)
                  .join("・")}
                は、出典の利用条件を確認したうえで、いまは載せていません。
              </>
            )}
          </li>
          <li>
            試合結果の出典は、都道府県ごとの大会ページの下に書いています。リンクのない学校は、
            このサイトの収録対象（公立・国立・高専）ではない学校です。
          </li>
        </ul>
      </aside>

      <nav aria-label="関連ページ" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/regional" className="text-navy-800 underline underline-offset-2 hover:text-accent-800">
          地方大会の進み具合（地図）
        </Link>
        <Link href="/koshien/21seiki/2027" className="text-navy-800 underline underline-offset-2 hover:text-accent-800">
          センバツ2027 21世紀枠の推薦校
        </Link>
        <Link href="/jingu" className="text-navy-800 underline underline-offset-2 hover:text-accent-800">
          明治神宮大会（高校の部）
        </Link>
      </nav>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
