import sharp from "sharp";

const src = "C:/Users/81809/Downloads/公立応援団_ロゴ.png";
const img = sharp(src);
const meta = await img.metadata();
console.log("size:", meta.width, "x", meta.height, meta.format, "hasAlpha:", meta.hasAlpha);

const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// 白でないピクセルを「インク」とみなす
const isInk = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
  if (a < 20) return false;
  return !(r > 235 && g > 235 && b > 235);
};

const rowInk = new Array(height).fill(0);
const colInk = new Array(width).fill(0);
const colorCount = new Map();

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (isInk(i)) {
      rowInk[y]++;
      colInk[x]++;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      colorCount.set(key, (colorCount.get(key) ?? 0) + 1);
    }
  }
}

// 上下左右の余白
const firstRow = rowInk.findIndex((v) => v > 0);
const lastRow = height - 1 - [...rowInk].reverse().findIndex((v) => v > 0);
const firstCol = colInk.findIndex((v) => v > 0);
const lastCol = width - 1 - [...colInk].reverse().findIndex((v) => v > 0);
console.log("content bbox:", { left: firstCol, top: firstRow, right: lastCol, bottom: lastRow });

// 横方向の帯（インクが0の行が続く区間で区切る）
const bands = [];
let start = null;
for (let y = 0; y < height; y++) {
  if (rowInk[y] > 0 && start === null) start = y;
  if (rowInk[y] === 0 && start !== null) {
    bands.push([start, y - 1]);
    start = null;
  }
}
if (start !== null) bands.push([start, height - 1]);
console.log("horizontal bands (top,bottom,h):");
for (const [a, b] of bands) console.log("  ", a, b, b - a + 1);

// しきい値つきで帯を取り直す（細い線でつながっている箇所を切る）
for (const th of [3, 8, 20]) {
  const out = [];
  let s = null;
  for (let y = 0; y < height; y++) {
    if (rowInk[y] > th && s === null) s = y;
    if (rowInk[y] <= th && s !== null) {
      out.push([s, y - 1]);
      s = null;
    }
  }
  if (s !== null) out.push([s, height - 1]);
  console.log(`bands (ink>${th}):`, out.map(([a, b]) => `${a}-${b}`).join(" / "));
}

console.log("top colors (x16):");
[...colorCount.entries()]
  .sort((p, q) => q[1] - p[1])
  .slice(0, 10)
  .forEach(([k, v]) => {
    const [r, g, b] = k.split(",").map((n) => Number(n) * 16 + 8);
    console.log("   rgb(", r, g, b, ")", v);
  });
