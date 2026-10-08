import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

/*
  ------------------------------------------------------------------
  ★★★ AI の検索・学習用と SEO ツールのクローラーは、サイト全体を止める（2026-10-08）

  Vercel の Usage（9/11〜10/8）は、Hobby の枠を大きく超えていた
  （ISR Writes 1.97M／20万、Active CPU 14時間／4時間、Fast Origin Transfer 32GB／10GB、
  CDN Requests 2.09M／100万）。**`vercel metrics` でボットの種類ごとに数えると、
  9/13〜9/29 のリクエスト約75万件のうち7割近くがこれらのクローラー**だった:

      oai-searchbot（ChatGPT の検索）     35.4%
      meta-externalagent（Meta の AI）    16.7%
      amazonbot                           8.8%
      perplexitybot                       3.9%
      semrush・seranking（SEO ツール）     4.5%
      googlebot                           0.9%   ← 検索で効くのはこちら
      bingbot                             0.8%

  ★**OAI-SearchBot は利用規約・問い合わせ・トップを1週間に約5,200〜6,500回ずつ取りに来ていた。**
  ★**ISR の書き込みの9割近くは、学校・対戦成績・試合・大会のページを「開かれたときに作る」ぶん**で、
  開いていたのは主にこれらのクローラー（人は1週間に数千件しかない）。

  ★★**Google と Bing は止めない**（検索から来る人はここから来る）。
  ★**ChatGPT-User と Perplexity-User は止めない** —— 人が ChatGPT などで
  このサイトを開いたときの取得で、件数も少ない（9/13〜29 で合わせて約1,500件）。
  ★**Applebot は止めない** —— Siri・Spotlight の検索に使われる。AI 学習だけを断る
  `Applebot-Extended` は下で止めている。
  ★**止めた結果、ChatGPT の検索や Perplexity の回答にこのサイトが出にくくなる。** 運営者の
  「できれば無料プランの範囲内に」を優先した。戻すなら `BLOCKED_BOTS` から外すだけ。
  ★**robots.txt は従うクローラーにしか効かない。** 従わないものは Vercel の Firewall
  （AI Bots の管理ルール）で止める。
*/
const BLOCKED_BOTS = [
  // AI の検索・回答
  "OAI-SearchBot",
  "PerplexityBot",
  // AI の学習・取得
  "GPTBot",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "Amazonbot",
  "Applebot-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-SearchBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "cohere-ai",
  "Diffbot",
  "YouBot",
  "Timpibot",
  "ImagesiftBot",
  "omgili",
  // SEO ツール
  "SemrushBot",
  "SERankingBacklinksBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: BLOCKED_BOTS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          /*
           * 検索結果ページはクロールさせない。
           * 検索語の組み合わせは無限に増えるため、放置すると
           * 中身の薄いページを大量に作ったのと同じ扱いになる。
           * 各ページ側にも noindex を付けてあるが、こちらで
           * クロール自体を止めておくとサーバー負荷も減る。
           */
          "/search",
          /*
           * ★★学校一覧の絞り込み・並べ替え・ページ送りもクロールさせない（2026-10-08）。
           * 県・設置区分・種別・甲子園・並べ替え・ページの組み合わせがすべてリンクで、数千通りある。
           * 一覧は開かれるたびに作るページなので、検索エンジンがたどるたびにサーバーが動き、
           * Supabase の転送量の上限を使い切る原因になっていた。
           * ★学校ごとのページ（/schools/<slug>）はクエリが付かないので当たらない。
           * ★県ごとの学校の並びは県のページ（/prefectures/<slug>）が持っている。
           */
          "/schools?",
          /*
           * ★★試合ごとのページと、速報の試合ごとのページもクロールさせない（2026-10-08）。
           * どちらも noindex で sitemap にも無い（試合は7万件以上ある・速報はURLが数時間で無効になる）。
           * それでも一覧から張ったリンクをたどられ、**試合ページだけで ISR の書き込みの18%**を作っていた。
           * ★速報のほうは「県の後ろにさらに `/` が続くURL」だけに当たる。県の速報ページ
           * （`/live/<県>`。検索に載せている）は後ろに `/` が無いので止まらない。
           * ★このコメントにワイルドカード入りのパスをそのまま書かないこと（星とスラッシュでコメントが閉じる）。
           */
          "/prefectures/*/game/",
          "/live/*/",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", SITE.url).toString(),
  };
}
