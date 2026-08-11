import { ImageResponse } from "next/og";
import { SITE } from "@/lib/constants";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  fontOptions,
  loadJapaneseFont,
} from "@/lib/og";

/*
 * サイト共通のOGP画像。
 * app直下に置くと、独自のOGP画像を定義していない全ページで使われる。
 */
export const alt = `${SITE.name} | ${SITE.catchphrase}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const text = `${SITE.name}${SITE.catchphrase}公立高校野球応援サイト`;
  const font = await loadJapaneseFont(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #0F2747 0%, #1A3A63 100%)",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="72" height="72" viewBox="0 0 40 40" fill="none">
            <circle cx="16" cy="24" r="11" stroke="#fff" strokeWidth="2.2" />
            <path
              d="M8.5 16.5c3.2 2.4 4.6 6.2 4.3 10.4M23.5 16.5c-3.2 2.4-4.6 6.2-4.3 10.4"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path d="M27 33V5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <path
              d="M27 6.5h9.5c.6 0 .9.7.5 1.1L34 10.5l3 2.9c.4.4.1 1.1-.5 1.1H27z"
              fill="#F28C28"
            />
          </svg>
          <div style={{ fontSize: 52, color: "#fff", fontWeight: 700 }}>
            {SITE.name}
          </div>
        </div>

        <div
          style={{
            marginTop: 44,
            fontSize: 66,
            lineHeight: 1.35,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          公立高校野球が、
        </div>
        <div
          style={{
            fontSize: 66,
            lineHeight: 1.35,
            color: "#F28C28",
            fontWeight: 700,
          }}
        >
          もっと面白くなる。
        </div>

        <div style={{ marginTop: 44, fontSize: 26, color: "#8FA5C0" }}>
          公立高校野球応援サイト
        </div>
      </div>
    ),
    { ...size, fonts: fontOptions(font) },
  );
}
