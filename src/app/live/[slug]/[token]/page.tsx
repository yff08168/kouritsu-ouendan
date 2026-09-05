import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Radio } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { LiveRefresh } from "@/components/results/LiveRefresh";
import { PREFECTURES } from "@/lib/constants";
import { LIVE_SOURCE, fetchLiveBoxScore } from "@/lib/live/hsb";

/** ★県の速報板と同じ間隔。**出典を叩く間隔は `hsb.ts` が持っている** */
export const revalidate = 60;

/**
 * ★**同じ `fetch` は1リクエストの中でまとめられる**ので、
 * ここで読んでも出典を2回叩くことにはならない（URLもオプションも同じ）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}): Promise<Metadata> {
  const { slug, token } = await params;
  const pref = PREFECTURES.find((p) => p.slug === slug);
  const box = await fetchLiveBoxScore(slug, token);
  const teams = box ? `${box.teams[0].name} - ${box.teams[1].name}` : "試合";
  return {
    title: `${teams}の速報${pref ? `（${pref.name}）` : ""}`,
    description: box?.tournament ?? undefined,
    // ★**残らないページ**（試合が終われば別の中身になる）。検索結果に置かない
    robots: { index: false, follow: true },
  };
}

export default async function LiveGamePage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const pref = PREFECTURES.find((p) => p.slug === slug);
  if (!pref) notFound();

  const box = await fetchLiveBoxScore(slug, token);

  return (
    <Container className="py-6">
      <Breadcrumb
        items={[
          // ★ Breadcrumb が先頭の「ホーム」を自分で出すので、ここには入れない
          { label: pref.name, href: `/prefectures/${slug}` },
          { label: "試合速報", href: `/live/${slug}` },
          { label: box ? `${box.teams[0].name} - ${box.teams[1].name}` : "試合" },
        ]}
      />

      {!box ? (
        <p className="mt-4 rounded-xl border border-line bg-white p-5 text-sm text-ink-muted">
          この試合の速報を取れませんでした。
          <Link href={`/live/${slug}`} className="ml-1 underline">
            {pref.name}の速報一覧へ
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">
              {box.teams[0].name} <span className="text-ink-faint">-</span> {box.teams[1].name}
            </h1>
            <LiveRefresh />
          </div>
          {box.tournament && <p className="mt-1 text-sm text-ink-muted">{box.tournament}</p>}

          <section className="mt-4 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              {/*
                ★**終わった試合をオレンジで出さない。** オレンジは「いま動いている」印で、
                **面で使わない**という決めごともある（AGENTS）。終了はネイビーの淡い印にする。
              */}
              {box.state?.includes("終了") ? (
                <span className="inline-flex items-center gap-1 rounded bg-navy-100 px-2 py-0.5 text-xs font-bold text-navy-800">
                  {box.state}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">
                  <Radio size={12} aria-hidden />
                  {box.state ?? "速報"}
                </span>
              )}
              <p className="text-sm text-ink-muted">
                {[box.date, box.stadium].filter(Boolean).join("　")}
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <LineScore teams={box.teams} />
            </div>

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
              <div className="flex gap-2">
                <dt className="text-ink-faint">プレイボール</dt>
                <dd className="tabular-nums">{box.playBall ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink-faint">ゲームセット</dt>
                {/* ★**試合中は `--:--`。** そのまま出す（推測で埋めない） */}
                <dd className="tabular-nums">{box.gameSet ?? "—"}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-ink-faint">
              出典:{" "}
              <a
                href={LIVE_SOURCE.url}
                className="underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                {LIVE_SOURCE.name}
              </a>
            </p>
          </section>
        </>
      )}
    </Container>
  );
}

/**
 * イニングスコア。
 * ★**まだ来ていない回は空**（出典が空にしている）。**0で埋めない。**
 * ★**15回ぶんあるが、誰も点を取っていない後ろの回は畳む** ——
 * 9回で終わる試合がほとんどで、15列出すと横に長すぎる。
 */
function LineScore({
  teams,
}: {
  teams: { name: string; innings: (number | null)[]; total: number | null }[];
}) {
  const played = Math.max(
    9,
    ...teams.map((t) => t.innings.reduce<number>((n, v, i) => (v === null ? n : i + 1), 0)),
  );
  const columns = Array.from({ length: played }, (_, i) => i + 1);

  return (
    <table className="min-w-full text-center text-sm tabular-nums">
      <thead>
        <tr className="border-b border-line text-xs text-ink-faint">
          <th scope="col" className="px-2 py-1 text-left font-normal">
            チーム
          </th>
          {columns.map((n) => (
            <th key={n} scope="col" className="w-8 px-1 py-1 font-normal">
              {n}
            </th>
          ))}
          <th scope="col" className="w-10 px-2 py-1 font-bold text-ink-muted">
            計
          </th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => (
          <tr key={team.name} className="border-b border-line last:border-0">
            <th scope="row" className="px-2 py-1.5 text-left font-bold">
              {team.name}
            </th>
            {columns.map((n) => (
              <td key={n} className="px-1 py-1.5">
                {team.innings[n - 1] ?? ""}
              </td>
            ))}
            <td className="px-2 py-1.5 text-base font-bold">{team.total ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
