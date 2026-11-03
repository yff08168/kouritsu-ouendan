import { SITE } from "@/lib/constants";
import { SITEMAP_GROUPS, sitemapGroups } from "@/lib/sitemap-entries";
import { newestLastModified, toSitemapIndexXml, XML_HEADERS } from "@/lib/sitemap-xml";

// sitemapもISRで作り直す。記事を追加したときに反映されるようにする。
export const revalidate = 3600;

/*
  ★★★**`/sitemap.xml` は「サイトマップ索引」**（2026-11-03。1枚 → 5枚に分けたときに作った）。

  ★★**URLを変えていないのが要点** —— GSC に登録済みで robots.txt にも書いてあるので、
  **送り直さなくても Google が索引から子（`/sitemap/<種類>.xml`）を見つける。**
  ★**GSC はしばらくすると子を別の行として一覧に出す**ので、そこで種類ごとの状況が見える。

  ★**子の中身は `src/app/sitemap/[file]/route.ts`、組み立ては `src/lib/sitemap-entries.ts`。**
  **3つは組で動く。片方だけ変えないこと。**
*/
export async function GET() {
  const groups = await sitemapGroups();
  const children = SITEMAP_GROUPS.map((g) => ({
    loc: new URL(`/sitemap/${g.id}.xml`, SITE.url).toString(),
    // ★**その枚でいちばん新しい日**。どの枚を先に見に来ればよいかを伝える
    lastModified: newestLastModified(groups[g.id] ?? []),
  }));
  return new Response(toSitemapIndexXml(children), { headers: XML_HEADERS });
}
