import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import { GUIDES } from "@/lib/content/guides";
import { formatDateLong, toDateAttr } from "@/lib/utils";

/**
 * ルールと制度の解説の一覧（`/guide`）。
 *
 * ★★**一般的な野球のルール解説は置かない**（2026-09-21。運営者の判断）。
 *   キーワードプランナーで「野球 ルール 初心者」は月に百未満で、主題からも離れる。
 *   ここにあるのは**高校野球・地方大会・公立に固有のルールと制度**だけ。
 * ★**入口はフッター**（`NAV` は1024pxで満杯。年別アーカイブと同じ扱い）。
 */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "高校野球のルールと制度の解説",
  description:
    "コールドゲーム、延長とタイブレーク、球数制限、バットの規定、選抜の出場校の決め方、7回制と指名打者。高校野球と地方大会に固有の決まりを、日本高野連の規則と大会要項に基づいて説明します。各ページに基づく規則の年度と最終確認日を付けています。",
  alternates: { canonical: "/guide" },
};

export default function GuideIndexPage() {
  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "ルールと制度の解説" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">解説</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          高校野球のルールと制度
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          高校野球と地方大会に固有の決まりを、日本高野連の高校野球特別規則と大会要項に基づいて説明しています。
          規則は毎年変わるので、各ページに<strong className="font-bold">基づく規則の年度</strong>と
          <strong className="font-bold">最終確認日</strong>を付けています。
          数字の裏づけは、このサイトが持っている試合の記録から描くたびに数え直しています。
        </p>
      </header>

      <section
        aria-labelledby="guide-list"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="guide-list" title="解説をえらぶ" icon={<BookOpen size={18} />} />
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guide/${g.slug}`}
                className="flex h-full flex-col rounded-lg border border-line p-4 hover:bg-navy-50"
              >
                <span className="text-base font-bold text-navy-800">{g.title}</span>
                <span className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">
                  {g.lead[0]}
                </span>
                <span className="mt-3 text-xs text-ink-faint">
                  最終確認{" "}
                  <time dateTime={toDateAttr(g.checkedOn)}>{formatDateLong(g.checkedOn)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}
