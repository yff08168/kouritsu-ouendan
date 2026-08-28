import Script from "next/script";

/**
 * Google アナリティクス（GA4）。
 *
 * ★**`NEXT_PUBLIC_GA_ID` が無いときは何も出さない。**
 *   手元の開発サーバーやプレビューの閲覧が本番の数字に混ざらないようにするため。
 *   本番（Vercel）にだけ測定IDを入れる。
 *
 * ★**測定IDをコードに直接書かないこと。** 環境変数で渡す。
 *   書くと、別の環境にデプロイしたときに本番の数字が汚れる。
 *
 * ★★**このコンポーネントを足したら、必ず `/privacy` も直すこと。**
 *   プライバシーポリシーは「アクセス解析ツールも導入していません」と
 *   書いていた。**入れたまま文面を放置すると、書いてあることが事実と違う。**
 *
 * ★**画面遷移ごとの計測は GA4 側の「拡張計測機能」に任せる。**
 *   履歴の変更（`pushState`）を GA4 が自分で拾うので、
 *   ルーターの遷移を購読して手で `page_view` を送る必要は無い。
 *   手で送ると、拡張計測と二重に数えることになる。
 */
export function Analytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
