import type { Metadata } from "next";
import Link from "next/link";
import { Info, Swords } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import { listRivalriesByDistrict } from "@/lib/records";
import { RANKING_BY_SLUG } from "@/lib/constants";

/**
 * よく当たるカード（`/rankings/rivalries`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-08-29）
 *
 *   `/vs/<A>/<B>` の対戦ページは7,000組ぶん作れるのに、
 *   **入口が学校ページの中にしか無い。** sitemap にも3回以上の組しか載せていない。
 *   ★**この一覧はそこへの入口**であり、
 *   ★**「◯◯ 対 △△」という検索**の受け皿でもある。
 *
 * ------------------------------------------------------------------
 * ★★**「◯勝◯敗」と書かない。両側の勝った数で書く**（`head-to-head.ts` と同じ）。
 * ★**引き分けは別に数える**（引き分け再試合があるので「負け」に混ぜない）。
 */
export const revalidate = 3600;

const meta = RANKING_BY_SLUG.get("rivalries");

export const metadata: Metadata = {
  title: meta?.title ?? "よく当たるカード",
  description: meta?.description,
  alternates: { canonical: "/rankings/rivalries" },
};

export default async function RivalriesPage() {
  const groups = await listRivalriesByDistrict(5);
  const total = groups.reduce((n, g) => n + g.rivalries.length, 0);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "よく当たるカード" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">記録</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          よく当たるカード
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          収録している地方大会の中で、
          <strong className="font-bold">同じ組み合わせが何度も実現した対戦</strong>
          を、都道府県ごとに多い順で並べています。校名を押すと、その2校の
          全対戦を並べたページへ進めます。
        </p>
      </header>

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
              公立どうしの対戦だけを数えています。
            </strong>
            学校マスタに公立として載っている2校が当たった試合が対象で、
            私立との対戦は含みません。
          </li>
          <li>
            <strong className="text-ink">
              収録できている大会の中での回数です。
            </strong>
            都道府県によってさかのぼれる年が違うので、実際の対戦回数とは異なります。
          </li>
          <li>
            <strong className="text-ink">
              全国を1つの順位にしていません。
            </strong>
            さかのぼれる年数が都道府県で大きく違うため、全国で並べると
            「対戦の多さ」ではなく「収録の深さ」の順位になってしまいます。
          </li>
          <li>
            引き分けは勝った数に含めず、別に数えています（高校野球には
            引き分け再試合があるため）。
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
          title="対戦の多い組み合わせ"
          icon={<Swords size={18} />}
          note={`${groups.length}都道府県・${total}組`}
        />

        {total === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            まだ3回以上当たっている組み合わせがありません。
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {groups.map((g) => (
              <div key={g.districtSlug}>
                <h3 className="text-sm font-bold text-navy-800">
                  <Link
                    href={`/prefectures/${g.districtSlug}`}
                    className="hover:underline"
                  >
                    {g.district}
                  </Link>
                </h3>
                <ul className="mt-2 divide-y divide-line">
                  {g.rivalries.map((r) => (
                    <li key={r.href} className="py-3">
                      <Link
                        href={r.href}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-1 hover:underline"
                      >
                        <span className="font-bold text-navy-800">{r.a.name}</span>
                        <span className="text-xs text-ink-faint">vs</span>
                        <span className="font-bold text-navy-800">{r.b.name}</span>
                        <span className="ml-auto shrink-0 text-sm font-bold text-accent-800">
                          {r.meetings}回
                        </span>
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {r.a.name} {r.aWins}勝・{r.b.name} {r.bWins}勝
                        {r.draws > 0 && `・引き分け${r.draws}`}
                      </p>
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
