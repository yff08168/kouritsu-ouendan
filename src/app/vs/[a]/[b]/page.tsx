import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListOrdered, Swords } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { MeetingList } from "@/components/schools/MeetingList";

import { getSchoolBySlug } from "@/lib/queries/schools";
import { getRegionalDistrict } from "@/lib/regional-results";
import { headToHead, vsPath } from "@/lib/head-to-head";
import { shortSchoolName } from "@/lib/school-name";

/**
 * 2校の直接対決（`/vs/<slugA>/<slugB>`）。
 *
 * ------------------------------------------------------------------
 * ★★ 静的生成しない（`generateStaticParams` を置かない）
 *
 *   公立どうしの組は**7,563組**あり、全部を静的に作ると
 *   ビルドが跳ね上がる。かといって「3回以上戦った組だけ作る」にすると、
 *   ★**学校ページから張ったリンクの大半が404になる**（学校ページは
 *   1回でも当たった相手を並べるため）。
 *   **必要になったときに作って寝かせる**（ISR）ほうが、
 *   リンクが切れず、ビルドも太らない。
 *
 *   ★**sitemap には「よく当たる組」だけ載せている**（`app/sitemap.ts`）。
 *
 * ------------------------------------------------------------------
 * ★ URLは slug を辞書順に並べた1通りだけ
 *
 *   A対BとB対Aで同じ中身のページが2つできると、
 *   検索エンジンから見て重複になる。**リンクは必ず `vsPath()` で作る。**
 */
export const revalidate = 3600;

type Props = {
  params: Promise<{ a: string; b: string }>;
};

/**
 * このページで使う校名。
 *
 * ★★**同じ校名の2校がある**（岐阜商業・和歌山・船橋…県立と市立）。
 * 学校マスタの `name` はどちらも「岐阜商業高校」なので、
 * **そのまま並べると「岐阜商業高校 vs 岐阜商業高校」になる。**
 * ★**ぶつかったときだけ正式名に落とす**（「岐阜県立岐阜商業高等学校」）。
 * ★**短い校名（`shortSchoolName`）は見出しに使わない**（AGENTS.md）。
 * 試合の一覧だけは幅が要るので短い校名を使っている。
 */
function labelsOf(
  a: { name: string; officialName: string },
  b: { name: string; officialName: string },
) {
  return a.name === b.name
    ? { a: a.officialName, b: b.officialName }
    : { a: a.name, b: b.name };
}

async function load(aSlug: string, bSlug: string) {
  const [a, b] = await Promise.all([getSchoolBySlug(aSlug), getSchoolBySlug(bSlug)]);
  if (!a || !b || a.slug === b.slug) return null;

  /*
    ★**両校の県のファイルを読む。** 同じ県なら1つ。
    地区大会（九州地区大会など）の試合は、取ってきた県のファイルに入るので、
    **どちらの県から見ても拾えるように両方読む。**
  */
  const districts = await Promise.all(
    [...new Set([a.prefecture.slug, b.prefecture.slug])].map((slug) =>
      getRegionalDistrict(slug),
    ),
  );
  const regional = districts.flatMap((d) => d?.games ?? []);

  const record = headToHead({
    names: [a.name, a.officialName, shortSchoolName(a.name, a.slug)],
    slug: a.slug,
    pref: a.prefecture.name,
    regional,
  }).find((h) => h.slug === b.slug);

  return record ? { a, b, record } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { a: aSlug, b: bSlug } = await params;
  const found = await load(aSlug, bSlug);
  if (!found) return { title: "対戦の記録が見つかりません" };
  const { a, b, record } = found;

  const label = labelsOf(a, b);
  const title = `${label.a} vs ${label.b} 直接対決`;
  const description =
    `${label.a}と${label.b}の直接対決は通算${record.meetings.length}戦。` +
    `${label.a}が${record.wins}勝、${label.b}が${record.opponentWins}勝` +
    `${record.draws > 0 ? `、引き分け${record.draws}` : ""}。` +
    "甲子園・地方大会の全対戦の結果を載せています。";

  return {
    title,
    description,
    alternates: { canonical: vsPath(a.slug, b.slug) },
    openGraph: { type: "article", title: `${title}｜公立応援団`, description },
  };
}

export default async function VersusPage({ params }: Props) {
  const { a: aSlug, b: bSlug } = await params;
  const found = await load(aSlug, bSlug);
  if (!found) notFound();
  const { a, b, record } = found;

  const total = record.meetings.length;
  const label = labelsOf(a, b);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "公立高校", href: "/schools" },
          { label: label.a, href: `/schools/${a.slug}` },
          { label: `${label.b}との対戦` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">直接対決・通算成績</p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {label.a}　vs　{label.b}
        </h1>

        {/*
          ★**「◯勝◯敗」と書かない。** 両側の勝った数で書く
          （AGENTS.md「敗戦数を画面に出さない」）。
        */}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <Side school={a} label={label.a} wins={record.wins} />
          <div className="text-xs text-ink-faint">
            <p className="text-base font-bold text-navy-800">通算{total}戦</p>
            {record.draws > 0 && <p className="mt-1">引き分け {record.draws}</p>}
          </div>
          <Side school={b} label={label.b} wins={record.opponentWins} />
        </div>

        <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {record.byStage.koshien > 0 && <span>甲子園 {record.byStage.koshien}戦</span>}
          {record.byStage.jingu > 0 && <span>明治神宮 {record.byStage.jingu}戦</span>}
          {record.byStage.regional > 0 && (
            <span>地方大会 {record.byStage.regional}戦</span>
          )}
        </p>
      </header>

      <section
        aria-labelledby="vs-games"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="vs-games"
          title="全対戦"
          icon={<ListOrdered size={18} />}
          note="新しい順"
        />
        <div className="mt-3">
          <MeetingList
            meetings={record.meetings}
            leftName={shortSchoolName(a.name, a.slug)}
            rightName={shortSchoolName(b.name, b.slug)}
          />
        </div>
      </section>

      <AdSlot slot="sidebar" />

      <section
        aria-labelledby="vs-links"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="vs-links" title="この2校" icon={<Swords size={18} />} />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { school: a, name: label.a },
            { school: b, name: label.b },
          ].map(({ school, name }) => (
            <li key={school.slug}>
              <Link
                href={`/schools/${school.slug}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {name}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {school.prefecture.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

function Side({
  school,
  label,
  wins,
}: {
  school: { slug: string };
  label: string;
  wins: number;
}) {
  return (
    <div className="min-w-0">
      <Link
        href={`/schools/${school.slug}`}
        className="block truncate text-sm font-bold text-accent-800 hover:underline"
      >
        {label}
      </Link>
      <p className="mt-1 text-2xl font-bold tabular-nums text-navy-800 sm:text-3xl">
        {wins}
        <span className="ml-0.5 text-sm font-normal text-ink-muted">勝</span>
      </p>
    </div>
  );
}
