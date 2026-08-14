/**
 * PDFから文字を取り出す。**地方大会の結果でPDFしか出していない県のため。**
 *
 * ------------------------------------------------------------------
 * ★ なぜ座標つきで返すのか
 *
 *   スコア表は**表**なので、文字列を素直につなぐと意味が壊れる。
 *   pdf.js が返すのは「文字の断片＋座標」で、並び順は描画順であって
 *   読む順ではない。**yでまとめて行にし、xで並べ直す**ところまでを
 *   ここでやる。県ごとのアダプタは「行の配列」だけを見ればよくなる。
 *
 * ------------------------------------------------------------------
 * ★ `legacy/build/pdf.mjs` を使う
 *
 *   既定のビルドはブラウザ向けで、Node には `legacy` を使う。
 *   （DOMMatrix などブラウザにしか無いものを避けるため）
 *
 * ------------------------------------------------------------------
 * ★ **これは開発用の依存**（`devDependency`）。
 *
 *   生成物を作るスクリプトだけが使う。**サイト側のコードから import しないこと。**
 *   Next.js のバンドルに 35MB のライブラリが入る。
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * 同じ行とみなす y の差（ポイント）。
 * 表の罫線の中で数字が少し上下することがあるので、厳密一致にしない。
 * 大きすぎると上下の行がくっつくので、本文の文字の大きさ（9〜11pt）より小さくする。
 */
const ROW_TOLERANCE = 3;

/**
 * PDFのバイト列 → ページごとの行。
 *
 * 戻り値は `[{ page, lines: [{ y, items: [{ x, text }], text }] }]`。
 * `text` は行の文字を x 順につないだもの（区切りはタブ）。
 * **区切りをタブにしてあるのは、空白が校名の中に入ることがある**ため
 *  （「今 治」のように1文字ずつ空ける書き方）。
 */
export async function pdfPages(data) {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    /** y（小数）→ その行の文字 */
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      // 近い y の行があればそこに入れる（無ければ新しい行）
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= ROW_TOLERANCE) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x, text: item.str });
    }

    const lines = [...rows.entries()]
      // PDFの y は下が0。上から読むので降順
      .sort((a, b) => b[0] - a[0])
      .map(([y, items]) => {
        const sorted = items.sort((a, b) => a.x - b.x);
        return { y, items: sorted, text: sorted.map((i) => i.text).join("\t") };
      });
    pages.push({ page: p, lines });
  }
  // v6 の PDFDocumentProxy は destroy を持たない（loadingTask 側にある）
  await doc.cleanup?.();
  return pages;
}

/**
 * URL から取って行にする。**取れなければ null。例外は投げない。**
 *
 * ★**1枚のPDFの失敗で、その県の1季節を落とさないこと。**
 * 相手は小さなサーバーで、PDFは1枚ずつ何十枚も取りに行く。
 * 例外を投げると、それまでに読めた試合ごと捨てることになる（実際にそうなった）。
 * 遅いだけのことが多いので、間をあけて3回まで試してから諦める。
 */
export async function fetchPdfPages(url, { headers, timeoutMs = 45000 } = {}) {
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000 * attempt));
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      break;
    } catch {
      res = null;
    }
  }
  if (!res?.ok) return null;
  let data;
  try {
    data = new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
  /*
    **PDFでないものを渡さない。** 404ページのHTMLが返ってくることがあり、
    そのまま pdf.js に渡すと例外で止まる。先頭の `%PDF` で見分ける。
  */
  if (data[0] !== 0x25 || data[1] !== 0x50 || data[2] !== 0x44 || data[3] !== 0x46) return null;
  try {
    return await pdfPages(data);
  } catch {
    // 壊れたPDF・暗号化されたPDF。1枚飛ばすだけにする
    return null;
  }
}
