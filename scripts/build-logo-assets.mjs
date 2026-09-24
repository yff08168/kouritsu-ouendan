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
import { mkdir, writeFile } from "node:fs/promises";
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

/*
 * ------------------------------------------------------------------
 * サイトアイコン（favicon）。2026-09-24。運営者の「ロゴから引用して」。
 *
 *   横長のワードマークは16pxでは読めないので、ロゴのいちばん目立つ要素
 *   「旗と竿」だけを切り出して正方形に置く（ボールは「公」の字と重なっていて
 *   切り出せない。試した記録は README の「ロゴ」）。
 *   ★Google の検索結果にアイコンを出すには 48px の倍数の正方形が要る（48・96・192 …）。
 *   ★置き場所は Next の規約どおり src/app/（favicon.ico / icon.png / apple-icon.png）。
 *     <link rel="icon"> は Next が自動で出す。layout.tsx には書かない。
 *   ★.ico は sharp が書けないので、PNG を ICO の器に詰める（PNG入りICO）。
 *     Windows Vista 以降のブラウザと Google が読める形。
 *   ★透過は残す（検索結果の白地でもダークモードでも同じに見える）。
 *     Apple のホーム画面用だけ白地にする（透過が黒くなる端末があるため）。
 * ------------------------------------------------------------------
 */
const APP_DIR = path.join(root, "src", "app");

/** 原本（1200x675）における旗の位置。「立」の横棒が y=230 から始まるので、旗はその手前で切る */
const ICON = {
  flag: { left: 372, top: 92, width: 280, height: 134 },
  /** 竿の続き。旗の下から「公」の右上の払いに当たる手前（y≈267）まで */
  pole: { left: 372, top: 226, width: 68, height: 24 },
};

async function cutTransparent(region) {
  const { data, info } = await sharp(SRC).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return sharp(keyOutWhite(data, "keep"), { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** 旗＋竿を1枚の透過PNGにする（原本の解像度のまま） */
async function flagMark() {
  const flag = await cutTransparent(ICON.flag);
  const pole = await cutTransparent(ICON.pole);
  const width = ICON.flag.width;
  const height = ICON.flag.height + ICON.pole.height;
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: flag, left: 0, top: 0 },
      { input: pole, left: ICON.pole.left - ICON.flag.left, top: ICON.flag.height },
    ])
    .png()
    .toBuffer();
}

/** 正方形に置く。余白は各辺 8%。 */
async function squareIcon(mark, size, background) {
  const inner = Math.round(size * 0.84);
  const fitted = await sharp(mark).resize({ width: inner, height: inner, fit: "inside" }).png().toBuffer();
  const meta = await sharp(fitted).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: fitted, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** PNG を ICO の器に詰める（ICONDIR 6バイト ＋ ICONDIRENTRY 16バイト×N ＋ PNG本体） */
function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size; // 幅（256は0）
    dir[o + 1] = size >= 256 ? 0 : size; // 高さ
    dir[o + 2] = 0; // パレット色数
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

{
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
  const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
  const mark = await flagMark();

  const icoSizes = [16, 32, 48];
  const ico = icoFromPngs(await Promise.all(icoSizes.map(async (size) => ({ size, buf: await squareIcon(mark, size, TRANSPARENT) }))));
  await writeFile(path.join(APP_DIR, "favicon.ico"), ico);
  console.log(`${"favicon.ico".padEnd(22)} ${icoSizes.join("/")}px  ${ico.length}B`);

  await writeFile(path.join(APP_DIR, "icon.png"), await squareIcon(mark, 192, TRANSPARENT));
  console.log(`${"icon.png".padEnd(22)} 192x192`);

  await writeFile(path.join(APP_DIR, "apple-icon.png"), await squareIcon(mark, 180, WHITE));
  console.log(`${"apple-icon.png".padEnd(22)} 180x180`);
}
