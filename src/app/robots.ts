import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /*
       * 検索結果ページはクロールさせない。
       * 検索語の組み合わせは無限に増えるため、放置すると
       * 中身の薄いページを大量に作ったのと同じ扱いになる。
       * 各ページ側にも noindex を付けてあるが、こちらで
       * クロール自体を止めておくとサーバー負荷も減る。
       */
      /*
       * ★★学校一覧の絞り込み・並べ替え・ページ送りもクロールさせない（2026-10-08）。
       * 県・設置区分・種別・甲子園・並べ替え・ページの組み合わせがすべてリンクで、数千通りある。
       * 一覧は開かれるたびに作るページなので、検索エンジンがたどるたびにサーバーが動き、
       * Supabase の転送量の上限を使い切る原因になっていた。
       * ★学校ごとのページ（/schools/<slug>）はクエリが付かないので当たらない。
       * ★県ごとの学校の並びは県のページ（/prefectures/<slug>）が持っている。
       */
      disallow: ["/search", "/schools?"],
    },
    sitemap: new URL("/sitemap.xml", SITE.url).toString(),
  };
}
