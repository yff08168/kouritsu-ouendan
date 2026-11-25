import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { KoshienStat } from "@/components/results/KoshienStat";
import { ProPrefSections } from "@/components/pro/ProPrefSections";

import { REGIONS } from "@/lib/constants";
import {
  PRO_PREF_NAME,
  PRO_REGION_SLUGS,
  getProAlumniIndex,
  listProAlumni,
  prefSlugsOfRegion,
  regionFromSlug,
  topSchools,
} from "@/lib/pro-alumni";
import { getAllSchoolSlugs } from "@/lib/queries/schools";

/**
 * 地方ごとの、公立高校出身のプロ野球選手（`/pro-players/<地方>`）。
 *
 * ★**ここが選手の一覧の本体**（トップは入口と集計）。1ページに全員を並べると HTML が約3MBになり、
 *   Googlebot の読み込み上限（約2MB）を超えるので、地方区分8つに分けた。
 * ★**リード文は持っているデータの並べ替えだけ**（人数・校数・多い高校）。
 *   **「いない」とは書かない**（0人の地方は、そもそもページを作らない）。
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return REGIONS.map((r) => ({ region: PRO_REGION_SLUGS[r] }));
}

async function loadSlugs(): Promise<Set<string>> {
  try {
    return new Set(await getAllSchoolSlugs());
  } catch {
    return new Set();
  }
}

type Props = { params: Promise<{ region: string }> };

async function load(slug: string) {
  const region = regionFromSlug(slug);
  if (!region) return null;
  const index = await getProAlumniIndex();
  const prefSlugs = prefSlugsOfRegion(region).filter((p) => index.prefs[p]);
  if (prefSlugs.length === 0) return null;
  const listing = await listProAlumni(prefSlugs);
  if (listing.totalPlayers === 0) return null;
  // 北から南の順（`prefSlugsOfRegion` の並び）
  const order = new Map(prefSlugs.map((p, i) => [p, i]));
  const prefs = [...listing.prefs].sort((a, b) => (order.get(a.pref) ?? 0) - (order.get(b.pref) ?? 0));
  return { region, listing, prefs, firstYear: index.firstYear };
}

function leadOf(region: string, data: NonNullable<Awaited<ReturnType<typeof load>>>): string[] {
  const { listing, firstYear } = data;
  const top = topSchools(listing, 3);
  const out = [
    `${region}の公立（国立・高専を含む）の高校を出て、${firstYear}年のドラフト開始以降にプロ野球に入った選手のうち、` +
      `Wikipedia に記事のある選手を ${listing.totalSchools}校・${listing.totalPlayers}人 載せています。` +
      `高校から直接入った選手も、大学や社会人野球を経て入った選手も含みます。`,
  ];
  if (top.length > 0 && top[0].players.length >= 2) {
    out.push(`選手が多い高校は ${top.map((s) => `${s.officialName}（${s.players.length}人）`).join("、")} です。`);
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region: slug } = await params;
  const data = await load(slug);
  if (!data) return {};
  const title = `${data.region}の公立高校出身のプロ野球選手一覧｜高校別・進路・入団球団`;
  const description = leadOf(data.region, data).slice(0, 1).join("");
  return {
    title,
    description,
    alternates: { canonical: `/pro-players/${slug}` },
    openGraph: { type: "website", title: `${title}｜公立応援団`, description },
  };
}

export default async function ProPlayersRegionPage({ params }: Props) {
  const { region: slug } = await params;
  const [data, slugs] = await Promise.all([load(slug), loadSlugs()]);
  if (!data) notFound();
  const lead = leadOf(data.region, data);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "公立高校出身のプロ野球選手", href: "/pro-players" },
          { label: data.region },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">高校から直接・大学・社会人野球を経て</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          {data.region}の公立高校出身のプロ野球選手
        </h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <KoshienStat label="載せている選手" value={`${data.listing.totalPlayers}`} unit="人" accent />
          <KoshienStat label="出身の高校" value={`${data.listing.totalSchools}`} unit="校" />
          <KoshienStat label="地区" value={`${data.prefs.length}`} unit="地区" />
        </dl>
        <nav aria-label="このページの中" className="mt-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            {data.prefs.map((p) => (
              <li key={p.pref}>
                <a
                  href={`#pref-${p.pref}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-ink hover:bg-navy-50"
                >
                  {PRO_PREF_NAME.get(p.pref) ?? "その他"}
                  <span className="ml-1 text-xs text-ink-muted">{p.players}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-3 text-xs text-ink-muted">
          <Link href="/pro-players" className="text-accent-800 hover:underline">
            ほかの地方と、選手の多い高校・球団別の人数はトップへ
          </Link>
        </p>
      </header>

      <LeadText paragraphs={lead} />

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Wikipedia に記事のある選手のうち、経歴欄から公立の高校の出身と読み取れた選手です（プロ野球選手の全員ではありません）。
        転校した選手は、どちらを卒業したか読み取れないため載せていません。進路は「高校 → 大学・社会人 → 球団」の順で、
        独立リーグや海外の球団も在籍した球団として載せています。成績・写真・生年月日は載せていません。
      </p>

      <ProPrefSections prefs={data.prefs} slugs={slugs} />

      <AdSlot slot="sidebar" />

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        出典：Wikipedia（日本語版）の選手の記事と、ドラフト会議の記事。選手の氏名・進路・入団年・ドラフト順位の事実だけを
        取り出して掲載しています。内容に誤りがあればお知らせください。
      </p>
    </Container>
  );
}
