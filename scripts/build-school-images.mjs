/**
 * 学校の写真を ja.wikipedia から取り、`public/schools/` に webp で置く。
 * 併せて image_url / image_credit / image_source_url を更新するSQLを作る。
 *
 *   node scripts/build-school-images.mjs --koshien --limit 20   … 試す
 *   node scripts/build-school-images.mjs --koshien              … 甲子園出場校だけ
 *   node scripts/build-school-images.mjs --all                  … 全校
 *
 * ------------------------------------------------------------------
 * なぜ Supabase Storage ではなく public/ なのか
 *
 *   設計判断⑫は「外部URLを直接参照しない」ことが目的で、Storage自体が
 *   目的ではない。`public/` に置けば同じ目的を満たしたうえで、
 *   **バケットの作成も service_role キーも要らない**（このリポジトリは
 *   service_role キーを持たない運用）。ロゴとヒーロー写真も既に public/ にある。
 *   next/image はローカルのパスを remotePatterns 無しで扱える。
 *
 * ------------------------------------------------------------------
 * ライセンス
 *
 *   ja.wikipedia はフェアユースを認めていないので、記事に載っている画像は
 *   フリーライセンス（CC BY-SA / CC BY / CC0 / パブリックドメイン）。
 *   **CC BY 系は帰属表示が法的義務**なので、撮影者とライセンス名を
 *   image_credit に必ず入れる。縮小・切り抜きは「改変」にあたるため、
 *   その旨も添える。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const OUT_DIR = path.join(ROOT, "public", "schools");
const CACHE = path.join(ROOT, "data", "school-images.json");
const SQL_OUT = path.join(SUPABASE_DIR, "school_images.sql");

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

// HTTPヘッダーはASCIIしか入らない。日本語を混ぜると fetch が投げる
const UA = {
  "User-Agent": "kouritsu-ouendan/1.0 (https://kouritsu-ouendan.com)",
};

/** 表示する大きさの2倍。4:3に切り抜く（画面側が object-cover の4:3枠のため） */
const WIDTH = 640;
const HEIGHT = 480;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 画像を1枚取る。
 *
 * **upload.wikimedia.org は連投すると 429 を返す。** 150ms間隔で回したら
 * 640枚中526枚が429で落ちた。間隔を空けたうえで、429と5xxは待って再試行する。
 * `Retry-After` が付いていればその秒数に従う（相手の指定が最優先）。
 */
async function fetchImage(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return Buffer.from(await res.arrayBuffer());

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2000 * 2 ** attempt;
      await sleep(Math.min(wait, 60000));
      continue;
    }
    throw new Error("HTTP " + res.status);
  }
  throw new Error("HTTP 429（再試行しても解消しない）");
}

async function api(params) {
  const url = "https://ja.wikipedia.org/w/api.php?" + new URLSearchParams(params);
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * attempt));
    const res = await fetch(url, { headers: UA });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      await new Promise((r) => setTimeout(r, 1100));
      return json;
    } catch {
      process.stdout.write(`\n  APIから応答が得られず再試行 (HTTP ${res.status})…`);
    }
  }
  throw new Error("Wikipedia API が応答しません");
}

/** 学校マスタ（supabase/schools_*.sql が正本） */
function loadSchools() {
  const koshien = readFileSync(path.join(SUPABASE_DIR, "koshien.sql"), "utf8");
  const koshienSlugs = new Set(
    [...koshien.matchAll(/where slug = '([^']+)'\)/g)].map((m) => m[1]),
  );

  const rows = [];
  for (const f of readdirSync(SUPABASE_DIR)) {
    if (!f.startsWith("schools_") || !f.endsWith(".sql")) continue;
    const text = readFileSync(path.join(SUPABASE_DIR, f), "utf8");
    const re = /^\s*\('([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      rows.push({
        slug: m[1],
        name: m[2].replace(/''/g, "'"),
        official: m[3].replace(/''/g, "'"),
        koshien: koshienSlugs.has(m[1]),
      });
    }
  }
  return ALL ? rows : rows.filter((s) => s.koshien);
}

/**
 * その学校の写真として使えるファイル名か。
 *
 * `pageimages` が返すのは記事の代表画像で、**校舎写真とは限らない。**
 * 実際に「島根県立出雲商業高等学校」と「松江北高等学校」の代表画像は
 * どちらも `Location map Shimane.svg`（県の位置図）だった。
 * そのまま貼ると、学校の写真のつもりでピンク色の県地図が並ぶ。
 *
 * 校舎の写真がSVGであることはまず無いので、まず拡張子で落とす。
 * 校章・ロゴも（フリーライセンスであっても）校舎写真ではないので外す。
 */
function isLikelyPhoto(file) {
  if (/\.svgz?$/i.test(file)) return false;
  return !/(location map|地図|位置図|校章|emblem|logo|crest|map of|白地図)/i.test(file);
}

/** extmetadata の Artist はHTML。表示に使うので素のテキストにする */
function plainText(html) {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/** SQLの文字列リテラル */
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const schools = loadSchools().slice(0, LIMIT);
  console.log(`対象: ${schools.length} 校${ALL ? "（全校）" : "（甲子園出場校）"}`);

  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const byOfficial = new Map(schools.map((s) => [s.official, s]));

  // ---- 1. 記事 → 画像ファイル名 ----
  const todo = schools.filter((s) => !cache[s.slug]);
  console.log(`メタデータ取得: ${todo.length} 校（${schools.length - todo.length} 校はキャッシュ済み）`);

  /** 学校slug -> File:名 */
  const fileOf = new Map();
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const json = await api({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "pageimages", piprop: "name", pilicense: "free",
      titles: chunk.map((s) => s.official).join("|"),
    });
    // リダイレクトを辿った場合、返るタイトルが元と違う
    const redirects = new Map(
      (json.query?.redirects ?? []).map((r) => [r.to, r.from]),
    );
    for (const p of json.query?.pages ?? []) {
      const original = redirects.get(p.title) ?? p.title;
      const school = byOfficial.get(original) ?? byOfficial.get(p.title);
      if (!school) continue;
      if (p.pageimage) fileOf.set(school.slug, "File:" + p.pageimage);
      else cache[school.slug] = { none: true };
    }
    process.stdout.write(`\r  ${Math.min(i + 50, todo.length)}/${todo.length}`);
  }
  console.log("");

  // ---- 2. ファイル → URL・ライセンス・著作者 ----
  /*
    突き合わせ用にタイトルを正規化する。MediaWiki の応答は元のまま返らない。

      1. 名前空間 … `File:` で問い合わせても `ファイル:` で返る
      2. 区切り   … `Tottori_Higashi.jpg` は `Tottori Higashi.jpg` になる

    どちらかを見落とすと一致せず、**画像が0枚のまま静かに終わる**
    （1で全滅、2でアンダースコアを含むファイルだけ落ちた。両方とも実際に踏んだ）。
  */
  const bare = (title) =>
    title.replace(/^(File|Image|ファイル|画像):/, "").replace(/_/g, " ");

  const slugOfFile = new Map();
  for (const [slug, file] of fileOf) {
    const key = bare(file);
    if (!slugOfFile.has(key)) slugOfFile.set(key, []);
    slugOfFile.get(key).push(slug);
  }

  /*
    **同じ画像を2校以上が使っていたら、それは学校固有の写真ではない。**
    位置図・県の地図・大会のロゴなどが該当する。名前での除外をすり抜けた
    ものも、この重複で落ちる。校舎写真が別の学校と共有されることはない。
  */
  const shared = [];
  const namePattern = [];
  for (const [key, slugs] of [...slugOfFile]) {
    if (!isLikelyPhoto(key)) {
      namePattern.push(`${key}（${slugs.length}校)`);
      slugOfFile.delete(key);
    } else if (slugs.length > 1) {
      shared.push(`${key}（${slugs.length}校）`);
      slugOfFile.delete(key);
    }
  }
  for (const slug of fileOf.keys()) {
    if (![...slugOfFile.values()].some((list) => list.includes(slug))) {
      cache[slug] = { none: true, reason: "校舎写真ではない画像しか無い" };
    }
  }
  if (namePattern.length || shared.length) {
    console.log(`除外: 名前で ${namePattern.length} 件 / 複数校で共有 ${shared.length} 件`);
    for (const s of [...namePattern, ...shared].slice(0, 8)) console.log(`  ${s}`);
  }

  const uniqueFiles = [...slugOfFile.keys()].map((n) => "File:" + n);
  console.log(`ライセンス照会: ${uniqueFiles.length} ファイル`);

  for (let i = 0; i < uniqueFiles.length; i += 25) {
    const json = await api({
      action: "query", format: "json", formatversion: "2",
      prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: String(WIDTH * 2),
      iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl",
      titles: uniqueFiles.slice(i, i + 25).join("|"),
    });
    for (const p of json.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      for (const slug of slugOfFile.get(bare(p.title)) ?? []) {
        cache[slug] = {
          file: p.title,
          thumbUrl: info.thumburl ?? info.url,
          descriptionUrl: info.descriptionurl,
          license: plainText(meta.LicenseShortName?.value) ?? "(不明)",
          artist: plainText(meta.Artist?.value),
        };
      }
    }
    process.stdout.write(`\r  ${Math.min(i + 25, uniqueFiles.length)}/${uniqueFiles.length}`);
  }
  console.log("");
  writeFileSync(CACHE, JSON.stringify(cache, null, 1), "utf8");

  // ---- 3. 画像を取って webp にする ----
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  let downloaded = 0;
  let reused = 0;
  let failed = 0;
  let bytes = 0;
  const unknownLicense = [];
  const excludedLicense = [];
  const noArtist = [];

  for (const school of schools) {
    const entry = cache[school.slug];
    if (!entry || entry.none || !entry.thumbUrl) continue;

    /*
      **ライセンスが判別できない画像は使わない。**
      Commonsのファイルページに機械可読なライセンス情報が無いものが
      2件あった（NCH00.jpg / Gunma-Pref-Maebashi-HighSchool-2015042601.jpg）。
      ja.wikipedia に載っている以上フリーである可能性は高いが、
      **可能性で他人の著作物を使わない。** 記章にフォールバックさせる。
    */
    if (!entry.license || entry.license === "(不明)") {
      unknownLicense.push(school.slug);
      continue;
    }

    /*
      **GFDL単独のものは使わない。**
      GFDLは「複製にライセンス全文を添える」ことを求める。写真1枚のために
      全文を載せる運用は現実的でなく、リンクで済ませると条件を満たさない。
      CC系（BY / BY-SA / CC0）・パブリックドメイン・FAL・Attribution・
      Copyrighted free use は、撮影者＋ライセンス名＋出典リンク＋改変の告知で足りる。
    */
    if (/^GFDL/i.test(entry.license)) {
      excludedLicense.push(`${school.slug}（${entry.license}）`);
      continue;
    }

    const dest = path.join(OUT_DIR, `${school.slug}.webp`);
    if (existsSync(dest)) {
      reused++;
    } else {
      try {
        const buf = await fetchImage(entry.thumbUrl);
        await sharp(buf)
          .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
          .webp({ quality: 80 })
          .toFile(dest);
        downloaded++;
      } catch (e) {
        failed++;
        console.log(`\n  取得失敗 ${school.slug}: ${e.message}`);
        continue;
      }
      await sleep(400);
    }

    bytes += statSync(dest).size;

    if (!entry.artist) noArtist.push(school.slug);

    /*
      帰属表示。CC BY 系は法的義務。
      「縮小・切り抜き」は改変の告知（CC BY-SA 4.0 3(a)(1)(B)）。
    */
    const credit = `${entry.artist ?? "撮影者不明"} / ${entry.license}（縮小・切り抜き）`;

    rows.push(
      `  (${q(school.slug)}, ${q(`/schools/${school.slug}.webp`)}, ${q(credit)}, ${q(entry.descriptionUrl)})`,
    );

    if ((downloaded + reused) % 50 === 0) {
      process.stdout.write(`\r  画像 ${downloaded + reused}/${schools.length}`);
    }
  }
  console.log("");

  // ---- 4. SQL ----
  const sql = `-- ============================================================
-- 学校の写真（schools.image_url / image_credit / image_source_url）
--
-- 出典: ja.wikipedia.org の各学校記事に載っている画像。
-- ja.wikipedia はフェアユースを認めていないため、すべてフリーライセンス。
-- **CC BY 系は帰属表示が法的義務**なので image_credit を必ず一緒に入れる。
-- 画像そのものは public/schools/*.webp（640x480 webp に縮小・切り抜き）。
--
-- このファイルは scripts/build-school-images.mjs が生成する。直接編集しない。
-- 何度流しても同じ結果になる。
--
-- ★ 先に消してから入れ直す ★
--   入れるだけだと、**このファイルから外れた学校の写真がDBに残る。**
--   実際にそうなった: ライセンス不明などで3校を除外して public/ から
--   ファイルを消したのに、DBの image_url が古いまま残り、その3ページが
--   リンク切れになった。消す対象は '/schools/%' に限っているので、
--   手で入れた画像やStorageの画像は巻き添えにならない。
-- ============================================================

begin;

update public.schools
set image_url        = null,
    image_credit     = null,
    image_source_url = null
where image_url like '/schools/%';

update public.schools as s
set image_url        = v.image_url,
    image_credit     = v.image_credit,
    image_source_url = v.image_source_url
from (values
${rows.join(",\n")}
) as v(slug, image_url, image_credit, image_source_url)
where s.slug = v.slug;

commit;
`;
  writeFileSync(SQL_OUT, sql, "utf8");

  console.log("");
  console.log(`新規取得 : ${downloaded} 枚`);
  console.log(`既存を再利用: ${reused} 枚`);
  console.log(`失敗     : ${failed} 枚`);
  console.log(`画像なし : ${schools.filter((s) => cache[s.slug]?.none).length} 校`);
  console.log(`合計容量 : ${(bytes / 1024 / 1024).toFixed(1)} MB（1枚あたり平均 ${Math.round(bytes / Math.max(1, rows.length) / 1024)} KB）`);
  console.log(
    `使えないライセンスで除外: ${excludedLicense.length} 件${excludedLicense.length ? " → " + excludedLicense.join(", ") : ""}`,
  );
  console.log(
    `ライセンス不明で除外: ${unknownLicense.length} 件${unknownLicense.length ? " → " + unknownLicense.slice(0, 5).join(", ") : ""}`,
  );
  console.log(`撮影者不明   : ${noArtist.length} 件`);
  console.log(`書き出し: ${path.relative(ROOT, SQL_OUT)}（${rows.length} 件）`);
}

await main();
