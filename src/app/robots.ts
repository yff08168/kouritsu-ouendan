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
      disallow: ["/search"],
    },
    sitemap: new URL("/sitemap.xml", SITE.url).toString(),
  };
}
