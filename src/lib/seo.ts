import { OPERATOR, SITE, establishmentLabel } from "@/lib/constants";
import type { NewsDetail, PhenomenonDetail, SchoolDetail } from "@/types/app";

/** 相対パスを絶対URLにする。構造化データではURLを絶対で書く必要がある。 */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * サイト全体を表す構造化データ。
 * WebSite に SearchAction を付けると、検索結果にサイト内検索窓が
 * 出ることがある（出るかどうかはGoogleの判断）。
 */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": absoluteUrl("/#organization"),
        name: SITE.name,
        alternateName: SITE.fullName,
        url: SITE.url,
        description: SITE.description,
        // 運営者名が未設定のうちは founder を出さない（虚偽を書かないため）
        ...(OPERATOR.name ? { founder: { "@type": "Person", name: OPERATOR.name } } : {}),
        sameAs: [SITE.xUrl],
      },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: SITE.url,
        name: SITE.name,
        description: SITE.description,
        inLanguage: "ja",
        publisher: { "@id": absoluteUrl("/#organization") },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: absoluteUrl("/search?q={search_term_string}"),
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(
  items: { label: string; href?: string }[],
): object {
  const entries = [{ label: "ホーム", href: "/" }, ...items];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: entries.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      // 最後の項目（現在地）にはURLを付けない
      ...(item.href && index < entries.length - 1
        ? { item: absoluteUrl(item.href) }
        : {}),
    })),
  };
}

export function newsArticleJsonLd(news: NewsDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.title,
    description: news.summary,
    datePublished: news.publishedAt,
    inLanguage: "ja",
    mainEntityOfPage: absoluteUrl(`/news/${news.slug}`),
    publisher: { "@id": absoluteUrl("/#organization") },
    ...(news.image ? { image: [news.image.url] } : {}),
    // 引用元がある場合は明示する。転載ではなく要約であることを示すため。
    ...(news.sourceUrl
      ? { isBasedOn: news.sourceUrl, citation: news.sourceName ?? news.sourceUrl }
      : {}),
  };
}

/**
 * 学校ページ。schema.org の HighSchool を使う。
 * 高専は厳密には高等学校ではないが、より近い型が無いため
 * CollegeOrUniversity ではなく HighSchool を当てている。
 */
export function schoolJsonLd(school: SchoolDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "HighSchool",
    name: school.name,
    alternateName: [school.officialName, ...school.nameAliases],
    url: absoluteUrl(`/schools/${school.slug}`),
    ...(school.websiteUrl ? { sameAs: [school.websiteUrl] } : {}),
    ...(school.description ? { description: school.description } : {}),
    ...(school.foundedYear ? { foundingDate: String(school.foundedYear) } : {}),
    address: {
      "@type": "PostalAddress",
      addressCountry: "JP",
      addressRegion: school.prefecture.name,
      ...(school.city ? { addressLocality: school.city } : {}),
    },
    // 「県立」「国立」などの区分を明示しておく
    additionalProperty: {
      "@type": "PropertyValue",
      name: "設置区分",
      value: establishmentLabel(school.establishment, school.prefecture.name),
    },
    ...(school.image ? { image: [school.image.url] } : {}),
  };
}

export function phenomenonJsonLd(item: PhenomenonDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    ...(item.summary ? { description: item.summary } : {}),
    inLanguage: "ja",
    mainEntityOfPage: absoluteUrl(`/phenomenon/${item.slug}`),
    publisher: { "@id": absoluteUrl("/#organization") },
    ...(item.image ? { image: [item.image.url] } : {}),
  };
}

export function articleJsonLd(options: {
  title: string;
  description?: string | null;
  path: string;
  publishedAt?: string | null;
  imageUrl?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: options.title,
    ...(options.description ? { description: options.description } : {}),
    inLanguage: "ja",
    mainEntityOfPage: absoluteUrl(options.path),
    publisher: { "@id": absoluteUrl("/#organization") },
    ...(options.publishedAt ? { datePublished: options.publishedAt } : {}),
    ...(options.imageUrl ? { image: [options.imageUrl] } : {}),
  };
}
