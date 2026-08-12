/**
 * ヒーローの背景写真を配布用に書き出す。
 *
 *   npm run hero
 *
 * 原本は `assets/hero/`、出力は `public/hero/`。
 * **`public/hero/` を直接置き換えない**（ロゴと同じ考え方。README「ロゴ」参照）。
 * スマートフォンで撮った写真はそのままだと2MBを超えることがあり、
 * リポジトリにも履歴として残り続けるため、ここで一度だけ小さくしておく。
 *
 * Next.js の <Image> がさらに端末ごとの最適化をするので、ここでの役目は
 * 「元をリポジトリに入れてよい大きさに揃える」ことだけ。
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "assets", "hero");
const OUT_DIR = path.join(root, "public", "hero");

/** ヒーローは横長で使うので、幅だけ揃える。縦は元の比率のまま。 */
const MAX_WIDTH = 1920;
const QUALITY = 78;

const isImage = (name) => /\.(jpe?g|png)$/i.test(name);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter(isImage).sort();
  if (files.length === 0) {
    console.error(`${path.relative(root, SRC_DIR)} に画像がない。`);
    process.exitCode = 1;
    return;
  }

  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const name = `${path.parse(file).name}.jpg`;
    const out = path.join(OUT_DIR, name);

    const image = sharp(src).rotate(); // Exifの向きを反映してから加工する
    const meta = await image.metadata();

    await image
      // withoutEnlargement: 元が小さい写真を引き伸ばさない（粗くなるだけ）
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(out);

    const before = (await stat(src)).size;
    const after = (await stat(out)).size;
    console.log(
      `${file} → hero/${name}　${meta.width}x${meta.height} ` +
        `${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB`,
    );
  }

  console.log("");
  console.log(`${files.length} 枚を ${path.relative(root, OUT_DIR)} に書き出した。`);
  console.log("表示する順番とクレジットは src/lib/hero.ts で決める。");
}

await main();
