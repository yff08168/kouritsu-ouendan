import type { Metadata } from "next";
import { MapPinned } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { PrefectureMap } from "@/components/schools/PrefectureMap";
import { getSchoolCountByPrefecture } from "@/lib/queries/schools";
import { PREFECTURES, REGIONS } from "@/lib/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "都道府県から公立高校を探す",
  description:
    "47都道府県から公立高校・国立高校・高専を探せます。地域ごとの注目校、地方大会のニュース、公立旋風もまとめて確認できます。",
  alternates: { canonical: "/prefectures" },
};

export default async function PrefecturesPage() {
  const counts = await getSchoolCountByPrefecture();
  const totalSchools = Object.values(counts).reduce((sum, n) => sum + n, 0);

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
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          地図から選んでください。数字はそれぞれの都道府県に掲載している学校数です。
          現在 <strong className="text-ink">{totalSchools}</strong> 校を掲載しています。
        </p>

        <div className="mt-6">
          <PrefectureMap counts={counts} />
        </div>

        <p className="mt-5 text-center text-xs text-ink-faint">
          ※ 位置関係がわかるように並べた図です。実際の県の形や面積とは異なります。
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
