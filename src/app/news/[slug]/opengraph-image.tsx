import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getNewsBySlug } from "@/lib/queries/news";
import { NEWS_CATEGORIES, SITE } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  fontOptions,
  loadJapaneseFont,
  toDataUri,
} from "@/lib/og";

/*
 * 記事ごとのOGP画像。
 * Xでの共有が主要な流入経路になる想定なので（要件22）、
 * 見出しがそのまま画像に出るようにしている。
 */
export const alt = "ニュース記事";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  // Next.js 16 では params は Promise。await しないと slug が undefined になる。
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const news = await getNewsBySlug(slug);
  const title = news?.title ?? SITE.name;
  const category = news ? NEWS_CATEGORIES[news.category] : "";
  const prefecture = news?.prefecture?.name ?? "";
  const date = news ? formatDate(news.publishedAt) : "";

  // ロゴのパスは文字列リテラルのまま渡す。変数で組み立てると
  // Next.js がデプロイ時に同梱すべきファイルを追えなくなる。
  const [font, logo] = await Promise.all([
    loadJapaneseFont(
      `${title}${category}${prefecture}${SITE.name}${SITE.catchphrase}`,
    ),
    readFile(join(process.cwd(), "assets/og-logo.png")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          background: "#fff",
          borderTop: "16px solid #0F2747",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {category && (
            <div
              style={{
                background: "#F28C28",
                color: "#fff",
                fontSize: 24,
                fontWeight: 700,
                padding: "8px 20px",
                borderRadius: 6,
              }}
            >
              {category}
            </div>
          )}
          {prefecture && (
            <div style={{ fontSize: 26, color: "#5A6675" }}>{prefecture}</div>
          )}
          {date && <div style={{ fontSize: 24, color: "#8B95A3" }}>{date}</div>}
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 58,
            lineHeight: 1.4,
            color: "#16202F",
            fontWeight: 700,
            // 長い見出しでもはみ出さないよう行数を制限する
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "2px solid #E3E7EC",
            paddingTop: 28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toDataUri(logo)} width={180} height={61} alt="" />
          <div style={{ fontSize: 22, color: "#8B95A3" }}>
            {SITE.catchphrase}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fontOptions(font) },
  );
}
