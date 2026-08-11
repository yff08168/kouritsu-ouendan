/**
 * OGP画像を作るための共通処理。
 *
 * ImageResponse の既定フォントには日本語の字形が入っていないため、
 * そのまま描くと全部豆腐（□）になる。かといって日本語フォントは
 * 全部入りだと数MBあり、画像1枚のために読むには重すぎる。
 *
 * そこで Google Fonts の text= パラメータを使い、
 * 「その画像で実際に使う文字だけ」のフォントを取得している。
 * 数十文字なら十数KBで済む。
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** ネットワークが不調なときに画像生成ごと落とさないよう、失敗時は null を返す */
export async function loadJapaneseFont(
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;

    /*
     * User-Agent をあえて送らない。
     * 最近のブラウザを名乗ると Google Fonts は woff2 を返すが、
     * 画像生成に使う satori は woff2 を読めない（Unsupported OpenType
     * signature wOF2 で失敗する）。UAを送らなければ TTF が返る。
     */
    const cssResponse = await fetch(url);
    if (!cssResponse.ok) return null;

    const css = await cssResponse.text();
    const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!fontUrl) return null;

    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) return null;

    return await fontResponse.arrayBuffer();
  } catch {
    return null;
  }
}

/** フォントが取れたときだけ ImageResponse に渡す形にする */
export function fontOptions(font: ArrayBuffer | null) {
  if (!font) return undefined;
  return [
    {
      name: "Noto Sans JP",
      data: font,
      style: "normal" as const,
      weight: 700 as const,
    },
  ];
}
