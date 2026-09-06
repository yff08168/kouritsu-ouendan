import type { Metadata } from "next";
import { SITE } from "@/lib/constants";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/common/JsonLd";
import { Analytics } from "@/components/common/Analytics";
import { websiteJsonLd } from "@/lib/seo";
import "./globals.css";

/*
  ★★**トップの title はキャッチコピーではなく「何が載っているか」**（2026-09-06。運営者の判断）。

  それまでは `公立応援団 | 公立高校野球が、もっと面白くなる。` で、
  **検索語が「公立高校野球」しか入っていなかった。**
  想定している読者は**県の速報を見に来る人・学校の戦績を調べに来る人・
  公立を応援している人**の3つで、**戦績・結果・速報のどれもタイトルに無かった。**

  ★**キャッチコピーはヒーローの h1 に残っている**（画面からは消えていない）。
  ★**文言は `SITE.searchTagline`**（そこに「無いものを書かない」の理由も書いてある）。
*/
const HOME_TITLE = `${SITE.name}${SITE.titleSeparator}${SITE.searchTagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: HOME_TITLE,
    /*
      ★**区切りは全角「｜」**（`SITE.titleSeparator`）。
      ページ側の title も全角で書いてあるので、**1つのタイトルに2種類の区切りが
      出ない**ようにそろえてある。理由は定数側のコメントに書いた。
    */
    template: `%s${SITE.titleSeparator}${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    title: HOME_TITLE,
    description: SITE.description,
  },
  twitter: {
    /*
      ★**`site`（＝@ハンドル）は 2026-08-24 に外した**（運営者の判断。運用予定が無い）。
      **カード自体は残す** —— X で共有されたときに大きな画像で出るかどうかは
      アカウントの有無と関係がない。**存在しないハンドルを名乗らないだけ。**
      アカウントを作ったら `site: SITE.xHandle` を戻す。
    */
    card: "summary_large_image",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="flex min-h-dvh flex-col">
        {/* サイト全体を表す構造化データ。全ページに1回だけ出す */}
        <JsonLd data={websiteJsonLd()} />
        {/* キーボード利用者がヘッダーを読み飛ばせるようにする（要件27） */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-navy-800 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          本文へスキップ
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        {/* アクセス解析。測定IDが無い環境では何も出さない（Analytics 参照） */}
        <Analytics />
      </body>
    </html>
  );
}
