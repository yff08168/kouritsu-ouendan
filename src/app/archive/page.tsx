import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";

import { listArchiveYears } from "@/lib/archive";

/**
 * 年別アーカイブの一覧（`/archive`）。
 *
 * ★**役割は入口とハブ**。年ページ26枚と、その先の大会ページ602件へ配る。
 * ★**中身の説明は年ページ側にある**（ここで大会名まで並べると
 * 「同じリンクが2枚に並ぶ」だけで、どちらの評価も上がらない）。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "年別アーカイブ｜高校野球の記録を年でたどる",
  description:
    "地方大会と甲子園の記録を年ごとにまとめています。その年にどの都道府県でどんな大会が行われ、公立高校がどこまで勝ち上がったかを、全試合の結果とトーナメント表から辿れます。",
  alternates: { canonical: "/archive" },
};

export default async function ArchiveIndexPage() {
  const years = await listArchiveYears();

  const totalGames = years.reduce((n, y) => n + y.games, 0);
  const totalTournaments = years.reduce((n, y) => n + y.tournaments, 0);

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "年別アーカイブ" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">アーカイブ</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          年別アーカイブ
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          地方大会と甲子園の記録を、
          <strong className="font-bold">年ごと</strong>にまとめています。
          その年にどの都道府県でどんな大会が行われ、
          どの学校がどこまで勝ち上がったのかを、
          全試合の結果とトーナメント表から辿れます。
        </p>
        {years.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Stat label="収録した年" value={`${years.length}`} unit="年" />
            <Stat
              label="地方大会"
              value={totalTournaments.toLocaleString()}
              unit="大会"
            />
            <Stat
              label="収録した試合"
              value={totalGames.toLocaleString()}
              unit="試合"
            />
          </dl>
        )}
      </header>

      <section
        aria-labelledby="years"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="years"
          title="年をたどる"
          icon={<CalendarDays size={18} />}
          note="新しい順"
        />
        <ul className="mt-3 divide-y divide-line">
          {years.map((y) => (
            <li key={y.year}>
              <Link
                href={`/archive/${y.year}`}
                className="flex min-h-11 items-baseline gap-3 py-3 hover:bg-navy-50"
              >
                <span className="w-16 shrink-0 text-lg font-bold text-navy-800">
                  {y.year}
                </span>
                <span className="text-sm text-ink">
                  {y.districts}都道府県・{y.tournaments}大会
                  <span className="ml-2 text-ink-muted">
                    {y.games.toLocaleString()}試合
                  </span>
                </span>
                {/*
                  ★**甲子園があった年はそう書く。** 収録の薄い年との差が
                  ひと目で分かる（1915年からある甲子園と違い、
                  地方大会は年によって収録量が大きく違う）。
                */}
                {y.koshien.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs text-ink-faint">
                    甲子園{y.koshien.length}大会
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-line px-2 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <span className="text-xl font-bold text-navy-800 sm:text-2xl">{value}</span>
        <span className="ml-0.5 text-xs text-ink-muted">{unit}</span>
      </dd>
    </div>
  );
}
