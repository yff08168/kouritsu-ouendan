import type { MetadataRoute } from "next";
import { SITE, ALL_DISTRICT_SLUGS, PREFECTURES, RANKINGS } from "@/lib/constants";
import {
  getAllSchoolSlugs,
  getIndexableSchoolSlugs,
  getSchoolNameIndex,
} from "@/lib/queries/schools";
import { listPublicYearsWithEntrants } from "@/lib/koshien-public";
import { GUIDES } from "@/lib/content/guides";
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

  /*
    ★★★**`lastmod` には「ほんとうに変わった日」を書く**（2026-10-18。**検索に戻すための手当て**）。

    それまでは**11,779件のうち11,765件が「今日」**だった（毎回のビルドで `now` を入れていたため）。
    ★★**Google は当てにならない `lastmod` を無視する。**
    **9月29日〜10月11日の障害でクロールが1日480件から10〜50件まで落ちている**いま、
    **「どこを見に来ればよいか」を伝えられる数少ない手段**なのに、全部が「今日」では区別が付かない。
    ★**試合データから出せるものは出す**（地区・大会・学校・直接対決・甲子園・神宮）。
    ★★**分からないものは書かない**（`undefined`）——
    **1つでも当てにならない値があると、サイトマップ全体の `lastmod` が信用されなくなる。**
    ★**毎日中身が変わるページ**（トップ・速報・進捗地図）**だけは `now` が事実。**
  */
  const asDate = (iso: string | null | undefined): Date | undefined => {
    if (!iso) return undefined;
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    // ★**先の日付は書かない**（組み合わせ（未実施）の日付が混ざっても未来にならないように）
    return Number.isNaN(d.getTime()) ? undefined : d > now ? now : d;
  };
  const keepLatest = (into: Map<string, string>, key: string, date: string | null) => {
    if (!date) return;
    const cur = into.get(key);
    if (!cur || cur < date) into.set(key, date);
  };

  /*
    ★**県のファイルはここで1度だけ読む。** 大会ページ・直接対決・学校の3か所が
    同じ中身を見るので読み直さない（`getRegionalDistrict` は県ごとの動的 import）。
  */
  const districtEntries = await Promise.all(
    ALL_DISTRICT_SLUGS.map(async (slug) => [slug, await getRegionalDistrict(slug)] as const),
  );
  /** 地区 slug → その地区でいちばん新しい試合の日付 */
  const districtLast = new Map<string, string>();
  /** 学校 slug → その学校のいちばん新しい試合の日付 */
  const schoolLast = new Map<string, string>();
  for (const [slug, district] of districtEntries) {
    for (const game of district?.games ?? []) {
      if (!game.date) continue;
      keepLatest(districtLast, slug, game.date);
      for (const team of game.teams) {
        if (team.slug) keepLatest(schoolLast, team.slug, game.date);
      }
    }
  }
  const newest = (dates: (string | null | undefined)[]) =>
    asDate(dates.filter((d): d is string => Boolean(d)).sort().at(-1));
  /** 地方大会でいちばん新しい試合の日付（一覧ページ用） */
  const regionalLast = newest([...districtLast.values()]);

  // ★**全国大会は生成物を読むだけ**なので、ここで1度だけ組み立てて下でも使う
  const koshienTournaments = listKoshienTournaments();
  const jinguTournaments = listJinguTournaments();
  const nationalLast = newest(
    [...koshienTournaments, ...jinguTournaments].map((t) => t.lastDate),
  );
  /** 年（文字列） → その年の甲子園でいちばん新しい試合の日付 */
  const koshienYearLast = new Map<string, string>();
  for (const t of koshienTournaments) keepLatest(koshienYearLast, String(t.year), t.lastDate);

  const staticPages: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    /*
      ★**`/news` は 2026-08-24 に sitemap から外した**（運営者の判断。運用予定が無い）。
      **記事が0件の一覧を検索エンジンに知らせない。**
      始めるときはこの行と、下の `newsPages` を戻す。
      { url: url("/news"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    */
    { url: url("/schools"), lastModified: regionalLast, changeFrequency: "weekly", priority: 0.9 },
    // ★**順位・公立旋風・特集は「いつ変わったか」を持っていない**ので `lastmod` を書かない
    { url: url("/rankings"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/phenomenon"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/features"), changeFrequency: "weekly", priority: 0.7 },
    { url: url("/prefectures"), lastModified: regionalLast, changeFrequency: "monthly", priority: 0.7 },
    // 全国大会（2026-08-26 追加）。大会ごとのページは下の nationalPages
    { url: url("/koshien"), lastModified: nationalLast, changeFrequency: "monthly", priority: 0.8 },
    // ★**公立高校の甲子園出場校（年別）**（2026-09-21）。年ページは下の publicYearPages
    { url: url("/koshien/public"), lastModified: nationalLast, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/koshien/public/champions"), lastModified: nationalLast, changeFrequency: "monthly", priority: 0.7 },
    // ★**甲子園の歴代優勝校（私立も含む全大会）**（2026-09-21）
    { url: url("/koshien/champions"), lastModified: nationalLast, changeFrequency: "monthly", priority: 0.8 },
    // ★**ルールと制度の解説**（2026-09-21）。各ページは下の guidePages（`checkedOn` が最終確認日）
    {
      url: url("/guide"),
      lastModified: newest(GUIDES.map((g) => g.checkedOn)),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    { url: url("/jingu"), lastModified: nationalLast, changeFrequency: "monthly", priority: 0.6 },
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
    { url: url("/archive"), lastModified: regionalLast, changeFrequency: "weekly", priority: 0.7 },
    // ★**手で書く4ページは「いつ直したか」を持っていない**ので `lastmod` を書かない
    { url: url("/about"), changeFrequency: "yearly", priority: 0.3 },
    { url: url("/contact"), changeFrequency: "yearly", priority: 0.3 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.1 },
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.1 },
  ];

  // ランキングは検索条件（?season= など）を持つが、正規URLは条件なしの形にしてある。
  // sitemap にも条件なしだけを載せる。
  const rankingPages: MetadataRoute.Sitemap = RANKINGS.map((r) => ({
    url: url(`/rankings/${r.slug}`),
    lastModified: nationalLast,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // ★**地方大会だけの2地区（北海道・東京）も載せる**（2026-09-05 その2）
  const prefecturePages: MetadataRoute.Sitemap = ALL_DISTRICT_SLUGS.map((slug) => ({
    url: url(`/prefectures/${slug}`),
    lastModified: asDate(districtLast.get(slug)),
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
  const tournamentPages: MetadataRoute.Sitemap = districtEntries.flatMap(
    ([slug, district]) =>
      district
        ? listTournaments(district).map((t) => ({
            url: url(`/prefectures/${slug}/${t.slug}`),
            // ★**終わった大会はその最終日から変わらない**（日付の無い大会は書かない）
            lastModified: asDate(t.lastDate),
            changeFrequency: "weekly" as const,
            priority: 0.6,
          }))
        : [],
  );

  /*
    ★**全国大会の大会ページ**（2026-08-26 追加）。
    「1985年 甲子園」「第90回選抜」のような検索に当たるのはこちらなので、
    一覧だけでなく1大会ずつ載せる。甲子園190件＋神宮24件。
    ★**生成物を読むだけ**なのでDBには当たらない。
  */
  const nationalPages: MetadataRoute.Sitemap = [
    ...koshienTournaments.map((t) => ({
      url: url(`/koshien/${t.slug}`),
      lastModified: asDate(t.lastDate),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...jinguTournaments.map((t) => ({
      url: url(`/jingu/${t.slug}`),
      lastModified: asDate(t.lastDate),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  /*
    ★**公立高校の甲子園出場校の年ページ**（2026-09-21）。
    ★**公立が1校も結び付かない年は載せない**（ページ側も 404 にしている。
    ページの無いURLを検索エンジンに知らせない）。
    ★校名の索引は5分の憶え書きがあるので、ここで1回引いても DB には1度しか行かない。
  */
  const koshienNameIndex = await getSchoolNameIndex("koshien");
  const publicYearPages: MetadataRoute.Sitemap = listPublicYearsWithEntrants((d, p) =>
    koshienNameIndex.find(d, p),
  ).map((y) => ({
    url: url(`/koshien/public/${y.year}`),
    // ★**その年の甲子園が終わった日**（中身はその年の出場校なので、以後は変わらない）
    lastModified: asDate(koshienYearLast.get(String(y.year))),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // ★**ルールと制度の解説**（2026-09-21。手書き。`src/lib/content/guides.ts`）
  const guidePages: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: url(`/guide/${g.slug}`),
    lastModified: new Date(g.checkedOn),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  /*
    ★**年別アーカイブの年ページ**（2026-08-29 追加）。
    ★**地方大会がある年だけ**（`listArchiveYears`）。甲子園だけの年は作っていない
    ので、ここで年を組み立てないこと（ページの無いURLを検索エンジンに知らせることになる）。
  */
  const archivePages: MetadataRoute.Sitemap = (await listArchiveYears()).map((y) => ({
    url: url(`/archive/${y.year}`),
    /*
      ★**今年の分だけは「いちばん新しい試合の日」**（まだ増える）。
      ★**過去の年は書かない** —— 遡って集めた試合が入れば変わるので、
      「この日から変わっていない」とは言えない。
    */
    lastModified: y.year === now.getUTCFullYear() ? regionalLast : undefined,
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
  const versusDistricts = new Set(PREFECTURES.map((p) => p.slug));
  const versusPages: MetadataRoute.Sitemap = districtEntries.flatMap(([slug, district]) => {
    if (!district || !versusDistricts.has(slug)) return [];
    const pairs = new Map<string, number>();
    // ★**その組がいちばん最後に当たった日**（`lastmod` に使う）
    const pairLast = new Map<string, string>();
    for (const game of district.games) {
      const [x, y] = game.teams;
      if (!x?.slug || !y?.slug || x.combined || y.combined) continue;
      const key = [x.slug, y.slug].sort().join("	");
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      keepLatest(pairLast, key, game.date);
    }
    return [...pairs.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => {
        const [x, y] = key.split("	");
        return {
          url: url(vsPath(x, y)),
          lastModified: asDate(pairLast.get(key)),
          changeFrequency: "monthly" as const,
          priority: 0.5,
        };
      });
  });

  const schoolPages: MetadataRoute.Sitemap = schoolSlugs.map((slug) => ({
    url: url(`/schools/${slug}`),
    // ★**その学校のいちばん新しい試合の日**（地方大会に1試合も無い学校は書かない）
    lastModified: asDate(schoolLast.get(slug)),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // ★**ニュースは sitemap から外してある**（上の staticPages の注記を読むこと）。
  //   `getAllNewsSlugs` は残してあるので、戻すのはここを使う側だけ。
  void newsSlugs;

  /*
    ★**公立旋風と特集は `lastmod` を書かない**（2026-10-18）——
    **slug しか取っていないので「いつ直したか」が分からない。**
    書くなら `updated_at` も一緒に取ること（当てずっぽうの日付は書かない）。
  */
  const phenomenonPages: MetadataRoute.Sitemap = phenomenonSlugs.map((slug) => ({
    url: url(`/phenomenon/${slug}`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const featurePages: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: url(`/features/${slug}`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...rankingPages,
    ...prefecturePages,
    ...tournamentPages,
    ...nationalPages,
    ...publicYearPages,
    ...guidePages,
    ...archivePages,
    ...versusPages,
    ...schoolPages,
    ...phenomenonPages,
    ...featurePages,
  ];
}
