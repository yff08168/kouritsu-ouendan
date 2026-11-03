import { SITEMAP_GROUPS, sitemapGroups, type SitemapGroupId } from "@/lib/sitemap-entries";
import { toUrlsetXml, XML_HEADERS } from "@/lib/sitemap-xml";

export const revalidate = 3600;
// ★**知らない名前は404にする**（`/sitemap/foo.xml` を空の urlset として返さない）
export const dynamicParams = false;

/*
  ★★**種類ごとの子サイトマップ**（`/sitemap/<種類>.xml`）。索引は `src/app/sitemap.xml/route.ts`。

  ★**ファイル名は種類の名前にする**（`0.xml` `1.xml` のような番号にしない）——
  **Search Console の一覧に出るのがこのURLそのもの**なので、
  見て何の枚か分からないと、分けた意味（種類ごとに状況を見る）が無くなる。
*/
export function generateStaticParams() {
  return SITEMAP_GROUPS.map((g) => ({ file: `${g.id}.xml` }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const id = file.replace(/\.xml$/, "") as SitemapGroupId;
  const groups = await sitemapGroups();
  const entries = groups[id];
  if (!entries) return new Response("Not Found", { status: 404 });
  return new Response(toUrlsetXml(entries), { headers: XML_HEADERS });
}
