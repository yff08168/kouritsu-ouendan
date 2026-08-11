import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown本文の描画。
 *
 * rehype-raw を入れていないので、本文に <script> などの生HTMLが混ざっても
 * ただの文字として表示される。将来ニュースを自動収集したとき、
 * 外部から取り込んだ文字列がそのままHTMLとして実行されるのを防ぐため
 * （要件28のXSS対策）。この方針を崩さないこと。
 */
export function NewsBody({ markdown }: { markdown: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const isExternal = href?.startsWith("http");
            return (
              <a
                href={href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
          // 表は狭い画面ではみ出すので、表だけを横スクロールさせる
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
