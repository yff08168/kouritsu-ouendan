/**
 * ロゴ画像（assets/logo-source.png）から public/ に配布用のPNGを書き出す。
 *
 *   node scripts/build-logo-assets.mjs
 *
 * 元画像は白背景・ネイビー＋オレンジの2色。ここでやっているのは3つだけ。
 *
 *   1. 白背景を透過にする（アルファ = 白からの遠さ）
 *   2. 使う部分だけ切り出す（ヘッダー用は上段のマーク＋ロゴタイプまで）
 *   3. ネイビー地に載せる用に、ネイビーの部分だけ白へ置き換えた版も作る
 *
 * 切り出し位置は元画像の実測値。ロゴを描き直したらこの数値を見直すこと。
 * scripts/measure-logo.mjs で帯の境界を測り直せる。
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_DIR = path.join(root, "assets");
const SRC = path.join(ASSET_DIR, "logo-source.png");
const OUT_DIR = path.join(root, "public");

/** 元画像（1200x675）における各パーツの位置 */
const BOX = {
  left: 38,
  right: 1161,
  /** マーク＋ロゴタイプ＋下のライン */
  markTop: 96,
  markBottom: 474,
  /** キャッチコピーまで含めた一式 */
  fullTop: 96,
  fullBottom: 575,
};

/**
 * 白背景を透過にする。
 *
 * アルファは「白からどれだけ離れているか」= 255 - min(r,g,b) で決める。
 * ロゴのネイビーもオレンジも最も暗いチャンネルがほぼ0なので、
 * 塗りの部分はほぼ不透明、アンチエイリアスの縁だけが半透明になる。
 *
 * @param {Buffer} data RGBAの生ピクセル
 * @param {"keep" | "white"} inkMode ネイビーをそのまま残すか、白へ置き換えるか
 */
function keyOutWhite(data, inkMode) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = 255 - Math.min(r, g, b);

    if (alpha < 6) {
      data[i + 3] = 0;
      continue;
    }
    data[i + 3] = alpha;

    // オレンジはどちらの版でもオレンジのまま残す（旗とメガホン）
    const isOrange = r - b > 60;
    if (inkMode === "white" && !isOrange) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return data;
}

async function build({
  name,
  top,
  bottom,
  width,
  inkMode,
  dir = OUT_DIR,
  // OGP画像に埋め込む版はパレットPNGにしない。
  // 画像生成に使う satori がパレット＋透過のPNGを読めず、生成ごと失敗する。
  palette = true,
}) {
  const region = {
    left: BOX.left,
    top,
    width: BOX.right - BOX.left + 1,
    height: bottom - top + 1,
  };

  const { data, info } = await sharp(SRC)
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = path.join(dir, name);
  await sharp(keyOutWhite(data, inkMode), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize({ width, fit: "inside" })
    .png({ compressionLevel: 9, palette })
    .toFile(out);

  const meta = await sharp(out).metadata();
  console.log(
    `${name.padEnd(22)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)}`,
  );
}

await mkdir(OUT_DIR, { recursive: true });

// ヘッダー用（マーク＋ロゴタイプ）。表示幅は最大160px程度なので3倍で出す。
await build({ name: "logo-mark.png", top: BOX.markTop, bottom: BOX.markBottom, width: 480, inkMode: "keep" });
await build({ name: "logo-mark-white.png", top: BOX.markTop, bottom: BOX.markBottom, width: 480, inkMode: "white" });

// キャッチコピーまで入った一式。印刷物や資料に渡すとき用に置いておく。
await build({ name: "logo.png", top: BOX.fullTop, bottom: BOX.fullBottom, width: 1000, inkMode: "keep" });
await build({ name: "logo-white.png", top: BOX.fullTop, bottom: BOX.fullBottom, width: 1000, inkMode: "white" });

/*
 * OGP画像（1200x630）に埋め込む用。
 * public/ ではなく assets/ に置くのは、実行時に readFile で読むため。
 * public/ はサーバ側のファイルとして残る保証がない。
 */
await build({ name: "og-logo.png", top: BOX.markTop, bottom: BOX.markBottom, width: 360, inkMode: "keep", dir: ASSET_DIR, palette: false });
await build({ name: "og-logo-white.png", top: BOX.markTop, bottom: BOX.markBottom, width: 360, inkMode: "white", dir: ASSET_DIR, palette: false });
