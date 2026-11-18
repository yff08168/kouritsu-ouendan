/**
 * 日本高野連の「21世紀枠推薦校一覧」を取りに行き、控え（`src/lib/data/senbatsu-21seiki-recommended.json`）を書く。
 *
 *   node scripts/snapshot-21seiki.mjs            … 来季（既定は今年度の選抜の年）と前回の2年ぶん
 *   node scripts/snapshot-21seiki.mjs 2027 2026  … 年を指定
 *
 * ★ **読み取りは `src/lib/senbatsu-21seiki.ts` の `parseRecommendedHtml` そのもの**（jiti で直接読む）。
 *   ページ（描くときに取りに行く）と**規則を2か所に持たない。**
 * ★ 控えは**取れなかった日のため**で、ページは普段は出典を直接読む。
 *   **発表が進んだら（北海道が出たら・9地区候補校が出たら）取り直してコミットしておくと、
 *   次のビルドで古い内容が焼かれない。**
 * ★ 47行そろわなければ**その年は書き換えない**（半端な表を控えにしない）。
 * ★ 出典に優しく: 年ごとに1回だけ。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(ROOT, "src").replace(/\\/g, "/") },
  fsCache: false,
});
const lib = await jiti.import("@/lib/senbatsu-21seiki");

const FILE = path.join(ROOT, "src/lib/data/senbatsu-21seiki-recommended.json");
const now = new Date();
// 選抜の年: 7月以降は翌年の春
const defaultYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
const years = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (years.length === 0) years.push(defaultYear, defaultYear - 1);

const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
for (const year of years) {
  const url = lib.recommendedUrl(year);
  const res = await fetch(url, {
    headers: { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" },
  });
  if (!res.ok) {
    console.warn(`⚠️ ${year}: ${res.status} ${url}（控えは書き換えない）`);
    continue;
  }
  const parsed = lib.parseRecommendedHtml(await res.text(), year);
  if (!parsed) {
    console.warn(`⚠️ ${year}: 47行の表として読めなかった（控えは書き換えない）`);
    continue;
  }
  const filled = parsed.rows.filter((r) => r.school).length;
  console.log(`${year}: ${filled}/47 都道府県が発表済み（更新 ${parsed.updatedAt ?? "不明"}）`);
  data[String(year)] = parsed;
}

const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => Number(a) - Number(b)));
fs.writeFileSync(FILE, JSON.stringify(sorted, null, 1) + "\n");
console.log(`書き出した: ${path.relative(ROOT, FILE)}`);
