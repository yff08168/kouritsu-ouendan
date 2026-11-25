import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { KoshienStat } from "@/components/results/KoshienStat";
import { ProPrefSections } from "@/components/pro/ProPrefSections";

import {
  PRO_PREF_NAME,
  buildProAlumniLead,
  countByFirstTeam,
  getProAlumniIndex,
  getProDraft,
  listProAlumni,
  proRegionCounts,
  topSchools,
} from "@/lib/pro-alumni";
import { getAllSchoolSlugs } from "@/lib/queries/schools";

/**
 * 公立高校出身のプロ野球選手（`/pro-players`）。**入口のページ。選手の一覧は地区ごとのページ**
 * （`/pro-players/<地方>`）に分けてある。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-11-25。運営者の指示）
 *
 *   「公立高校 → プロ野球」は、このサイトの主題（公立を応援する）そのもの。高校から直接入った選手も、
 *   大学や社会人野球を経て入った選手も載せる。各学校のページにも同じ選手を卒業生として出す。
 *   ★**選手ごとの個別ページは作らない**（運営者の回答。「個人のページは作らない」方針の最小の例外）。
 *   ★**載せるのは事実だけ**: 氏名・進路・在籍した球団と年・入団年とドラフト順位。
 *     **成績・写真・生年月日は載せない。**
 *
 * ★★ なぜ地区ごとに分けたか
 *   全員を1ページに並べると **HTML が約3MB**になり、**Googlebot が読み込む上限（約2MB）を超える**
 *   （後ろの地区が検索に載らない）。**運営者の「一覧ページ1枚」から外れる判断。** 地方区分8ページに分けた。
 *
 * ★ 数え方は「記事のある選手のうち」。**プロ野球選手の全員ではない**ので、
 *   **「◯人しかいない」「公立出身は◯人」とは書かない**（読み方の注記と `buildProAlumniLead`）。
 * ★ 転校した選手（経歴に高校が2校以上）は、**どちらを卒業したか読み取れない**ので載せていない。
 * ★ 学校ページは**公開済みの学校にだけ**張る（`getAllSchoolSlugs`）。閉校した公立校は校名だけ出す。
 */
export const revalidate = 3600;

const TITLE = "公立高校出身のプロ野球選手一覧｜高校から直接・大学・社会人経由";

async function loadSlugs(): Promise<Set<string>> {
  try {
    return new Set(await getAllSchoolSlugs());
  } catch {
    // 学校の一覧が取れない日があっても、ページは落とさない（リンクを張らないだけ）
    return new Set();
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [listing, index] = await Promise.all([listProAlumni(), getProAlumniIndex()]);
  const description = buildProAlumniLead(listing, index.firstYear).slice(0, 1).join("");
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/pro-players" },
    openGraph: { type: "website", title: `${TITLE}｜公立応援団`, description },
  };
}

export default async function ProPlayersPage() {
  const [listing, index, slugs, regions] = await Promise.all([
    listProAlumni(),
    getProAlumniIndex(),
    loadSlugs(),
    proRegionCounts(),
  ]);
  const lead = buildProAlumniLead(listing, index.firstYear);
  const draft = getProDraft();
  const top = topSchools(listing, 20);
  const teams = countByFirstTeam(listing);
  // 所在地が分からない閉校校（地方区分に入らない）。数が少ないのでここに置く
  const others = listing.prefs.filter((p) => !PRO_PREF_NAME.has(p.pref));

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "公立高校出身のプロ野球選手" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">高校から直接・大学・社会人野球を経て</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          公立高校出身のプロ野球選手
        </h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <KoshienStat label="載せている選手" value={`${listing.totalPlayers}`} unit="人" accent />
          <KoshienStat label="出身の高校" value={`${listing.totalSchools}`} unit="校" />
          <KoshienStat label="地方" value={`${regions.filter((r) => r.players > 0).length}`} unit="地方" />
        </dl>
        <nav aria-label="地方ごとの一覧" className="mt-4">
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {regions.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/pro-players/${r.slug}`}
                  className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3 text-ink hover:bg-navy-50"
                >
                  <span className="font-bold text-navy-800">{r.region}</span>
                  <span className="text-xs text-ink-muted">{r.players}人</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <LeadText paragraphs={lead} />

      <section
        aria-label="この一覧の読み方"
        className="mt-4 rounded-xl border border-line bg-navy-50/40 p-4 text-xs leading-relaxed text-ink-muted"
      >
        <p className="flex gap-2">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint" />
          <span>
            Wikipedia に記事のある選手のうち、{index.firstYear}年のドラフト開始以降にプロ入りし、経歴欄から公立
            （国立・高専を含む私立以外）の高校の出身と読み取れた選手を載せています。
            プロ野球選手の全員ではありません。高校を2校以上経歴に載せている選手（転校）は、
            どちらを卒業したか読み取れないため載せていません。
            進路は「高校 → 大学・社会人 → 球団」の順です。独立リーグや海外の球団も、在籍した球団として載せています。
            成績・写真・生年月日は載せていません。
          </span>
        </p>
      </section>

      {/*
        ★**ドラフトで指名された高校3年生は、指名の時点から載せる**（運営者の判断。2026-11-25）。
        ★未成年の個人名が載るので、**書くのは指名した球団と順位だけ**（成績・進路の見込みなどは書かない）。
        ★入団が決まれば選手の記事ができ、地方ごとの一覧に移る（ここからは外れる）。
      */}
      {draft.picks.length > 0 && draft.year !== null && (
        <section
          id="draft"
          aria-labelledby="h-draft"
          className="mt-4 scroll-mt-4 rounded-xl border border-accent-200 bg-accent-50/40 p-5"
        >
          <SectionHeading
            id="h-draft"
            title={`${draft.year}年のドラフトで指名された公立高校の高校生`}
            note={`${draft.picks.length}人`}
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            入団前の選手です。指名した球団と順位だけを載せています。
          </p>
          <ul className="mt-2 divide-y divide-line">
            {draft.picks.map((d) => (
              <li key={`${d.name}-${d.team}`} className="py-1.5 text-sm leading-relaxed">
                <span className="font-bold text-navy-800">{d.name}</span>
                <span className="ml-2 text-ink">
                  {d.team} {d.rank}
                </span>
                <span className="ml-2 text-xs text-ink-muted">
                  {slugs.has(d.school.slug) ? (
                    <Link href={`/schools/${d.school.slug}`} className="text-accent-800 hover:underline">
                      {d.school.officialName}
                    </Link>
                  ) : (
                    d.school.officialName
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------- 選手の多い高校 ------- */}
      <section aria-labelledby="h-top" className="mt-4 rounded-xl border border-line bg-white p-5">
        <SectionHeading id="h-top" title="プロ野球選手が多い公立高校" note="上位20校（記事のある選手の数）" />
        <ol className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {top.map((s, i) => (
            <li key={s.slug ?? s.officialName} className="flex items-baseline gap-2 border-b border-line py-1.5 text-sm">
              <span className="w-6 shrink-0 text-right text-xs text-ink-muted">{i + 1}</span>
              {s.slug !== null && slugs.has(s.slug) ? (
                <Link href={`/schools/${s.slug}`} className="font-bold text-accent-800 hover:underline">
                  {s.officialName}
                </Link>
              ) : (
                <span className="font-bold text-navy-800">{s.officialName}</span>
              )}
              <span className="ml-auto shrink-0 text-xs text-ink-muted">{s.players.length}人</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-faint">
          人数は載せている選手の数で、実際のプロ野球選手の数ではありません。順位ではなく、記事のある選手の多い順です。
        </p>
      </section>

      {/* ------- 入団した球団 ------- */}
      <section aria-labelledby="h-teams" className="mt-4 rounded-xl border border-line bg-white p-5">
        <SectionHeading id="h-teams" title="入団した球団ごとの人数" note="最初に入団したNPBの球団" />
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {teams.map(([team, n]) => (
            <li key={team} className="rounded-lg border border-line px-3 py-1.5">
              <span className="font-bold text-navy-800">{team}</span>
              <span className="ml-1.5 text-xs text-ink-muted">{n}人</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ------- 地方ごとの一覧へ ------- */}
      <section aria-labelledby="h-regions" className="mt-4 rounded-xl border border-line bg-white p-5">
        <SectionHeading id="h-regions" title="地方ごとの選手一覧" />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {regions.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/pro-players/${r.slug}`}
                className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
              >
                <span className="font-bold text-accent-800">{r.region}の公立高校出身の選手</span>
                <span className="text-xs text-ink-muted">
                  {r.schools}校・{r.players}人
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 && <ProPrefSections prefs={others} slugs={slugs} />}

      <AdSlot slot="sidebar" />

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        出典：Wikipedia（日本語版）の選手の記事と、ドラフト会議の記事。選手の氏名・進路・入団年・ドラフト順位の事実だけを
        取り出して掲載しています。内容に誤りがあればお知らせください。
      </p>
    </Container>
  );
}
