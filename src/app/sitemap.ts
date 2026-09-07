import type { MetadataRoute } from "next";
import { SITE, ALL_DISTRICT_SLUGS, PREFECTURES, RANKINGS } from "@/lib/constants";
import { getAllSchoolSlugs, getIndexableSchoolSlugs } from "@/lib/queries/schools";
import { getAllNewsSlugs } from "@/lib/queries/news";
import { getAllPhenomenonSlugs } from "@/lib/queries/phenomena";
import { getAllFeatureSlugs } from "@/lib/queries/features";
import { getRegionalDistrict } from "@/lib/regional-results";
import { listTournaments } from "@/lib/regional-tournaments";
import { livePrefectures } from "@/lib/live/hsb";
import {
  listJinguTournaments,
  listKoshienTournaments,
} from "@/lib/national-tournaments";
import { vsPath } from "@/lib/head-to-head";
import { getRegionalSchoolSlugs } from "@/lib/school-index";
import { listArchiveYears } from "@/lib/archive";

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
  const [
    koshienSchoolSlugs,
    regionalSchoolSlugs,
    publishedSchoolSlugs,
    newsSlugs,
    phenomenonSlugs,
    featureSlugs,
  ] = await Promise.all([
    // 甲子園出場歴のある学校（678校）
    getIndexableSchoolSlugs(),
    // ★**地方大会に出ている学校**（2,184校。2026-08-28 追加）
    getRegionalSchoolSlugs(),
    // ★**公開中の学校**（RLS が draft を返さない）。下の絞り込みに使う
    getAllSchoolSlugs(),
    getAllNewsSlugs(),
    getAllPhenomenonSlugs(),
    getAllFeatureSlugs(),
  ]);

  /*
    ★★**sitemap に載せる学校と、noindex にしない学校を一致させる。**
    判定の規則は `lib/school-index.ts` の `isIndexableSchool` にあり、
    学校ページもそれを見ている。**ここで条件を書き足さないこと** ——
    食い違うと「sitemap に載っているのに noindex」という矛盾になる。

    ★**重複を除く。** 甲子園出場歴があって地方大会にも出ている学校は多い。

    ★★**公開中の学校だけに絞る。** 地方大会の生成物は**生成した時点の
    学校マスタ**と突き合わせた slug を持っているので、その後
    `status = 'draft'` にした学校（硬式野球部が無いと分かった学校）の slug が
    残りうる。**そのまま載せると404のURLを検索エンジンに知らせることになる。**
  */
  const published = new Set(publishedSchoolSlugs);
  const schoolSlugs = [...new Set([...koshienSchoolSlugs, ...regionalSchoolSlugs])]
    .filter((slug) => published.has(slug))
    .sort();

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
    // 全国大会（2026-08-26 追加）。大会ごとのページは下の nationalPages
    { url: url("/koshien"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/jingu"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // 地方大会の進捗。大会中は毎日変わる
    { url: url("/regional"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    /*
      ★★**試合速報**（2026-09-05 追加）。**中身は毎日入れ替わるがURLは固定**なので、
      `changeFrequency: "daily"` で載せる（新聞の速報面と同じ扱い）。
      ★★**試合ごとのページ（`/live/<県>/<token>`）は載せない** ——
      **トークンに期限が入っており、URLが数時間で無効になる。** あちらは `noindex`。
    */
    { url: url("/live"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...livePrefectures().map((p) => ({
      url: url(`/live/${p.slug}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // ★**年別アーカイブ**（2026-08-29 追加）。年ページは下でまとめて足す
    { url: url("/archive"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
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

  // ★**地方大会だけの2地区（北海道・東京）も載せる**（2026-09-05 その2）
  const prefecturePages: MetadataRoute.Sitemap = ALL_DISTRICT_SLUGS.map((slug) => ({
    url: url(`/prefectures/${slug}`),
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
      ALL_DISTRICT_SLUGS.map(async (slug) => {
        const district = await getRegionalDistrict(slug);
        if (!district) return [];
        return listTournaments(district).map((t) => ({
          url: url(`/prefectures/${slug}/${t.slug}`),
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
      }),
    )
  ).flat();

  /*
    ★**全国大会の大会ページ**（2026-08-26 追加）。
    「1985年 甲子園」「第90回選抜」のような検索に当たるのはこちらなので、
    一覧だけでなく1大会ずつ載せる。甲子園190件＋神宮24件。
    ★**生成物を読むだけ**なのでDBには当たらない。
  */
  const nationalPages: MetadataRoute.Sitemap = [
    ...listKoshienTournaments().map((t) => ({
      url: url(`/koshien/${t.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...listJinguTournaments().map((t) => ({
      url: url(`/jingu/${t.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  /*
    ★**年別アーカイブの年ページ**（2026-08-29 追加）。
    ★**地方大会がある年だけ**（`listArchiveYears`）。甲子園だけの年は作っていない
    ので、ここで年を組み立てないこと（ページの無いURLを検索エンジンに知らせることになる）。
  */
  const archivePages: MetadataRoute.Sitemap = (await listArchiveYears()).map((y) => ({
    url: url(`/archive/${y.year}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  /*
    ★**直接対決のページ**（2026-08-26 追加）。
    ★★**全部は載せない。** 公立どうしの組は**21,387**あり、
    1回しか当たっていない組（14,849）は**その1試合しか中身が無く、
    試合ごとのページと重なる。** 自分から薄いページを知らせない。
    ★**ページ自体は1回でも当たっていれば開ける**（ISRで作る）。

    ------------------------------------------------------------------
    ★★★**しきい値を 3回以上 → 2回以上 に下げた**（2026-09-07。Search Console のデータ）。

    **この形はいちばん当たっている** —— 表示129回でクリック9・**CTR 6.98%・平均7.2位**
    （学校 1.83%・大会 0.43% に対して桁が違う）。`/vs/akaho/inakita` は
    **23表示で5クリック＝21.7%**。**「◯◯高校 ◯◯高校」という検索と中身がぴったり合う。**

    ★**2回の組は 4,026 増える**（2,512 → 6,538）。**2試合＋通算成績があり、
    3回の組と中身の作りは同じ**なので、薄いページを足すことにはならない。
    ★**1回の組までは広げない**（上の理由）。
    ★**戻すならここの数字だけ。**
  */
  const versusPages: MetadataRoute.Sitemap = (
    await Promise.all(
      PREFECTURES.map(async (p) => {
        const district = await getRegionalDistrict(p.slug);
        if (!district) return [];
        const pairs = new Map<string, number>();
        for (const game of district.games) {
          const [x, y] = game.teams;
          if (!x?.slug || !y?.slug || x.combined || y.combined) continue;
          const key = [x.slug, y.slug].sort().join("	");
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
        return [...pairs.entries()]
          .filter(([, n]) => n >= 2)
          .map(([key]) => {
            const [x, y] = key.split("	");
            return {
              url: url(vsPath(x, y)),
              lastModified: now,
              changeFrequency: "monthly" as const,
              priority: 0.5,
            };
          });
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
    ...nationalPages,
    ...archivePages,
    ...versusPages,
    ...schoolPages,
    ...phenomenonPages,
    ...featurePages,
  ];
}
