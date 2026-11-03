import type { MetadataRoute } from "next";

/*
  ★★★**サイトマップのXMLを自分で書く**（2026-11-03。1枚 → 5枚に分けたときに作った）。

  ★**なぜ Next の `sitemap.ts` をやめたか** —— `generateSitemaps` を使うと
  子は `/sitemap/<id>.xml` に出るが、**索引は作られず `/sitemap.xml` は404になる**
  （実測。`app/sitemap.xml/route.ts` を置くと `Conflicting route and metadata` で起動すらしない）。
  ★★**`/sitemap.xml` は GSC に登録済みで robots.txt にも書いてある。**
  **ここを404にするのは、いまいちばん触ってはいけないものを壊すこと。**

  ★★**出す形は、分ける前の本番とまったく同じにしてある** ——
  `<?xml …?>` ＋ `<urlset xmlns=…>`、**タグごとに改行・字下げなし**、
  **`lastmod` はミリ秒まで入った ISO**（`2026-11-01T00:00:00.000Z`）。
  **変わったのは「1枚が5枚になったこと」だけ**で、URLも日付も1件も動いていない。
*/

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const toDate = (
  v: Date | string | number | undefined,
): Date | undefined => {
  if (v === undefined || v === null) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** その枚でいちばん新しい `lastmod`（索引に書く） */
export const newestLastModified = (
  entries: MetadataRoute.Sitemap,
): Date | undefined => {
  let last: Date | undefined;
  for (const e of entries) {
    const d = toDate(e.lastModified);
    if (d && (!last || d > last)) last = d;
  }
  return last;
};

export function toUrlsetXml(entries: MetadataRoute.Sitemap): string {
  const body = entries
    .map((e) => {
      const rows = [`<loc>${esc(e.url)}</loc>`];
      const last = toDate(e.lastModified);
      // ★**分からないものは書かない**（`sitemap-entries.ts` の決めごとと同じ）
      if (last) rows.push(`<lastmod>${last.toISOString()}</lastmod>`);
      if (e.changeFrequency) rows.push(`<changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined) rows.push(`<priority>${e.priority}</priority>`);
      return `<url>\n${rows.join("\n")}\n</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function toSitemapIndexXml(
  children: { loc: string; lastModified?: Date }[],
): string {
  const body = children
    .map((c) => {
      const rows = [`<loc>${esc(c.loc)}</loc>`];
      if (c.lastModified) rows.push(`<lastmod>${c.lastModified.toISOString()}</lastmod>`);
      return `<sitemap>\n${rows.join("\n")}\n</sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
} as const;
