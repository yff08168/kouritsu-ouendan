import type { MetadataRoute } from "next";
import { SITE, PREFECTURES, RANKINGS } from "@/lib/constants";
import { getIndexableSchoolSlugs } from "@/lib/queries/schools";
import { getAllNewsSlugs } from "@/lib/queries/news";
import { getAllPhenomenonSlugs } from "@/lib/queries/phenomena";
import { getAllFeatureSlugs } from "@/lib/queries/features";
import { getRegionalDistrict } from "@/lib/regional-results";
import { listTournaments } from "@/lib/regional-tournaments";

// sitemapもISRで作り直す。記事を追加したときに反映されるようにする。
export const revalidate = 3600;

const url = (path: string) => new URL(path, SITE.url).toString();

/**
 * sitemap.xml をDBから動的に生成する。
 *
 * 非公開のコンテンツはRLSで取得できないため、下書き記事のURLが
 * sitemapに載ることはない（アプリ側でstatusを除外する必要がない）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [schoolSlugs, newsSlugs, phenomenonSlugs, featureSlugs] =
    await Promise.all([
      // 甲子園出場歴のある学校だけ。出場歴の無い学校は noindex にしている。
      getIndexableSchoolSlugs(),
      getAllNewsSlugs(),
      getAllPhenomenonSlugs(),
      getAllFeatureSlugs(),
    ]);

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    /*
      ★**`/news` は 2026-08-24 に sitemap から外した**（運営者の判断。運用予定が無い）。
      **記事が0件の一覧を検索エンジンに知らせない。**
      始めるときはこの行と、下の `newsPages` を戻す。
      { url: url("/news"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    */
    { url: url("/schools"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/rankings"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/phenomenon"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/features"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: url("/prefectures"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // 地方大会の進捗。大会中は毎日変わる
    { url: url("/regional"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: url("/about"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/contact"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: url("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];

  // ランキングは検索条件（?season= など）を持つが、正規URLは条件なしの形にしてある。
  // sitemap にも条件なしだけを載せる。
  const rankingPages: MetadataRoute.Sitemap = RANKINGS.map((r) => ({
    url: url(`/rankings/${r.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const prefecturePages: MetadataRoute.Sitemap = PREFECTURES.map((p) => ({
    url: url(`/prefectures/${p.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  /*
    ★**大会ごとのページ**（2026-08-24 追加）。
    「◯◯県 高校野球 2025 秋」のような検索に当たるのはこちらなので、
    県のページだけでなく1大会ずつ載せる。実測150件ほど。
    ★**`getRegionalDistrict` は県ごとの動的 import** なので、
    ここで全県を読んでも他のページには入らない。
  */
  const tournamentPages: MetadataRoute.Sitemap = (
    await Promise.all(
      PREFECTURES.map(async (p) => {
        const district = await getRegionalDistrict(p.slug);
        if (!district) return [];
        return listTournaments(district).map((t) => ({
          url: url(`/prefectures/${p.slug}/${t.slug}`),
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
      }),
    )
  ).flat();

  const schoolPages: MetadataRoute.Sitemap = schoolSlugs.map((slug) => ({
    url: url(`/schools/${slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // ★**ニュースは sitemap から外してある**（上の staticPages の注記を読むこと）。
  //   `getAllNewsSlugs` は残してあるので、戻すのはここを使う側だけ。
  void newsSlugs;

  const phenomenonPages: MetadataRoute.Sitemap = phenomenonSlugs.map((slug) => ({
    url: url(`/phenomenon/${slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const featurePages: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: url(`/features/${slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...rankingPages,
    ...prefecturePages,
    ...tournamentPages,
    ...schoolPages,
    ...phenomenonPages,
    ...featurePages,
  ];
}
