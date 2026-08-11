/**
 * 記事本文のMarkdown描画が、生HTMLを実行可能な形で出力しないことを確認する。
 *
 *   node scripts/check-markdown-safety.mjs
 *
 * 将来ニュースを自動収集すると、外部から取り込んだ文字列がそのまま
 * body に入る可能性がある。rehype-raw をうっかり追加すると
 * そこがXSSの入口になるため、方針が崩れていないかを機械的に見張る。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const attacks = [
  ["scriptタグ", '<script>alert("xss")</script>'],
  ["imgのonerror", '<img src=x onerror="alert(1)">'],
  ["iframe", '<iframe src="https://example.com"></iframe>'],
  ["javascript:リンク", "[クリック](javascript:alert(1))"],
  ["HTMLを含む見出し", '## 見出し<script>alert(2)</script>'],
];

let failed = 0;

for (const [label, markdown] of attacks) {
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );

  /*
   * エスケープ済みの出力（&lt;img ...&gt;）は安全なので、
   * 「実際のタグとして出ているか」だけを見る。
   * onerror などの属性も、本物のタグの内側にある場合だけ危険とみなす。
   */
  const dangerous =
    /<(script|iframe|object|embed)\b/i.test(html) ||
    /<[^>]+\son[a-z]+\s*=/i.test(html) ||
    /href\s*=\s*["']?javascript:/i.test(html);

  if (dangerous) {
    failed += 1;
    console.log(`❌ ${label}\n   ${html}`);
  } else {
    console.log(`✅ ${label}: 無害化された`);
    console.log(`   出力: ${html.slice(0, 90)}`);
  }
}

if (failed > 0) {
  console.log("\n生HTMLが描画されている。rehype-raw が追加されていないか確認すること。");
  process.exit(1);
}
console.log("\nすべて無害化されている。");
