/**
 * 学校ページを検索インデックスに入れてよいかの判定。
 *
 * ------------------------------------------------------------------
 * ★★**規則はここ1か所に閉じ込める。**
 *
 *   学校ページ … noindex を付けるかどうか（`app/schools/[slug]/page.tsx`）
 *   sitemap    … その学校のURLを載せるかどうか（`app/sitemap.ts`）
 *
 * この2つが食い違うと、**sitemap に載っているのに noindex** という
 * 矛盾した指示を検索エンジンに出すことになる。**両方がこの関数を見る。**
 *
 * ------------------------------------------------------------------
 * ★★**なぜ全部は入れないのか**
 *
 * 3,505校のうち、校名・所在地・区分しか無いページがまだ多い。
 * 同じ形の空ページが何千枚もあるとサイト全体が「薄いコンテンツ」と
 * 見なされ、ランキングや公立旋風など中身のあるページの評価まで
 * 巻き添えになる。**中身が入るまでは noindex、ただし `follow` は残す。**
 * 利用者は今までどおり閲覧できる。
 *
 * ------------------------------------------------------------------
 * ★★**2026-08-28 に地方大会の戦績を判定材料に足した。**
 *
 * それまでは**甲子園出場歴だけ**で判定していて、index されるのは
 * 678校だけだった。**地方大会の試合を持つ学校は2,184校**あり、
 * 差のぶんは「実際の試合結果が載っているのに noindex」だった。
 * 「◯◯高校 野球」で探す人が最初に当たるべきページなので、開けた。
 */

import { PREFECTURES } from "@/lib/constants";
import { getRegionalDistrict } from "@/lib/regional-results";

/**
 * 中身のある学校ページか。
 *
 * ★**判定に使うのは「その学校の試合が1つでもあるか」だけ。**
 * ニュースや公立旋風を足すときは、**ここに条件を足す**（呼ぶ側で分岐しない）。
 */
export function isIndexableSchool(input: {
  /** 甲子園の出場回数（春＋夏）。学校マスタの非正規化列から */
  koshienCount: number;
  /** その学校が出た地方大会の試合数 */
  regionalGames: number;
}): boolean {
  return input.koshienCount > 0 || input.regionalGames > 0;
}

/**
 * 地方大会に1試合でも出ている公立校の slug。
 *
 * ★**sitemap 専用。** 47県ぶんの生成物を読むので、
 * **学校ページからは呼ばないこと**（学校ページは自分の県だけを読む）。
 *
 * ★**`getRegionalDistrict` は県ごとの動的 import**なので、
 * ここで全県を読んでも他のページのバンドルには入らない。
 */
export async function getRegionalSchoolSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  await Promise.all(
    PREFECTURES.map(async (p) => {
      const district = await getRegionalDistrict(p.slug);
      if (!district) return;
      for (const game of district.games) {
        for (const team of game.teams) {
          // ★**画面と同じ条件で数える**（`regionalGamesOf` と揃えている）
          if (team.slug) slugs.add(team.slug);
        }
      }
    }),
  );
  return slugs;
}
