import type { Metadata } from "next";
import { MapPinned } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { PrefectureMap } from "@/components/schools/PrefectureMap";
import { getSchoolCountByPrefecture } from "@/lib/queries/schools";
import {
  getKoshienDataset,
  latestPublicByPrefecture,
} from "@/lib/queries/rankings";
import { PREFECTURES, REGIONS } from "@/lib/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "都道府県から公立高校を探す",
  description:
    "47都道府県から公立高校・国立高校・高専を探せます。地域ごとの注目校、地方大会のニュース、公立旋風もまとめて確認できます。",
  alternates: { canonical: "/prefectures" },
};

export default async function PrefecturesPage() {
  const [counts, koshien] = await Promise.all([
    getSchoolCountByPrefecture(),
    getKoshienDataset(),
  ]);
  const totalSchools = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const latestByPrefecture = latestPublicByPrefecture(koshien.schools);
  // 「今年」は今日の日付ではなく、出場歴が入っている最も新しい年で決める（トップと同じ）
  const thisYear = koshien.latestYear;
  const bothSeasons = Object.values(latestByPrefecture).filter(
    (entry) =>
      thisYear != null &&
      entry.spring?.year === thisYear &&
      entry.summer?.year === thisYear,
  ).length;

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "都道府県" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <MapPinned size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            都道府県から公立高校を探す
          </h1>
        </div>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          地図から選んでください。マスの中は、春・夏それぞれで
          <strong className="text-ink">その地区から最後に甲子園へ出た公立校</strong>
          です（右肩の数字は掲載している学校数）。
          現在 <strong className="text-ink">{totalSchools}</strong> 校を掲載しています。
        </p>

        <div className="mt-6">
          <PrefectureMap
            counts={counts}
            latest={latestByPrefecture}
            highlightYear={thisYear}
          />
        </div>

        {thisYear != null && (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-6 rounded-sm border border-accent-500 bg-accent-50"
            />
            <span>
              {thisYear}年の春夏そろって公立校が出場した地区
              {bothSeasons > 0 ? `（${bothSeasons}地区）` : "（まだありません）"}
            </span>
          </p>
        )}

        <p className="mt-3 text-center text-xs text-ink-faint">
          ※ 甲子園の大会区分（49地区）で並べた図です。実際の県の形や面積とは異なります。
          <br />
          校名は<strong className="font-medium">公立・国立・高専のみ</strong>を対象にしています。私立を含む代表校ではありません。
        </p>
      </header>

      {/* 地図が使いにくい環境のために、地方別の一覧も用意する */}
      <section
        aria-labelledby="prefecture-index"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="prefecture-index" className="text-sm font-bold text-navy-800">
          地方から探す
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {REGIONS.map((region) => (
            <div key={region}>
              <h3 className="border-b border-line pb-1.5 text-xs font-bold text-navy-700">
                {region}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {PREFECTURES.filter((p) => p.region === region).map((p) => (
                  <li key={p.slug}>
                    <a
                      href={`/prefectures/${p.slug}`}
                      className="inline-flex items-center gap-1.5 text-sm text-ink hover:text-navy-800 hover:underline"
                    >
                      {p.name}
                      {(counts[p.slug] ?? 0) > 0 && (
                        <span className="text-xs text-accent-800">
                          {counts[p.slug]}校
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Container>
  );
}
